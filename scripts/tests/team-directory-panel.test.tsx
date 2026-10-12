import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

const { JSDOM } = await import('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
const React = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { act, cleanup, render, screen, waitFor } = await import('@testing-library/react');
const { default: TeamDirectoryPanel, TeamDirectoryView, parseTeamMembers } = await import('../../app/components/team-directory-panel');

afterEach(() => cleanup());

function response(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

function teamPage(members: unknown[], next_cursor: string | null = null, can_manage_roles = false) {
  return { members, next_cursor, can_manage_roles };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('team directory renders an accessible loading state with no management or contact controls', () => {
  const markup = requireMarkup({ status: 'loading', members: [] });
  assert.match(markup, /aria-label="Equipe"/);
  assert.match(markup, /role="status"/);
  assert.match(markup, /Carregando equipe/);
  assert.doesNotMatch(markup, /Convidar|Editar|Remover|email|telefone/i);
});

test('team directory presents the empty, denied, and error states with appropriate announcements', () => {
  assert.match(requireMarkup({ status: 'empty', members: [] }), /Nenhuma pessoa cadastrada/);
  const denied = requireMarkup({ status: 'denied', members: [] });
  assert.match(denied, /role="status"/);
  assert.match(denied, /não tem acesso/);
  const error = requireMarkup({ status: 'error', members: [] });
  assert.match(error, /role="alert"/);
  assert.match(error, /Não foi possível carregar/);
});

test('roster renders only display names and translated roles, ignoring contact fields', () => {
  const members = parseTeamMembers([{ user_id: 'u-1', display_name: '  Ana Lima ', role: 'coordinator', email: 'ana@example.test', phone: '+5511999999999' }]);
  const markup = requireMarkup({ status: 'ready', members });
  assert.match(markup, /Ana Lima/);
  assert.match(markup, /Coordenador\(a\)/);
  assert.match(markup, /1 pessoa/);
  assert.doesNotMatch(markup, /ana@example\.test|5511999999999|Convidar|Editar|Remover/);
  assert.throws(() => parseTeamMembers([{ user_id: 'u-2', display_name: 'Beatriz', role: 'unknown' }]), /Resposta inválida/);
});

test('mounted panel sends JWT and organization header and ignores the previous organization response', async () => {
  const calls: Array<{ url: string; init?: RequestInit; result: ReturnType<typeof deferred<ReturnType<typeof response>>> }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const result = deferred<ReturnType<typeof response>>();
    calls.push({ url: String(input), init, result });
    return result.promise as Promise<Response>;
  }) as typeof fetch;
  try {
    const getAccessToken = async () => 'test-jwt-token';
    const view = render(React.createElement(TeamDirectoryPanel, { organizationId: 'org-a', getAccessToken }));
    await waitFor(() => assert.equal(calls.length, 1));
    const firstHeaders = new Headers(calls[0].init?.headers);
    assert.match(calls[0].url, /\/team\/members\?limit=50$/);
    assert.equal(calls[0].init?.method, 'GET');
    assert.equal(firstHeaders.get('Authorization'), 'Bearer test-jwt-token');
    assert.equal(firstHeaders.get('X-FisioZap-Organization-Id'), 'org-a');

    view.rerender(React.createElement(TeamDirectoryPanel, { organizationId: 'org-b', getAccessToken }));
    await waitFor(() => assert.equal(calls.length, 2));
    assert.equal(calls[0].init?.signal?.aborted, true);
    assert.equal(new Headers(calls[1].init?.headers).get('X-FisioZap-Organization-Id'), 'org-b');

    await act(async () => calls[1].result.resolve(response(200, teamPage([{ user_id: 'b1', display_name: 'Beatriz', role: 'professional' }]))));
    assert.ok(screen.getByText('Beatriz'));
    await act(async () => calls[0].result.resolve(response(200, teamPage([{ user_id: 'a1', display_name: 'Ana antiga', role: 'owner' }]))));
    assert.ok(screen.getByText('Beatriz'));
    assert.equal(screen.queryByText('Ana antiga'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mounted panel renders server access denied and request failure states', async () => {
  const originalFetch = globalThis.fetch;
  let status = 403;
  globalThis.fetch = (async () => response(status, { error: 'forbidden' })) as unknown as typeof fetch;
  try {
    const getAccessToken = async () => 'test-jwt-token';
    const view = render(React.createElement(TeamDirectoryPanel, { organizationId: 'org-a', getAccessToken }));
    assert.ok(await screen.findByText(/não tem acesso à lista da equipe/));
    status = 500;
    view.rerender(React.createElement(TeamDirectoryPanel, { organizationId: 'org-b', getAccessToken }));
    assert.ok(await screen.findByRole('alert'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('owner role controls require server capability even when the profile role is owner', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => response(200, teamPage([{ user_id: 'u-1', display_name: 'Ana Lima', role: 'professional' }], null, false))) as unknown as typeof fetch;
  try {
    render(React.createElement(TeamDirectoryPanel, { organizationId: 'org-a', role: 'owner', getAccessToken: async () => 'jwt' }));
    await screen.findByText('Ana Lima');
    assert.equal(screen.queryByRole('combobox'), null);
    assert.match(document.body.textContent ?? '', /Lista somente para consulta/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('load more follows cursor order, removes duplicate users, and hides the action on the last page', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const firstCursor = '11111111-1111-4111-8111-111111111111';
  const secondCursor = '22222222-2222-4222-8222-222222222222';
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), init });
    if (calls.length === 1) return response(200, teamPage([
      { user_id: 'u-a', display_name: 'Ana', role: 'professional' },
      { user_id: 'u-b', display_name: 'Beatriz', role: 'professional' },
    ], firstCursor, false));
    if (calls.length === 2) return response(200, teamPage([
      { user_id: 'u-b', display_name: 'Beatriz duplicada', role: 'professional' },
      { user_id: 'u-c', display_name: 'Caio', role: 'professional' },
    ], secondCursor, false));
    return response(200, teamPage([{ user_id: 'u-d', display_name: 'Dora', role: 'professional' }], null, false));
  }) as typeof fetch;
  try {
    render(React.createElement(TeamDirectoryPanel, { organizationId: 'org-a', role: 'owner', getAccessToken: async () => 'jwt' }));
    await screen.findByText('Ana');
    assert.ok(screen.getByRole('button', { name: 'Carregar mais' }));
    await act(async () => { screen.getByRole('button', { name: 'Carregar mais' }).click(); });
    await screen.findByText('Caio');
    assert.match(calls[0].url, /\/team\/members\?limit=50$/);
    assert.match(calls[1].url, new RegExp(`cursor=${firstCursor}$`));
    assert.deepEqual(Array.from(document.querySelectorAll('.team-member-details strong')).map((item) => item.textContent), ['Ana', 'Beatriz', 'Caio']);
    assert.match(document.body.textContent ?? '', /3 pessoas carregadas/);
    await act(async () => { screen.getByRole('button', { name: 'Carregar mais' }).click(); });
    await screen.findByText('Dora');
    assert.match(calls[2].url, new RegExp(`cursor=${secondCursor}$`));
    assert.equal(screen.queryByRole('button', { name: 'Carregar mais' }), null);
    assert.match(document.body.textContent ?? '', /4 pessoas/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('page failure retains loaded members and offers a retry', async () => {
  const originalFetch = globalThis.fetch;
  const cursor = '33333333-3333-4333-8333-333333333333';
  let pageAttempts = 0;
  globalThis.fetch = (async (input, init) => {
    if (!String(input).includes('cursor=') && pageAttempts === 0) return response(200, teamPage([{ user_id: 'u-a', display_name: 'Ana', role: 'professional' }], cursor));
    pageAttempts += 1;
    if (pageAttempts === 1) return response(503, { error: 'offline' });
    return response(200, teamPage([{ user_id: 'u-b', display_name: 'Beatriz', role: 'professional' }], null));
  }) as typeof fetch;
  try {
    render(React.createElement(TeamDirectoryPanel, { organizationId: 'org-a', getAccessToken: async () => 'jwt' }));
    await screen.findByText('Ana');
    await act(async () => { screen.getByRole('button', { name: 'Carregar mais' }).click(); });
    assert.ok(await screen.findByRole('alert'));
    assert.ok(screen.getByText('Ana'));
    assert.equal(screen.queryByText(/Nenhuma pessoa/), null);
    await act(async () => { screen.getByRole('button', { name: 'Tentar novamente' }).click(); });
    assert.ok(await screen.findByText('Beatriz'));
    assert.equal(screen.queryByRole('alert'), null);
    assert.deepEqual(Array.from(document.querySelectorAll('.team-member-details strong')).map((item) => item.textContent), ['Ana', 'Beatriz']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a stale organization response.json result cannot replace the new organization', async () => {
  const originalFetch = globalThis.fetch;
  const staleJson = deferred<unknown>();
  let staleBodyPending = false;
  globalThis.fetch = (async (_input, init) => {
    const orgId = new Headers(init?.headers).get('X-FisioZap-Organization-Id');
    if (orgId === 'org-a') return { status: 200, ok: true, json: () => { staleBodyPending = true; return staleJson.promise; } } as Response;
    return response(200, teamPage([{ user_id: 'u-b', display_name: 'Beatriz', role: 'professional' }]));
  }) as typeof fetch;
  try {
    const props = { organizationId: 'org-a', getAccessToken: async () => 'jwt' };
    const view = render(React.createElement(TeamDirectoryPanel, props));
    await waitFor(() => assert.equal(staleBodyPending, true));
    view.rerender(React.createElement(TeamDirectoryPanel, { ...props, organizationId: 'org-b' }));
    assert.ok(await screen.findByText('Beatriz'));
    await act(async () => staleJson.resolve(teamPage([{ user_id: 'u-a', display_name: 'Ana antiga', role: 'owner' }])));
    assert.ok(screen.getByText('Beatriz'));
    assert.equal(screen.queryByText('Ana antiga'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('owner confirms a role change with PATCH and refreshes the roster; coordinator cannot edit', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), init });
    if (init?.method === 'PATCH') return response(200, { member: { user_id: 'u-1', role: 'coordinator' } });
    return response(200, teamPage([
      { user_id: 'u-1', display_name: 'Ana Lima', role: calls.some((call) => call.init?.method === 'PATCH') ? 'coordinator' : 'professional' },
      { user_id: 'u-owner', display_name: 'Dona da organização', role: 'owner' },
    ], null, true));
  }) as typeof fetch;
  try {
    const props = { organizationId: 'org-a', role: 'owner' as const, getAccessToken: async () => 'jwt-role-token' };
    const view = render(React.createElement(TeamDirectoryPanel, props));
    await screen.findByText('Ana Lima');
    assert.equal(screen.queryByRole('combobox', { name: 'Função de Dona da organização' }), null);
    const select = screen.getByRole('combobox', { name: 'Função de Ana Lima' });
    await act(async () => { (select as HTMLSelectElement).value = 'coordinator'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    await act(async () => { screen.getByRole('button', { name: 'Salvar' }).click(); });
    assert.ok(screen.getByText(/Alterar função para Coordenador/));
    assert.equal(calls.filter((call) => call.init?.method === 'PATCH').length, 0);
    await act(async () => { screen.getByRole('button', { name: 'Confirmar alteração' }).click(); });
    await waitFor(() => assert.equal(calls.filter((call) => call.init?.method === 'PATCH').length, 1));
    const patchCall = calls.find((call) => call.init?.method === 'PATCH')!;
    assert.match(patchCall.url, /\/team\/members\/u-1\/role$/);
    const headers = new Headers(patchCall.init?.headers);
    assert.equal(headers.get('Authorization'), 'Bearer jwt-role-token');
    assert.equal(headers.get('X-FisioZap-Organization-Id'), 'org-a');
    assert.deepEqual(JSON.parse(String(patchCall.init?.body)), { role: 'coordinator' });
    await waitFor(() => assert.equal(calls.filter((call) => call.init?.method === 'GET').length, 2));
    await waitFor(() => assert.equal((screen.getByRole('combobox', { name: 'Função de Ana Lima' }) as HTMLSelectElement).value, 'coordinator'));

    view.rerender(React.createElement(TeamDirectoryPanel, { ...props, role: 'coordinator' }));
    await waitFor(() => assert.ok(screen.getByText('Ana Lima')));
    assert.equal(screen.queryByRole('combobox'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('owner can cancel a draft and sees an announced error when the role update fails', async () => {
  const originalFetch = globalThis.fetch;
  let failPatch = false;
  let patchCount = 0;
  globalThis.fetch = (async (_input, init) => {
    if (init?.method === 'PATCH') { patchCount += 1; return response(503, { error: failPatch ? 'internal' : '' }); }
    return response(200, teamPage([{ user_id: 'u-1', display_name: 'Ana Lima', role: 'professional' }], null, true));
  }) as typeof fetch;
  try {
    render(React.createElement(TeamDirectoryPanel, { organizationId: 'org-a', role: 'owner', getAccessToken: async () => 'jwt' }));
    await screen.findByText('Ana Lima');
    const select = screen.getByRole('combobox', { name: 'Função de Ana Lima' }) as HTMLSelectElement;
    await act(async () => { select.value = 'administrative'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    await act(async () => { screen.getByRole('button', { name: 'Cancelar' }).click(); });
    assert.equal(select.value, 'professional');
    assert.equal(patchCount, 0);
    await act(async () => { select.value = 'coordinator'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    await act(async () => { screen.getByRole('button', { name: 'Salvar' }).click(); });
    failPatch = true;
    await act(async () => { screen.getByRole('button', { name: 'Confirmar alteração' }).click(); });
    assert.ok(await screen.findByRole('alert'));
    assert.equal((screen.getByRole('combobox', { name: 'Função de Ana Lima' }) as HTMLSelectElement).value, 'coordinator');
    assert.equal(patchCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a role response from a previous organization is ignored', async () => {
  const originalFetch = globalThis.fetch;
  const patchResult = deferred<ReturnType<typeof response>>();
  let patchOrg: string | null = null;
  globalThis.fetch = (async (input, init) => {
    if (init?.method === 'PATCH') { patchOrg = new Headers(init.headers).get('X-FisioZap-Organization-Id'); return patchResult.promise as Promise<Response>; }
    const orgId = new Headers(init?.headers).get('X-FisioZap-Organization-Id');
    return response(200, teamPage([{ user_id: orgId === 'org-a' ? 'u-a' : 'u-b', display_name: orgId === 'org-a' ? 'Ana Lima' : 'Beatriz', role: 'professional' }], null, true));
  }) as typeof fetch;
  try {
    const props = { organizationId: 'org-a', role: 'owner' as const, getAccessToken: async () => 'jwt' };
    const view = render(React.createElement(TeamDirectoryPanel, props));
    await screen.findByText('Ana Lima');
    const select = screen.getByRole('combobox', { name: 'Função de Ana Lima' }) as HTMLSelectElement;
    await act(async () => { select.value = 'coordinator'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    await act(async () => { screen.getByRole('button', { name: 'Salvar' }).click(); });
    await act(async () => { screen.getByRole('button', { name: 'Confirmar alteração' }).click(); });
    await waitFor(() => assert.equal(patchOrg, 'org-a'));
    view.rerender(React.createElement(TeamDirectoryPanel, { ...props, organizationId: 'org-b' }));
    await screen.findByText('Beatriz');
    await act(async () => patchResult.resolve(response(503, { error: 'old organization error' })));
    assert.ok(screen.getByText('Beatriz'));
    assert.equal(screen.queryByRole('alert'), null);
    assert.equal(screen.queryByText('Ana Lima'), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('directory renders the loaded count for a complete roster', () => {
  const members = Array.from({ length: 200 }, (_, index) => ({ user_id: `u-${index}`, display_name: `Pessoa ${index}`, role: 'professional' as const }));
  assert.match(requireMarkup({ status: 'ready', members }), /200 pessoas/);
});

function requireMarkup(state: Parameters<typeof TeamDirectoryView>[0]['state']) {
  // Keep the static state assertions independent from client effects.
  return renderToStaticMarkup(React.createElement(TeamDirectoryView, { state }));
}
