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
    assert.match(calls[0].url, /\/team\/members$/);
    assert.equal(calls[0].init?.method, 'GET');
    assert.equal(firstHeaders.get('Authorization'), 'Bearer test-jwt-token');
    assert.equal(firstHeaders.get('X-FisioZap-Organization-Id'), 'org-a');

    view.rerender(React.createElement(TeamDirectoryPanel, { organizationId: 'org-b', getAccessToken }));
    await waitFor(() => assert.equal(calls.length, 2));
    assert.equal(calls[0].init?.signal?.aborted, true);
    assert.equal(new Headers(calls[1].init?.headers).get('X-FisioZap-Organization-Id'), 'org-b');

    await act(async () => calls[1].result.resolve(response(200, { members: [{ user_id: 'b1', display_name: 'Beatriz', role: 'professional' }] })));
    assert.ok(screen.getByText('Beatriz'));
    await act(async () => calls[0].result.resolve(response(200, { members: [{ user_id: 'a1', display_name: 'Ana antiga', role: 'owner' }] })));
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

test('directory indicates when the endpoint cap of 200 members is reached', () => {
  const members = Array.from({ length: 200 }, (_, index) => ({ user_id: `u-${index}`, display_name: `Pessoa ${index}`, role: 'professional' as const }));
  assert.match(requireMarkup({ status: 'ready', members }), /Até 200 pessoas/);
});

function requireMarkup(state: Parameters<typeof TeamDirectoryView>[0]['state']) {
  // Keep the static state assertions independent from client effects.
  return renderToStaticMarkup(React.createElement(TeamDirectoryView, { state }));
}
