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

async function documentsApi<T>(organizationId: string, path: string, options: RequestInit = {}): Promise<T> {
  const client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error('Entre novamente para acessar seus documentos.');

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  headers.set('X-FisioZap-Organization-Id', organizationId);
  if (options.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Não foi possível acessar os documentos profissionais.');
  return body as T;
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

  return <section className="module-screen documents-screen" aria-label="Documentos profissionais">
    <div className="panel-heading">
      <div><span className="eyebrow">DOCUMENTOS PROFISSIONAIS</span><h2>Registros e vencimentos</h2><p>Acompanhe seus documentos profissionais e prazos de validade.</p></div>
      <span className="count" aria-label={`${expiringCount} documentos próximos do vencimento`}>{expiringCount} próximos</span>
    </div>

    <div className="documents-summary" aria-label="Resumo dos vencimentos">
      <div className="panel documents-stat"><span>Vencendo em 30 dias</span><strong>{expiringCount}</strong></div>
      <div className="panel documents-stat documents-stat-expired"><span>Vencidos</span><strong>{expiredCount}</strong></div>
    </div>

    <div className="panel documents-privacy"><strong>Somente dados profissionais</strong><p>Cadastre identificação e validade. Não inclua dados clínicos ou de pacientes. O FisioZap não armazena arquivos nesta tela.</p></div>

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
            <div className="documents-actions"><button type="button" className="documents-secondary" onClick={() => beginEditing(document)} disabled={Boolean(updatingId)}>Editar</button>{document.status !== 'archived' ? <button type="button" className="documents-secondary" onClick={() => void updateStatus(document, 'archived')} disabled={updatingId === document.id}>{updatingId === document.id ? 'Atualizando…' : 'Arquivar'}</button> : <button type="button" className="documents-secondary" onClick={() => void updateStatus(document, 'active')} disabled={updatingId === document.id}>{updatingId === document.id ? 'Atualizando…' : 'Reativar'}</button>}</div></>}
          </li>;
        })}
      </ul>}
    </div>
  </section>;
}
