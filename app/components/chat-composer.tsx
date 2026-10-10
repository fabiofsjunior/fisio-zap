'use client';

import React, { useEffect, useId, useRef, useState } from 'react';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_RECORDING_MS = 120_000;
const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  webm: 'audio/webm', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', mp3: 'audio/mpeg', mp4: 'audio/mp4', m4a: 'audio/mp4',
};

type ChatComposerProps = {
  onSend: (text: string, file?: File) => Promise<void>;
  sending: boolean;
  maxAttachmentBytes?: number;
  transcriptionStatus?: 'checking' | 'enabled' | 'disabled' | 'error';
  onTranscribe?: (file: File) => Promise<string>;
  onCancelTranscription?: () => void;
  transcribing?: boolean;
};

type RecordingSession = {
  recorder: MediaRecorder;
  stream: MediaStream;
  startedAt: number;
  timer: number | null;
  clock: number | null;
  releaseTimer: number | null;
  chunks: Blob[];
  chunkBytes: number;
  cancelled: boolean;
};

export function getChatFileMimeType(file: Pick<File, 'name' | 'type'>): string {
  const mime = file.type.split(';', 1)[0].trim().toLowerCase();
  if (mime) return ACCEPTED_MIME_TYPES.has(mime) ? mime : '';
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? '';
}

export function formatChatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

function stopTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function clearSessionTimers(session: RecordingSession) {
  if (session.timer !== null) window.clearTimeout(session.timer);
  if (session.clock !== null) window.clearInterval(session.clock);
  if (session.releaseTimer !== null) window.clearTimeout(session.releaseTimer);
  session.timer = null;
  session.clock = null;
  session.releaseTimer = null;
}

function recordingErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Permita o acesso ao microfone nas configurações do navegador e tente novamente.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Nenhum microfone foi encontrado neste dispositivo.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'O microfone está ocupado ou indisponível. Feche outros aplicativos que o estejam usando.';
  }
  if (name === 'SecurityError') {
    return 'A gravação precisa de uma conexão segura (HTTPS) ou de localhost.';
  }
  return 'Não foi possível iniciar a gravação. Verifique o microfone e tente novamente.';
}

function recordingExtension(mime: string): string {
  if (mime.startsWith('audio/ogg')) return 'ogg';
  if (mime.startsWith('audio/mp4')) return 'mp4';
  return 'webm';
}

function formatDuration(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function ChatComposer({ onSend, sending, maxAttachmentBytes = MAX_FILE_BYTES, transcriptionStatus = 'disabled', onTranscribe, onCancelTranscription = () => {}, transcribing = false }: ChatComposerProps) {
  const [draft, setDraft] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [permissionPending, setPermissionPending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [finalizingRecording, setFinalizingRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [transcriptionConsentRequested, setTranscriptionConsentRequested] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState('');
  const [transcriptionError, setTranscriptionError] = useState('');
  const inputId = useId();
  const mountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const sessionRef = useRef<RecordingSession | null>(null);
  const inFlightRef = useRef(false);
  const transcriptionRequestIdRef = useRef(0);
  const transcriptionLockRef = useRef(false);
  const cancelTranscriptionRef = useRef(onCancelTranscription);
  cancelTranscriptionRef.current = onCancelTranscription;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      transcriptionRequestIdRef.current += 1;
      cancelTranscriptionRef.current();
      const session = sessionRef.current;
      if (session) {
        session.cancelled = true;
        session.chunks.length = 0;
        session.chunkBytes = 0;
        clearSessionTimers(session);
        try {
          if (session.recorder.state !== 'inactive') session.recorder.stop();
        } catch { /* The stream is still stopped below during unmount. */ }
        stopTracks(session.stream);
        sessionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    transcriptionRequestIdRef.current += 1;
    transcriptionLockRef.current = false;
    if (transcribing) cancelTranscriptionRef.current();
    setTranscriptionConsentRequested(false);
    setTranscriptDraft('');
    setTranscriptionError('');
    return () => {
      transcriptionRequestIdRef.current += 1;
      cancelTranscriptionRef.current();
    };
  }, [selectedFile]);

  useEffect(() => {
    if (!selectedFile || !getChatFileMimeType(selectedFile).startsWith('audio/')) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  function cleanupSessionTimers(session: RecordingSession) {
    if (session.timer !== null) window.clearTimeout(session.timer);
    if (session.clock !== null) window.clearInterval(session.clock);
    if (session.releaseTimer !== null) window.clearTimeout(session.releaseTimer);
    session.timer = null;
    session.clock = null;
    session.releaseTimer = null;
  }

  function clearRecordingUi() {
    if (!mountedRef.current) return;
    setPermissionPending(false);
    setRecording(false);
    setFinalizingRecording(false);
    setElapsedSeconds(0);
  }

  function stopRecording() {
    const session = sessionRef.current;
    if (!session) return;
    cleanupSessionTimers(session);
    setRecording(false);
    setFinalizingRecording(!session.cancelled);
    try {
      if (session.recorder.state !== 'inactive') {
        session.recorder.stop();
        stopTracks(session.stream);
        session.releaseTimer = window.setTimeout(() => {
          if (sessionRef.current === session) {
            const wasCancelled = session.cancelled;
            session.cancelled = true;
            session.chunks.length = 0;
            session.chunkBytes = 0;
            sessionRef.current = null;
            clearRecordingUi();
            if (!wasCancelled && mountedRef.current) setError('A gravação não pôde ser finalizada. Tente novamente.');
          }
        }, 1500);
      }
      else {
        stopTracks(session.stream);
        sessionRef.current = null;
        clearRecordingUi();
      }
    } catch {
      session.cancelled = true;
      session.chunks.length = 0;
      session.chunkBytes = 0;
      stopTracks(session.stream);
      sessionRef.current = null;
      clearRecordingUi();
      setError('A gravação não pôde ser finalizada. Tente novamente.');
    }
  }

  function cancelRecording() {
    requestIdRef.current += 1;
    setPermissionPending(false);
    const session = sessionRef.current;
    if (!session) {
      clearRecordingUi();
      return;
    }
    session.cancelled = true;
    session.chunks.length = 0;
    session.chunkBytes = 0;
    cleanupSessionTimers(session);
    try {
      if (session.recorder.state !== 'inactive') session.recorder.stop();
    } catch { /* Tracks are stopped regardless of recorder state. */ }
    stopTracks(session.stream);
    if (sessionRef.current === session) sessionRef.current = null;
    clearRecordingUi();
  }

  async function startRecording() {
    if (sending || permissionPending || recording || finalizingRecording || selectedFile || maxAttachmentBytes <= 0) return;
    setError('');
    const requestId = ++requestIdRef.current;
    setPermissionPending(true);

    let stream: MediaStream | null = null;
    let session: RecordingSession | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
        throw new Error('UNSUPPORTED_RECORDER');
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        stopTracks(stream);
        return;
      }

      const mimeOptions = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
      const mimeType = mimeOptions.find((type) => window.MediaRecorder.isTypeSupported?.(type)) ?? '';
      const recorder = mimeType ? new window.MediaRecorder(stream, { mimeType }) : new window.MediaRecorder(stream);
      const recordingSession: RecordingSession = {
        recorder, stream, startedAt: Date.now(), timer: null, clock: null, releaseTimer: null,
        chunks: [], chunkBytes: 0, cancelled: false,
      };
      session = recordingSession;
      sessionRef.current = recordingSession;

      recorder.ondataavailable = (event) => {
        if (sessionRef.current !== recordingSession || recordingSession.cancelled || event.data.size === 0) return;
        recordingSession.chunkBytes += event.data.size;
        if (recordingSession.chunkBytes > Math.min(MAX_FILE_BYTES, maxAttachmentBytes)) {
          recordingSession.cancelled = true;
          recordingSession.chunks.length = 0;
          recordingSession.chunkBytes = 0;
          setError(maxAttachmentBytes < MAX_FILE_BYTES
            ? `A gravação ultrapassou os ${formatChatFileSize(maxAttachmentBytes)} restantes nesta sessão.`
            : 'A gravação ultrapassou o limite de 10 MB. Faça uma gravação mais curta.');
          stopRecording();
          return;
        }
        recordingSession.chunks.push(event.data);
      };
      recorder.onerror = () => {
        recordingSession.cancelled = true;
        recordingSession.chunks.length = 0;
        recordingSession.chunkBytes = 0;
        clearSessionTimers(recordingSession);
        stopTracks(stream);
        if (sessionRef.current === recordingSession) {
          sessionRef.current = null;
          clearRecordingUi();
          if (mountedRef.current) setError('Houve uma falha durante a gravação. Tente novamente.');
        }
      };
      recorder.onstop = () => {
        clearSessionTimers(recordingSession);
        stopTracks(stream);
        const isCurrentSession = sessionRef.current === recordingSession;
        if (isCurrentSession) {
          sessionRef.current = null;
          clearRecordingUi();
        }
        if (!isCurrentSession || recordingSession.cancelled || !mountedRef.current) return;

        const type = (recorder.mimeType || mimeType || 'audio/webm').split(';', 1)[0].trim().toLowerCase();
        if (!ACCEPTED_MIME_TYPES.has(type)) {
          recordingSession.chunks.length = 0;
          recordingSession.chunkBytes = 0;
          setError('Este navegador gravou em um formato de áudio não aceito. Anexe um arquivo WebM, Ogg, WAV, MP3 ou MP4.');
          return;
        }
        const blob = new Blob(recordingSession.chunks, { type });
        recordingSession.chunks.length = 0;
        recordingSession.chunkBytes = 0;
        if (!blob.size) {
          setError('A gravação ficou vazia. Grave novamente.');
          return;
        }
        if (blob.size > Math.min(MAX_FILE_BYTES, maxAttachmentBytes)) {
          setError(maxAttachmentBytes < MAX_FILE_BYTES
            ? `A gravação ultrapassou os ${formatChatFileSize(maxAttachmentBytes)} restantes nesta sessão.`
            : 'A gravação ultrapassou o limite de 10 MB. Faça uma gravação mais curta.');
          return;
        }
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = new File([blob], `audio-${stamp}.${recordingExtension(type)}`, { type });
        setSelectedFile(file);
      };

      recorder.start(250);
      setPermissionPending(false);
      setRecording(true);
      recordingSession.clock = window.setInterval(() => {
        if (mountedRef.current && sessionRef.current === recordingSession) setElapsedSeconds(Math.min(120, Math.floor((Date.now() - recordingSession.startedAt) / 1000)));
      }, 250);
      recordingSession.timer = window.setTimeout(() => stopRecording(), MAX_RECORDING_MS);
    } catch (cause) {
      if (session) {
        session.cancelled = true;
        session.chunks.length = 0;
        session.chunkBytes = 0;
        clearSessionTimers(session);
        try {
          if (session.recorder.state !== 'inactive') session.recorder.stop();
        } catch { /* Stop the microphone tracks below even if MediaRecorder fails. */ }
        stopTracks(session.stream);
        if (sessionRef.current === session) sessionRef.current = null;
      } else if (stream) {
        stopTracks(stream);
      }
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setPermissionPending(false);
      if (cause instanceof Error && cause.message === 'UNSUPPORTED_RECORDER') {
        setError('Gravação de áudio não está disponível neste navegador ou dispositivo. Você ainda pode anexar um arquivo de áudio.');
      } else {
        setError(recordingErrorMessage(cause));
      }
    }
  }

  function readSelectedFile(file: File | undefined) {
    if (!file) return;
    const mime = getChatFileMimeType(file);
    if (!mime) {
      setError('Formato não aceito. Use PDF, JPEG, PNG, WebP, WebM, Ogg, WAV, MP3 ou MP4.');
      return;
    }
    if (file.size === 0) {
      setError('O arquivo está vazio. Escolha outro arquivo.');
      return;
    }
    const allowedBytes = Math.min(MAX_FILE_BYTES, maxAttachmentBytes);
    if (file.size > allowedBytes) {
      setError(maxAttachmentBytes < MAX_FILE_BYTES
        ? `Restam ${formatChatFileSize(maxAttachmentBytes)} para anexos nesta sessão.`
        : 'O limite por arquivo é 10 MB. Escolha um arquivo menor.');
      return;
    }
    setError('');
    setSelectedFile(file);
  }

  function cancelTranscription() {
    transcriptionRequestIdRef.current += 1;
    transcriptionLockRef.current = false;
    cancelTranscriptionRef.current();
    setTranscriptionConsentRequested(false);
    setTranscriptionError('');
  }

  async function confirmTranscription() {
    if (!selectedFile || !getChatFileMimeType(selectedFile).startsWith('audio/') || transcriptionStatus !== 'enabled' || transcribing || transcriptionLockRef.current || !onTranscribe) return;
    transcriptionLockRef.current = true;
    const requestId = ++transcriptionRequestIdRef.current;
    setTranscriptionConsentRequested(false);
    setTranscriptionError('');
    try {
      const text = await onTranscribe(selectedFile);
      if (!mountedRef.current || requestId !== transcriptionRequestIdRef.current) return;
      if (!text.trim()) throw new Error('A transcrição não retornou texto.');
      if (text.length > 4000) throw new Error('A transcrição excede o limite de 4.000 caracteres.');
      setTranscriptDraft(text);
    } catch (cause) {
      if (!mountedRef.current || requestId !== transcriptionRequestIdRef.current) return;
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setTranscriptionError(cause instanceof Error ? cause.message : 'Não foi possível transcrever o áudio.');
      }
    } finally {
      if (transcriptionRequestIdRef.current === requestId) transcriptionLockRef.current = false;
    }
  }

  function appendTranscriptToDraft() {
    const transcript = transcriptDraft.trim();
    if (!transcript) return;
    const nextDraft = draft.trim() ? `${draft.trimEnd()}\n${transcript}` : transcript;
    if (nextDraft.length > 4000) {
      setTranscriptionError('A mensagem aceita até 4.000 caracteres. Edite a transcrição antes de adicioná-la.');
      return;
    }
    setDraft(nextDraft);
    setTranscriptDraft('');
    setTranscriptionError('');
  }

  const transcriptToAppend = transcriptDraft.trim();
  const draftWithTranscript = draft.trim() ? `${draft.trimEnd()}\n${transcriptToAppend}` : transcriptToAppend;

  async function sendText() {
    const text = draft.trim();
    if (!text || sending || inFlightRef.current || permissionPending || recording || finalizingRecording) return;
    inFlightRef.current = true;
    if (mountedRef.current) setError('');
    try {
      await onSend(text);
      if (mountedRef.current) setDraft('');
    } catch {
      // Keep the draft available for retry; the shell displays the request error.
    } finally {
      inFlightRef.current = false;
    }
  }

  async function sendFile() {
    if (!selectedFile || sending || inFlightRef.current || permissionPending || recording || finalizingRecording) return;
    inFlightRef.current = true;
    if (mountedRef.current) setError('');
    try {
      await onSend('', selectedFile);
      if (mountedRef.current) setSelectedFile(null);
    } catch {
      // Keep the selected file and text draft available for retry.
    } finally {
      inFlightRef.current = false;
    }
  }

  const controlsBusy = sending || permissionPending || recording || finalizingRecording || transcribing;
  const recordingStatus = permissionPending
    ? 'Aguardando autorização para usar o microfone…'
    : recording
      ? `Gravando áudio · ${formatDuration(elapsedSeconds)} de 02:00`
      : finalizingRecording
        ? 'Finalizando gravação…'
        : '';

  return (
    <div className="chat-composer" aria-label="Enviar mensagem ou anexo">
      {(permissionPending || recording || finalizingRecording) && (
        <div className="chat-recording-status" role="status" aria-live="polite">
          <span>{recordingStatus}</span>
          {(permissionPending || recording) && <button type="button" className="chat-composer-secondary" onClick={cancelRecording}>Cancelar gravação</button>}
          {recording && <button type="button" className="chat-composer-secondary" onClick={stopRecording}>Parar</button>}
        </div>
      )}

      {error && <p className="chat-composer-error" role="alert">{error}</p>}

      {selectedFile && (
        <div className="chat-file-preview" aria-label="Arquivo selecionado">
          <div className="chat-file-details">
            <div className="chat-file-name"><strong title={selectedFile.name}>{selectedFile.name}</strong><span>{formatChatFileSize(selectedFile.size)}</span></div>
            <button type="button" className="chat-composer-secondary" onClick={() => setSelectedFile(null)} disabled={controlsBusy}>Remover arquivo</button>
          </div>
          {getChatFileMimeType(selectedFile).startsWith('audio/') && previewUrl && <audio controls preload="metadata" src={previewUrl} aria-label={`Prévia de áudio: ${selectedFile.name}`} />}
          <p>O arquivo ficará disponível apenas nesta sessão e será enviado separadamente. {getChatFileMimeType(selectedFile).startsWith('audio/') ? 'A transcrição é opcional e só começa após sua confirmação.' : 'O assistente não analisa arquivos.'}</p>
          {getChatFileMimeType(selectedFile).startsWith('audio/') && transcriptionStatus === 'enabled' && !transcriptDraft && !transcribing && (
            <button type="button" className="chat-composer-secondary" onClick={() => { setTranscriptionError(''); setTranscriptionConsentRequested(true); }} disabled={controlsBusy}>Transcrever</button>
          )}
          {getChatFileMimeType(selectedFile).startsWith('audio/') && transcriptionStatus === 'checking' && <small role="status">Verificando disponibilidade da transcrição…</small>}
          {getChatFileMimeType(selectedFile).startsWith('audio/') && transcriptionStatus === 'disabled' && <small role="status">Transcrição indisponível no momento. Você ainda pode enviar o áudio.</small>}
          {getChatFileMimeType(selectedFile).startsWith('audio/') && transcriptionStatus === 'error' && <small role="status">Não foi possível verificar a disponibilidade. A transcrição está indisponível agora; o áudio pode ser enviado normalmente.</small>}
          {transcriptionConsentRequested && <div className="chat-transcription-consent" role="group" aria-label="Confirmação de transcrição">
            <p>Ao confirmar, o áudio será enviado à OpenAI para gerar uma transcrição. Este recurso gera cobrança conforme o uso. Use apenas áudio fictício em homologação. O texto ficará para sua revisão e não será enviado ao assistente até você decidir.</p>
            <div className="chat-composer-actions">
              <button type="button" className="chat-composer-primary" onClick={() => void confirmTranscription()} disabled={controlsBusy}>Confirmar e transcrever</button>
              <button type="button" className="chat-composer-secondary" onClick={() => setTranscriptionConsentRequested(false)} disabled={controlsBusy}>Cancelar</button>
            </div>
          </div>}
          {transcribing && <div className="chat-recording-status" role="status" aria-live="polite"><span>Transcrevendo áudio…</span><button type="button" className="chat-composer-secondary" onClick={cancelTranscription}>Cancelar transcrição</button></div>}
          {transcriptionError && <p className="chat-composer-error" role="alert">{transcriptionError}</p>}
          {transcriptDraft && <div className="chat-transcript-review">
            <label htmlFor={`${inputId}-transcript`}>Transcrição para revisar</label>
            <textarea id={`${inputId}-transcript`} aria-label="Transcrição para revisar" value={transcriptDraft} onChange={(event) => setTranscriptDraft(event.target.value.slice(0, 4000))} rows={4} maxLength={4000} disabled={controlsBusy} />
            <small>{transcriptDraft.length.toLocaleString('pt-BR')} / 4.000 caracteres. Revise antes de adicionar ao rascunho.</small>
            <button type="button" className="chat-composer-secondary" onClick={appendTranscriptToDraft} disabled={controlsBusy || !transcriptToAppend || draftWithTranscript.length > 4000}>Adicionar ao rascunho</button>
            {draftWithTranscript.length > 4000 && <small role="status">O rascunho comporta mais {Math.max(0, 4000 - draft.trim().length)} caracteres. Reduza a transcrição para adicioná-la.</small>}
          </div>}
        </div>
      )}

      <div className="chat-composer-main">
        <textarea
          aria-label="Mensagem para o assistente"
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, 4000))}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void sendText();
            }
          }}
          placeholder="Digite uma mensagem…"
          maxLength={4000}
          rows={2}
          disabled={controlsBusy}
        />
        <button type="button" className="chat-composer-primary" onClick={() => void (selectedFile ? sendFile() : sendText())} disabled={controlsBusy || (!selectedFile && !draft.trim())}>
          {sending ? 'Enviando…' : selectedFile ? 'Enviar anexo' : 'Enviar mensagem'}
        </button>
      </div>

      <div className="chat-composer-actions">
        <div className="chat-file-picker">
          <input
            id={inputId}
            className="chat-file-input"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.webm,.ogg,.oga,.wav,.mp3,.mp4,.m4a,application/pdf,image/jpeg,image/png,image/webp,audio/webm,audio/ogg,audio/wav,audio/mpeg,audio/mp4"
            aria-label="Selecionar arquivo para anexar"
            disabled={controlsBusy || maxAttachmentBytes <= 0}
            onChange={(event) => {
              readSelectedFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
          <label htmlFor={inputId} className="chat-composer-secondary">Anexar arquivo</label>
        </div>
        <button type="button" className="chat-composer-secondary" onClick={() => void startRecording()} disabled={controlsBusy || Boolean(selectedFile) || maxAttachmentBytes <= 0}>
          {permissionPending ? 'Aguardando microfone…' : recording ? `Gravando ${formatDuration(elapsedSeconds)}` : 'Gravar áudio'}
        </button>
        <span className="chat-composer-hint">{maxAttachmentBytes <= 0 ? 'Limite de anexos da sessão atingido.' : `Até ${formatChatFileSize(Math.min(MAX_FILE_BYTES, maxAttachmentBytes))} restantes · gravação de até 2 minutos`}</span>
      </div>
    </div>
  );
}
