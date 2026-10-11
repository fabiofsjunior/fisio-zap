import assert from 'node:assert/strict';
import { test } from 'node:test';
const React = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { default: ProfessionalDocumentsPanel, expiryState, todayUTC } = await import('../../app/components/professional-documents-panel');
const { default: NotificationsPanel, formatDocumentExpiryDate } = await import('../../app/components/notifications-panel');

test('renders accessible professional document fields and loading state without file upload', () => {
  const markup = renderToStaticMarkup(React.createElement(ProfessionalDocumentsPanel, { organizationId: 'org-test' }));

  assert.match(markup, /aria-label="Documentos profissionais"/);
  assert.match(markup, /Registros e vencimentos/);
  assert.match(markup, /Nome do documento/);
  assert.match(markup, /Data de vencimento/);
  assert.match(markup, /role="status"/);
  assert.doesNotMatch(markup, /type="file"/);
});

test('notifications panel labels document expiries as informational and starts in an accessible loading state', () => {
  const markup = renderToStaticMarkup(React.createElement(NotificationsPanel, { organizationId: 'org-test' }));

  assert.match(markup, /Documentos a vencer/);
  assert.match(markup, /Consulta informativa · classificação UTC/);
  assert.match(markup, /Consultando vencimentos…/);
  assert.doesNotMatch(markup, /push|lembrete enviado/i);
});

test('formats the server UTC civil expiry date without shifting it to the local timezone', () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'America/Sao_Paulo';
  try {
    assert.equal(formatDocumentExpiryDate('2026-02-01'), '01/02/2026');
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});

test('uses UTC civil day and UTC 30-day cutoff around a UTC−3 midnight', () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = 'America/Sao_Paulo';
  try {
    const instant = new Date('2026-02-01T02:59:59.000Z');
    assert.equal(instant.toLocaleDateString('en-CA'), '2026-01-31');
    const today = todayUTC(instant);
    assert.equal(today, '2026-02-01');

    const document = { id: 'doc-1', organization_id: 'org-1', professional_id: 'user-1', name: 'Registro', document_type: 'registration' as const, status: 'active' as const };
    assert.equal(expiryState({ ...document, expires_on: '2026-01-31' }, today), 'expired');
    assert.equal(expiryState({ ...document, expires_on: '2026-03-03' }, today), 'soon');
    assert.equal(expiryState({ ...document, expires_on: '2026-03-04' }, today), 'valid');
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  }
});
