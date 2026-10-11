'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

type ProfessionalDocument = {
  id: string;
  organization_id: string;
  professional_id: string;
  name: string;
  document_type: 'registration' | 'certificate' | 'license' | 'other';
  reference?: string | null;
  expires_on?: string | null;
  status: 'active' | 'archived' | 'expired';
};

type DocumentType = ProfessionalDocument['document_type'];
type DocumentStatus = 'active' | 'archived';
type Filter = 'active' | 'archived' | 'all';
type DocumentFileUIState = {
  selectedFile?: File;
  uploadProgress?: number;
  uploading?: boolean;
  downloading?: boolean;
  uploadedThisSession?: boolean;
  error?: string;
};

export const MAX_PROFESSIONAL_DOCUMENT_FILE_BYTES = 5 * 1024 * 1024;
const allowedFileTypes: Record<string, { mime: string; extensions: string[] }> = {
  'application/pdf': { mime: 'application/pdf', extensions: ['pdf'] },
  'image/jpeg': { mime: 'image/jpeg', extensions: ['jpg', 'jpeg'] },
  'image/png': { mime: 'image/png', extensions: ['png'] },
};

export function validateProfessionalDocumentFile(file: Pick<File, 'name' | 'size' | 'type'>) {
  if (file.size <= 0) return { error: 'O arquivo está vazio.' };
  if (file.size > MAX_PROFESSIONAL_DOCUMENT_FILE_BYTES) return { error: 'O arquivo deve ter no máximo 5 MiB.' };
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const inferred = Object.values(allowedFileTypes).find(type => type.extensions.includes(extension));
  const mime = file.type || inferred?.mime || '';
  const rule = allowedFileTypes[mime];
  if (!rule || !rule.extensions.includes(extension)) {
    return { error: 'Escolha um arquivo PDF, JPEG ou PNG com extensão e tipo correspondentes.' };
  }
  return { mime };
}

function fileSizeLabel(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const typeLabels: Record<DocumentType, string> = {
  registration: 'Registro profissional',
  certificate: 'Certificado',
  license: 'Licença',
  other: 'Outro documento',
};

export function todayUTC(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day, 12));
}

export function expiryState(document: ProfessionalDocument, today: string) {
  if (!document.expires_on || document.status === 'archived') return null;
  if (document.expires_on < today) return 'expired';
  const horizon = new Date(`${today}T00:00:00.000Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 30);
  const cutoff = horizon.toISOString().slice(0, 10);
  if (document.expires_on <= cutoff) return 'soon';
  return 'valid';
}

async function documentsHeaders(organizationId: string, initial?: HeadersInit) {
  const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error('Entre novamente para acessar seus documentos.');

  const headers = new Headers(initial);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  headers.set('X-FisioZap-Organization-Id', organizationId);
  return headers;
}

async function documentsApi<T>(organizationId: string, path: string, options: RequestInit = {}): Promise<T> {
  const headers = await documentsHeaders(organizationId, options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Não foi possível acessar os documentos profissionais.');
  return body as T;
}

function fileApiError(status: number, serverMessage?: string) {
  if (status === 404) return 'Este documento ainda não tem arquivo anexado.';
  if (status === 409) return 'Este documento já possui um arquivo. Baixe o arquivo existente.';
  if (status === 413) return 'O arquivo deve ter no máximo 5 MiB.';
  return serverMessage || 'Não foi possível concluir a operação com o arquivo.';
}

async function uploadDocumentFile(organizationId: string, documentId: string, file: File, mime: string, onProgress: (progress: number) => void) {
  const headers = await documentsHeaders(organizationId, {
    'Content-Type': mime,
    'X-FisioZap-File-Name': encodeURIComponent(file.name),
  });
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/professional-documents/${encodeURIComponent(documentId)}/file`);
    headers.forEach((value, key) => request.setRequestHeader(key, value));
    request.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error('Não foi possível enviar o arquivo. Verifique sua conexão e tente novamente.'));
    request.onabort = () => reject(new Error('O envio do arquivo foi interrompido.'));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
        return;
      }
      let message = '';
      try { message = JSON.parse(request.responseText)?.error || ''; } catch { /* response was not JSON */ }
      reject(new Error(fileApiError(request.status, message)));
    };
    request.send(file);
  });
}

async function downloadDocumentFile(organizationId: string, documentId: string) {
  const headers = await documentsHeaders(organizationId);
  const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/professional-documents/${encodeURIComponent(documentId)}/file`, { headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(fileApiError(response.status, body.error));
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const filename = disposition.match(/filename="([^"]+)"/i)?.[1] || `documento-profissional-${documentId}`;
  const objectUrl = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export default function ProfessionalDocumentsPanel({ organizationId }: { organizationId: string }) {
  const [documents, setDocuments] = useState<ProfessionalDocument[]>([]);
  const [filter, setFilter] = useState<Filter>('active');
  const [name, setName] = useState('');
  const [documentType, setDocumentType] = useState<DocumentType>('registration');
  const [reference, setReference] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<DocumentType>('registration');
  const [editReference, setEditReference] = useState('');
  const [editExpiresOn, setEditExpiresOn] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [documentFileUI, setDocumentFileUI] = useState<Record<string, DocumentFileUIState>>({});
  const requestId = useRef(0);
  const currentOrganization = useRef(organizationId);
  currentOrganization.current = organizationId;

  const refresh = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    setError('');
    setLoadError(false);
    try {
      const result = await documentsApi<{ documents: ProfessionalDocument[] }>(organizationId, '/professional-documents');
      if (request !== requestId.current || currentOrganization.current !== organizationId) return;
      setDocuments(Array.isArray(result.documents) ? result.documents : []);
    } catch (cause) {
      if (request === requestId.current && currentOrganization.current === organizationId) {
        setError(cause instanceof Error ? cause.message : 'Falha ao carregar seus documentos.');
        setLoadError(true);
      }
    } finally {
      if (request === requestId.current && currentOrganization.current === organizationId) setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void refresh();
    return () => { requestId.current += 1; };
  }, [refresh]);

  const visibleDocuments = useMemo(() => documents.filter(document => filter === 'all' || (filter === 'active' ? document.status === 'active' || document.status === 'expired' : document.status === 'archived')), [documents, filter]);
  const today = todayUTC();
  const expiringCount = documents.filter(document => expiryState(document, today) === 'soon').length;
  const expiredCount = documents.filter(document => expiryState(document, today) === 'expired').length;

  async function createDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || name.trim().length < 2) return;
    setSaving(true);
    setError('');
    setLoadError(false);
    try {
      await documentsApi<{ document: ProfessionalDocument }>(organizationId, '/professional-documents', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          document_type: documentType,
          reference: reference.trim() || null,
          expires_on: expiresOn || null,
        }),
      });
      setName(''); setDocumentType('registration'); setReference(''); setExpiresOn('');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível cadastrar o documento.');
    } finally { setSaving(false); }
  }

  async function updateStatus(document: ProfessionalDocument, status: DocumentStatus) {
    setUpdatingId(document.id);
    setError('');
    setLoadError(false);
    try {
      const result = await documentsApi<{ document: ProfessionalDocument }>(organizationId, `/professional-documents/${encodeURIComponent(document.id)}`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      if (currentOrganization.current !== organizationId) return;
      setDocuments(current => current.map(item => item.id === document.id ? result.document : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o documento.');
    } finally { setUpdatingId(''); }
  }

  function beginEditing(document: ProfessionalDocument) {
    setEditingId(document.id);
    setEditName(document.name);
    setEditType(document.document_type);
    setEditReference(document.reference || '');
    setEditExpiresOn(document.expires_on || '');
    setError('');
  }

  function cancelEditing() {
    setEditingId('');
    setEditName(''); setEditType('registration'); setEditReference(''); setEditExpiresOn('');
  }

  async function saveDocument(event: React.FormEvent<HTMLFormElement>, document: ProfessionalDocument) {
    event.preventDefault();
    if (updatingId || editName.trim().length < 2) return;
    setUpdatingId(document.id);
    setError('');
    setLoadError(false);
    try {
      const result = await documentsApi<{ document: ProfessionalDocument }>(organizationId, `/professional-documents/${encodeURIComponent(document.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          document_type: editType,
          reference: editReference.trim() || null,
          expires_on: editExpiresOn || null,
        }),
      });
      if (currentOrganization.current !== organizationId) return;
      setDocuments(current => current.map(item => item.id === document.id ? result.document : item));
      cancelEditing();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar as alterações.');
    } finally { setUpdatingId(''); }
  }

  function setDocumentFileState(documentId: string, update: Partial<DocumentFileUIState>) {
    setDocumentFileUI(current => ({ ...current, [documentId]: { ...current[documentId], ...update } }));
  }

  function selectDocumentFile(documentId: string, file?: File) {
    if (!file) return; // Cancelling the native picker keeps any previous choice intact.
    const validation = validateProfessionalDocumentFile(file);
    if (validation.error) {
      setDocumentFileState(documentId, { error: validation.error });
      return;
    }
    setDocumentFileState(documentId, { selectedFile: file, error: undefined });
  }

  async function attachDocumentFile(documentId: string) {
    const fileState = documentFileUI[documentId];
    if (!fileState?.selectedFile || fileState.uploading) return;
    const validation = validateProfessionalDocumentFile(fileState.selectedFile);
    if (validation.error || !validation.mime) {
      setDocumentFileState(documentId, { error: validation.error || 'Tipo de arquivo não aceito.' });
      return;
    }
    setDocumentFileState(documentId, { uploading: true, uploadProgress: 0, error: undefined });
    try {
      await uploadDocumentFile(organizationId, documentId, fileState.selectedFile, validation.mime, progress => {
        setDocumentFileState(documentId, { uploadProgress: progress });
      });
      setDocumentFileState(documentId, { uploading: false, uploadProgress: 100, uploadedThisSession: true, selectedFile: undefined });
    } catch (cause) {
      setDocumentFileState(documentId, { uploading: false, error: cause instanceof Error ? cause.message : 'Não foi possível enviar o arquivo.' });
    }
  }

  async function downloadDocument(documentId: string) {
    if (documentFileUI[documentId]?.downloading) return;
    setDocumentFileState(documentId, { downloading: true, error: undefined });
    try {
      await downloadDocumentFile(organizationId, documentId);
    } catch (cause) {
      setDocumentFileState(documentId, { error: cause instanceof Error ? cause.message : 'Não foi possível baixar o arquivo.' });
    } finally {
      setDocumentFileState(documentId, { downloading: false });
    }
  }

  return <section className="module-screen documents-screen" aria-label="Documentos profissionais">
    <div className="panel-heading">
      <div><span className="eyebrow">DOCUMENTOS PROFISSIONAIS</span><h2>Registros e vencimentos</h2><p>Acompanhe seus documentos profissionais e prazos de validade.</p></div>
      <span className="count" aria-label={`${expiringCount} documentos próximos do vencimento`}>{expiringCount} próximos</span>
    </div>

    <div className="documents-summary" aria-label="Resumo dos vencimentos">
      <div className="panel documents-stat"><span>Vencendo em 30 dias</span><strong>{expiringCount}</strong></div>
      <div className="panel documents-stat documents-stat-expired"><span>Vencidos</span><strong>{expiredCount}</strong></div>
    </div>

    <div className="panel documents-privacy"><strong>Arquivos privados</strong><p>Anexe um PDF, JPEG ou PNG de até 5 MiB por documento. Os arquivos são enviados e baixados com sua sessão autenticada; não inclua dados clínicos ou de pacientes.</p></div>

    {error && <div className="panel documents-error" role="alert"><p>{error}</p>{loadError && <button type="button" className="documents-retry" onClick={() => void refresh()} disabled={loading}>Tentar novamente</button>}</div>}

    <form className="panel documents-form" onSubmit={event => void createDocument(event)}>
      <h3>Novo documento</h3>
      <div className="documents-fields">
        <label>Nome do documento<input value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={120} placeholder="Ex.: Registro profissional" autoComplete="off" /></label>
        <label>Tipo<select value={documentType} onChange={event => setDocumentType(event.target.value as DocumentType)}><option value="registration">Registro profissional</option><option value="certificate">Certificado</option><option value="license">Licença</option><option value="other">Outro</option></select></label>
        <label>Referência <span className="muted">(opcional)</span><input value={reference} onChange={event => setReference(event.target.value)} maxLength={120} placeholder="Número ou identificação" autoComplete="off" /></label>
        <label>Data de vencimento <span className="muted">(opcional)</span><input type="date" value={expiresOn} onChange={event => setExpiresOn(event.target.value)} /></label>
      </div>
      <button type="submit" className="documents-primary" disabled={saving || name.trim().length < 2}>{saving ? 'Salvando…' : 'Adicionar documento'}</button>
    </form>

    <div className="panel documents-list">
      <div className="notification-list-heading"><div><h3>Documentos profissionais</h3><span className="muted">{documents.length} {documents.length === 1 ? 'registro' : 'registros'}</span></div><label>Exibir<select aria-label="Filtrar documentos" value={filter} onChange={event => setFilter(event.target.value as Filter)}><option value="active">Ativos</option><option value="archived">Arquivados</option><option value="all">Todos</option></select></label></div>
      {loading ? <p className="documents-state" role="status">Carregando documentos…</p> : visibleDocuments.length === 0 ? <div className="documents-state"><strong>{filter === 'archived' ? 'Nenhum documento arquivado.' : documents.length === 0 ? 'Sua lista está vazia.' : 'Nenhum documento nesta visualização.'}</strong><p>{documents.length === 0 ? 'Adicione seus registros profissionais, certificados ou licenças para acompanhar os vencimentos.' : 'Altere o filtro para consultar os outros documentos.'}</p></div> : <ul className="documents-items">
        {visibleDocuments.map(document => {
          const state = expiryState(document, today);
          return <li className={`documents-item ${state ? `documents-${state}` : ''}`} key={document.id}>
            {editingId === document.id ? <form className="documents-edit-form" onSubmit={event => void saveDocument(event, document)}>
              <div className="documents-fields">
                <label htmlFor={`edit-document-name-${document.id}`}>Nome do documento<input id={`edit-document-name-${document.id}`} value={editName} onChange={event => setEditName(event.target.value)} required minLength={2} maxLength={120} autoComplete="off" /></label>
                <label htmlFor={`edit-document-type-${document.id}`}>Tipo<select id={`edit-document-type-${document.id}`} value={editType} onChange={event => setEditType(event.target.value as DocumentType)}><option value="registration">Registro profissional</option><option value="certificate">Certificado</option><option value="license">Licença</option><option value="other">Outro</option></select></label>
                <label htmlFor={`edit-document-reference-${document.id}`}>Referência <span className="muted">(opcional)</span><input id={`edit-document-reference-${document.id}`} value={editReference} onChange={event => setEditReference(event.target.value)} maxLength={120} autoComplete="off" /></label>
                <label htmlFor={`edit-document-expiry-${document.id}`}>Data de vencimento <span className="muted">(opcional)</span><input id={`edit-document-expiry-${document.id}`} type="date" value={editExpiresOn} onChange={event => setEditExpiresOn(event.target.value)} /></label>
              </div>
              <div className="documents-actions"><button type="submit" className="documents-primary" disabled={updatingId === document.id || editName.trim().length < 2}>{updatingId === document.id ? 'Salvando…' : 'Salvar alterações'}</button><button type="button" className="documents-secondary" onClick={cancelEditing} disabled={updatingId === document.id}>Cancelar</button></div>
            </form> : <><div className="documents-copy"><div className="documents-title"><strong>{document.name}</strong><span className={`documents-badge ${document.status === 'archived' ? 'badge-archived' : state === 'expired' ? 'badge-expired' : state === 'soon' ? 'badge-soon' : 'badge-active'}`}>{document.status === 'archived' ? 'Arquivado' : state === 'expired' ? 'Vencido' : state === 'soon' ? 'Vence em breve' : 'Ativo'}</span></div>
              <span className="documents-type">{typeLabels[document.document_type] || typeLabels.other}</span>
              {document.reference && <span className="documents-reference">Referência: {document.reference}</span>}
              {document.expires_on && <time className="documents-expiry" dateTime={document.expires_on}>{state === 'expired' ? 'Venceu em' : 'Vencimento'} {formatDate(document.expires_on)}</time>}
            </div>
            <div className="documents-row-tools">
              <div className="documents-actions">
                <button type="button" className="documents-secondary" onClick={() => beginEditing(document)} disabled={Boolean(updatingId)}>Editar</button>
                {document.status !== 'archived' ? <button type="button" className="documents-secondary" onClick={() => void updateStatus(document, 'archived')} disabled={updatingId === document.id}>{updatingId === document.id ? 'Atualizando…' : 'Arquivar'}</button> : <button type="button" className="documents-secondary" onClick={() => void updateStatus(document, 'active')} disabled={updatingId === document.id}>{updatingId === document.id ? 'Atualizando…' : 'Reativar'}</button>}
              </div>
              {(() => {
                const fileState = documentFileUI[document.id] || {};
                const pickerId = `professional-document-file-${document.id}`;
                return <div className="documents-file-tools">
                  <input className="documents-file-input" id={pickerId} type="file" accept=".pdf,application/pdf,.jpg,.jpeg,image/jpeg,.png,image/png" aria-label={`Escolher arquivo para ${document.name}`} onChange={event => { selectDocumentFile(document.id, event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} disabled={Boolean(fileState.uploading || fileState.downloading)} />
                  {!fileState.selectedFile && !fileState.uploadedThisSession && <label className="documents-secondary documents-file-picker" htmlFor={pickerId}>Escolher arquivo</label>}
                  {fileState.selectedFile && <><span className="documents-selected-file">{fileState.selectedFile.name} · {fileSizeLabel(fileState.selectedFile.size)}</span><button type="button" className="documents-primary" onClick={() => void attachDocumentFile(document.id)} disabled={Boolean(fileState.uploading || fileState.downloading)}>{fileState.uploading ? 'Enviando…' : 'Anexar arquivo'}</button><button type="button" className="documents-secondary" onClick={() => setDocumentFileState(document.id, { selectedFile: undefined, error: undefined })} disabled={Boolean(fileState.uploading)}>Cancelar escolha</button></>}
                  <button type="button" className="documents-secondary" onClick={() => void downloadDocument(document.id)} disabled={Boolean(fileState.downloading || fileState.uploading)}>{fileState.downloading ? 'Baixando…' : 'Baixar arquivo'}</button>
                  {fileState.uploadedThisSession && <span className="documents-file-confirmation" role="status">Arquivo enviado nesta sessão.</span>}
                  {fileState.uploading && <div className="documents-upload-progress" role="status"><span>Enviando arquivo… {fileState.uploadProgress ?? 0}%</span><progress aria-label={`Envio de ${fileState.selectedFile?.name || 'arquivo'}`} max="100" value={fileState.uploadProgress ?? 0} /></div>}
                  {fileState.error && <p className="documents-file-error" role="alert">{fileState.error}</p>}
                </div>;
              })()}
            </div></>}
          </li>;
        })}
      </ul>}
    </div>
  </section>;
}
