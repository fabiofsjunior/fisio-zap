import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { assertLocalSupabaseTestMutations } from './local-supabase-test-guard.mjs';

// This guard must run before constructing any client: the service key below is
// intentionally usable only against an explicitly enabled loopback instance.
assertLocalSupabaseTestMutations();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.FISIOZAP_ADMIN_EMAIL;
const adminPassword = process.env.FISIOZAP_ADMIN_PASSWORD;
const testEmail = process.env.FISIOZAP_TEST_EMAIL;
const testPassword = process.env.FISIOZAP_TEST_PASSWORD;
const orgName = process.env.FISIOZAP_TEST_ORG;

for (const [name, value] of Object.entries({
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  FISIOZAP_ADMIN_EMAIL: adminEmail,
  FISIOZAP_ADMIN_PASSWORD: adminPassword,
  FISIOZAP_TEST_EMAIL: testEmail,
  FISIOZAP_TEST_PASSWORD: testPassword,
  FISIOZAP_TEST_ORG: orgName,
})) {
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
}

const authOptions = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
const admin = createClient(url, serviceKey, authOptions);
const professional = createClient(url, anonKey, authOptions);
const outsider = createClient(url, anonKey, authOptions);
const anonymous = createClient(url, anonKey, authOptions);
const bucket = 'professional-documents';
const suffix = `${Date.now().toString(36)}-${randomUUID()}`;
const syntheticPdf = Buffer.from('%PDF-1.4\n% FisioZap synthetic storage test; no personal data.\n%%EOF\n');
const backendDirectory = fileURLToPath(new URL('../backend/', import.meta.url));

let organizationId;
let foreignOrganizationId;
let outsiderId;
const documentIds = [];
const uploadedPaths = [];
let backendProcess;
let backendBaseUrl;

async function must(promise, label) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

function expectDenied(result, label) {
  if (!result.error) throw new Error(`${label}: a operação deveria ter sido negada.`);
}

async function createDocument(orgId, userId, name) {
  const row = await must(admin.from('professional_documents').insert({
    organization_id: orgId,
    professional_id: userId,
    name,
    document_type: 'certificate',
  }).select('id').single(), `criar fixture ${name}`);
  documentIds.push(row.id);
  return `${orgId}/${row.id}`;
}

async function availableLoopbackPort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function startBackend() {
  const port = await availableLoopbackPort();
  backendBaseUrl = `http://127.0.0.1:${port}`;
  backendProcess = spawn(process.execPath, ['src/index.js'], {
    cwd: backendDirectory,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: String(port),
      FRONTEND_ORIGIN: 'http://localhost:3000',
    },
    stdio: 'ignore',
  });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (backendProcess.exitCode !== null) throw new Error(`Backend local encerrou antes de ficar pronto (código ${backendProcess.exitCode}).`);
    try {
      const response = await fetch(`${backendBaseUrl}/health`, { signal: AbortSignal.timeout(750) });
      if (response.ok) return;
    } catch {
      // The server may need a short moment to initialize its local listener.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Backend local não ficou pronto em 15 segundos.');
}

async function stopBackend() {
  if (!backendProcess || backendProcess.exitCode !== null) return;
  const stopped = new Promise((resolve) => backendProcess.once('exit', resolve));
  backendProcess.kill('SIGTERM');
  const timeout = setTimeout(() => backendProcess.kill('SIGKILL'), 3000);
  await stopped;
  clearTimeout(timeout);
  backendProcess = undefined;
}

async function main() {
  let ownUserId;
  let peerUserId;
  const userList = await must(admin.auth.admin.listUsers({ page: 1, perPage: 1000 }), 'listar contas locais');
  const adminUser = userList.users.find((user) => user.email?.toLowerCase() === adminEmail.toLowerCase());
  const professionalUser = userList.users.find((user) => user.email?.toLowerCase() === testEmail.toLowerCase());
  if (!adminUser || !professionalUser) throw new Error('Contas locais não encontradas. Execute bootstrap-test-accounts.mjs.');
  ownUserId = professionalUser.id;
  peerUserId = adminUser.id;

  try {
    const org = await must(admin.from('organizations').select('id').eq('name', orgName).single(), 'localizar organização de teste');
    organizationId = org.id;

    const foreign = await must(admin.auth.admin.createUser({
      email: `storage-outsider-${suffix}@example.test`,
      password: `FisioZap!${suffix}LocalOnly`,
      email_confirm: true,
    }), 'criar outsider local');
    outsiderId = foreign.user.id;

    const foreignOrg = await must(admin.from('organizations').insert({
      name: `Storage outsider ${suffix}`,
      owner_id: outsiderId,
    }).select('id').single(), 'criar organização estrangeira');
    foreignOrganizationId = foreignOrg.id;
    await must(admin.from('organization_members').insert({
      organization_id: foreignOrganizationId,
      user_id: outsiderId,
      role: 'professional',
    }), 'associar outsider à organização estrangeira');

    const ownPath = await createDocument(organizationId, ownUserId, `Fixture própria ${suffix}`);
    const peerPath = await createDocument(organizationId, peerUserId, `Fixture de colega ${suffix}`);
    const foreignPath = await createDocument(foreignOrganizationId, outsiderId, `Fixture estrangeira ${suffix}`);
    const peerEmptyPath = await createDocument(organizationId, peerUserId, `Fixture de colega sem anexo ${suffix}`);

    const login = await must(professional.auth.signInWithPassword({ email: testEmail, password: testPassword }), 'autenticar profissional via anon key');
    if (!login.session?.access_token) throw new Error('Login profissional não retornou JWT.');
    const outsiderLogin = await must(outsider.auth.signInWithPassword({
      email: `storage-outsider-${suffix}@example.test`,
      password: `FisioZap!${suffix}LocalOnly`,
    }), 'autenticar outsider via anon key');
    if (!outsiderLogin.session?.access_token) throw new Error('Login outsider não retornou JWT.');

    uploadedPaths.push(ownPath);
    expectDenied(await professional.storage.from(bucket).upload(ownPath, syntheticPdf, {
      contentType: 'application/pdf',
      upsert: false,
    }), 'upload direto do JWT autenticado no Storage');
    for (const [path, label] of [[peerPath, 'colega'], [foreignPath, 'outra organização']]) {
      uploadedPaths.push(path);
      await must(admin.storage.from(bucket).upload(path, syntheticPdf, {
        contentType: 'application/pdf', upsert: false,
      }), `criar objeto sintético de ${label} para testar leitura negada`);
    }

    expectDenied(await professional.storage.from(bucket).download(peerPath), 'peer da mesma organização baixar documento do admin');
    expectDenied(await professional.storage.from(bucket).download(foreignPath), 'profissional baixar documento de outra organização');
    uploadedPaths.push(peerEmptyPath);
    expectDenied(await professional.storage.from(bucket).upload(peerEmptyPath, syntheticPdf, {
      contentType: 'application/pdf', upsert: false,
    }), 'profissional anexar arquivo no documento de colega');

    const forgedPath = `${organizationId}/${randomUUID()}`;
    uploadedPaths.push(forgedPath);
    expectDenied(await professional.storage.from(bucket).upload(forgedPath, syntheticPdf, {
      contentType: 'application/pdf', upsert: false,
    }), 'upload em caminho sem registro professional_documents');

    await startBackend();
    const authHeaders = {
      Authorization: `Bearer ${login.session.access_token}`,
      'Content-Type': 'application/pdf',
      'X-FisioZap-File-Name': encodeURIComponent('registro.pdf'),
    };
    const backendUpload = await fetch(`${backendBaseUrl}/professional-documents/${ownPath.split('/')[1]}/file`, {
      method: 'POST', headers: authHeaders, body: syntheticPdf,
    });
    if (backendUpload.status !== 201) {
      const failure = await backendUpload.json().catch(() => ({}));
      throw new Error(`Upload HTTP autenticado pelo backend falhou (HTTP ${backendUpload.status}; ${String(failure.error || 'sem erro estruturado').slice(0, 120)}).`);
    }
    const uploadBody = await backendUpload.json();
    if (uploadBody.file?.available !== true) throw new Error('Backend não confirmou o anexo privado enviado.');
    expectDenied(await outsider.storage.from(bucket).download(ownPath), 'outsider baixar documento existente da organização de teste');
    expectDenied(await anonymous.storage.from(bucket).download(ownPath), 'usuário anônimo baixar documento privado existente');

    const backendDownload = await fetch(`${backendBaseUrl}/professional-documents/${ownPath.split('/')[1]}/file`, {
      headers: { Authorization: authHeaders.Authorization },
    });
    if (!backendDownload.ok) throw new Error(`Download HTTP autenticado pelo backend falhou (HTTP ${backendDownload.status}).`);
    const downloadedBytes = Buffer.from(await backendDownload.arrayBuffer());
    if (!downloadedBytes.equals(syntheticPdf)) throw new Error('PDF baixado pelo backend difere dos bytes sintéticos enviados.');
    if (backendDownload.headers.get('cache-control') !== 'private, no-store, max-age=0') throw new Error('Download do backend não definiu cache privado sem armazenamento.');

    const peerHttpRead = await fetch(`${backendBaseUrl}/professional-documents/${peerPath.split('/')[1]}/file`, {
      headers: { Authorization: authHeaders.Authorization },
    });
    if (peerHttpRead.status !== 404) throw new Error(`Backend permitiu leitura de documento de peer (HTTP ${peerHttpRead.status}).`);
    const foreignHttpRead = await fetch(`${backendBaseUrl}/professional-documents/${foreignPath.split('/')[1]}/file`, {
      headers: { Authorization: authHeaders.Authorization },
    });
    if (foreignHttpRead.status !== 404) throw new Error(`Backend permitiu leitura cross-org (HTTP ${foreignHttpRead.status}).`);
    const outsiderHttpRead = await fetch(`${backendBaseUrl}/professional-documents/${ownPath.split('/')[1]}/file`, {
      headers: { Authorization: `Bearer ${outsiderLogin.session.access_token}` },
    });
    if (outsiderHttpRead.status !== 404) throw new Error(`Backend permitiu leitura pelo outsider (HTTP ${outsiderHttpRead.status}).`);

    const replacement = await fetch(`${backendBaseUrl}/professional-documents/${ownPath.split('/')[1]}/file`, {
      method: 'POST', headers: authHeaders, body: Buffer.from('%PDF-1.4 replacement'),
    });
    if (replacement.status !== 409) throw new Error(`Backend não bloqueou substituição do arquivo (HTTP ${replacement.status}).`);

    const invalidMime = await fetch(`${backendBaseUrl}/professional-documents/${ownPath.split('/')[1]}/file`, {
      method: 'POST', headers: { ...authHeaders, 'Content-Type': 'text/plain', 'X-FisioZap-File-Name': encodeURIComponent('registro.txt') }, body: Buffer.from('not a PDF'),
    });
    if (invalidMime.status !== 415) throw new Error(`Backend não bloqueou MIME inválido (HTTP ${invalidMime.status}).`);

    const forgedSignature = await fetch(`${backendBaseUrl}/professional-documents/${peerEmptyPath.split('/')[1]}/file`, {
      method: 'POST', headers: authHeaders, body: Buffer.from('not actually a PDF'),
    });
    if (forgedSignature.status !== 404) throw new Error(`Backend permitiu documento de colega (HTTP ${forgedSignature.status}).`);
    const ownEmptyPath = await createDocument(organizationId, ownUserId, `Fixture própria vazia ${suffix}`);
    const invalidSignature = await fetch(`${backendBaseUrl}/professional-documents/${ownEmptyPath.split('/')[1]}/file`, {
      method: 'POST', headers: authHeaders, body: Buffer.from('not actually a PDF'),
    });
    if (invalidSignature.status !== 422) throw new Error(`Backend não bloqueou assinatura PDF inválida (HTTP ${invalidSignature.status}).`);

    const oversized = await fetch(`${backendBaseUrl}/professional-documents/${ownPath.split('/')[1]}/file`, {
      method: 'POST', headers: authHeaders, body: Buffer.alloc(5 * 1024 * 1024 + 1, 0x41),
    });
    if (oversized.status !== 413) throw new Error(`Backend não bloqueou arquivo acima de 5 MiB (HTTP ${oversized.status}).`);

    expectDenied(await professional.storage.from(bucket).upload(ownPath, Buffer.from('%PDF replacement'), {
      contentType: 'application/pdf', upsert: true,
    }), 'substituir arquivo existente');

    console.log('SUPABASE STORAGE PROFESSIONAL DOCUMENTS TEST OK');
    console.log('Upload direto via JWT bloqueado; backend autenticado salvou e serviu PDF privado.');
    console.log('Peer, outsider, outra organização, anon, path forjado, replace, MIME inválido e >5 MiB bloqueados.');
  } finally {
    await stopBackend();
    for (const client of [professional, outsider, anonymous]) {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) console.warn(`Falha ao encerrar sessão local de teste: ${error.message}`);
    }
    if (uploadedPaths.length) {
      const { error } = await admin.storage.from(bucket).remove(uploadedPaths);
      if (error) throw new Error(`Falha ao limpar objetos Storage sintéticos: ${error.message}`);
    }
    if (documentIds.length) {
      const { error } = await admin.from('professional_documents').delete().in('id', documentIds);
      if (error) throw new Error(`Falha ao limpar metadados sintéticos: ${error.message}`);
    }
    if (foreignOrganizationId) {
      const { error } = await admin.from('organizations').delete().eq('id', foreignOrganizationId);
      if (error) throw new Error(`Falha ao limpar organização sintética: ${error.message}`);
    }
    if (outsiderId) {
      const { error } = await admin.auth.admin.deleteUser(outsiderId);
      if (error) throw new Error(`Falha ao remover outsider sintético: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(`SUPABASE STORAGE TEST FALHOU: ${error.message}`);
  process.exit(1);
});
