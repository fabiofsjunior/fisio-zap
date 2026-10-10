import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
for (const key of ['HTMLElement', 'Node', 'MutationObserver', 'File', 'Blob', 'DOMException', 'Event']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: (dom.window as unknown as Record<string, unknown>)[key] });
}
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let nextObjectUrl = 0;
const revokedObjectUrls: string[] = [];
URL.createObjectURL = () => `blob:chat-composer-test-${++nextObjectUrl}`;
URL.revokeObjectURL = (url) => { revokedObjectUrls.push(url); };

const React = await import('react');
const { act, cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { default: ChatComposer } = await import('../../app/components/chat-composer');

afterEach(() => {
  cleanup();
  Object.defineProperty(window.navigator, 'mediaDevices', { configurable: true, value: undefined });
  delete (window as Window & { MediaRecorder?: unknown }).MediaRecorder;
});

type RecorderInstance = {
  state: 'inactive' | 'recording';
  mimeType: string;
  startCalls: number;
  stopCalls: number;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
  start(timeslice?: number): void;
  stop(): void;
  emit(data: Blob): void;
  finishStop(): void;
};

function installRecorder({ throwOnStart = false } = {}) {
  const instances: RecorderInstance[] = [];
  class FakeMediaRecorder {
    state: 'inactive' | 'recording' = 'inactive';
    mimeType = 'audio/webm;codecs=opus';
    startCalls = 0;
    stopCalls = 0;
    ondataavailable: RecorderInstance['ondataavailable'] = null;
    onstop: RecorderInstance['onstop'] = null;
    onerror: RecorderInstance['onerror'] = null;

    constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
      if (options?.mimeType) this.mimeType = options.mimeType;
      instances.push(this as unknown as RecorderInstance);
    }

    start(_timeslice?: number) {
      this.startCalls += 1;
      if (throwOnStart) throw new Error('simulated MediaRecorder.start failure');
      this.state = 'recording';
    }

    stop() {
      this.stopCalls += 1;
      this.state = 'inactive';
    }

    emit(data: Blob) { this.ondataavailable?.({ data }); }
    finishStop() { this.onstop?.(); }

    static isTypeSupported() { return true; }
  }
  Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder });
  return instances;
}

function makeStream() {
  const track = { stopCalls: 0, stop() { this.stopCalls += 1; } };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

function setMediaDevices(getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>) {
  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

type ComposerProps = {
  onSend?: (text: string, file?: File) => Promise<void>;
  transcriptionStatus?: 'checking' | 'enabled' | 'disabled' | 'error';
  onTranscribe?: (file: File) => Promise<string>;
  onCancelTranscription?: () => void;
  transcribing?: boolean;
};

function renderComposer(props: ComposerProps = {}) {
  return render(React.createElement(ChatComposer, { onSend: async () => {}, sending: false, ...props }));
}

function selectFile(file: File) {
  fireEvent.change(screen.getByLabelText('Selecionar arquivo para anexar'), { target: { files: [file] } });
}

async function flushPendingMediaRequest() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

test('sends the selected file alone, retains draft on success, and removes the attachment cleanly', async () => {
  const calls: Array<[string, File | undefined]> = [];
  const onSend = async (text: string, file?: File) => { calls.push([text, file]); };
  renderComposer({ onSend });
  const draft = screen.getByLabelText('Mensagem para o assistente') as HTMLTextAreaElement;
  fireEvent.change(draft, { target: { value: 'Texto que deve permanecer no rascunho' } });
  const file = new File(['pdf-content'], 'plano.pdf', { type: 'application/pdf' });
  selectFile(file);

  await screen.findByText('plano.pdf');
  fireEvent.click(screen.getByRole('button', { name: 'Enviar anexo' }));
  await waitFor(() => assert.equal(calls.length, 1));
  assert.equal(calls[0][0], '');
  assert.equal(calls[0][1], file);
  await waitFor(() => assert.equal(screen.queryByLabelText('Arquivo selecionado'), null));
  assert.equal(draft.value, 'Texto que deve permanecer no rascunho');

  const secondFile = new File(['another'], 'outro.pdf', { type: 'application/pdf' });
  selectFile(secondFile);
  await screen.findByText('outro.pdf');
  fireEvent.click(screen.getByRole('button', { name: 'Remover arquivo' }));
  await waitFor(() => assert.equal(screen.queryByLabelText('Arquivo selecionado'), null));
  assert.equal(draft.value, 'Texto que deve permanecer no rascunho');
  assert.equal(revokedObjectUrls.length, 0, 'documents should not allocate preview object URLs');
});

test('rejects attachments larger than 10 MiB before calling onSend', async () => {
  const calls: Array<[string, File | undefined]> = [];
  renderComposer({ onSend: async (text, file) => { calls.push([text, file]); } });
  selectFile(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'too-large.pdf', { type: 'application/pdf' }));
  const alert = await screen.findByRole('alert');
  assert.match(alert.textContent ?? '', /limite por arquivo é 10 MB/i);
  assert.equal(screen.queryByLabelText('Arquivo selecionado'), null);
  assert.equal(calls.length, 0);
});

test('applies the remaining session attachment budget to file selection', async () => {
  render(React.createElement(ChatComposer, { onSend: async () => {}, sending: false, maxAttachmentBytes: 3 * 1024 * 1024 }));
  selectFile(new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'over-budget.pdf', { type: 'application/pdf' }));
  const alert = await screen.findByRole('alert');
  assert.match(alert.textContent ?? '', /Restam 3 MB para anexos nesta sessão/i);
  assert.equal(screen.queryByLabelText('Arquivo selecionado'), null);
  selectFile(new File([new Uint8Array(2 * 1024 * 1024)], 'within-budget.pdf', { type: 'application/pdf' }));
  await screen.findByText('within-budget.pdf');
});

test('keeps both attachment and draft when onSend rejects, allowing retry', async () => {
  const calls: Array<[string, File | undefined]> = [];
  let attempts = 0;
  const onSend = async (text: string, file?: File) => {
    calls.push([text, file]);
    attempts += 1;
    if (attempts === 1) throw new Error('temporary network failure');
  };
  renderComposer({ onSend });
  const draft = screen.getByLabelText('Mensagem para o assistente') as HTMLTextAreaElement;
  fireEvent.change(draft, { target: { value: 'Não apagar este texto' } });
  const file = new File(['audio'], 'consulta.webm', { type: 'audio/webm' });
  selectFile(file);
  await screen.findByText('consulta.webm');

  fireEvent.click(screen.getByRole('button', { name: 'Enviar anexo' }));
  await waitFor(() => assert.equal(calls.length, 1));
  await screen.findByLabelText('Arquivo selecionado');
  assert.equal(draft.value, 'Não apagar este texto');
  fireEvent.click(screen.getByRole('button', { name: 'Enviar anexo' }));
  await waitFor(() => assert.equal(calls.length, 2));
  await waitFor(() => assert.equal(screen.queryByLabelText('Arquivo selecionado'), null));
  assert.equal(calls[0][0], '');
  assert.equal(calls[0][1], file);
  assert.equal(calls[1][0], '');
  assert.equal(calls[1][1], file);
  assert.equal(draft.value, 'Não apagar este texto');
});

test('disabled transcription status never offers transcription but still allows audio attachment sending', async () => {
  const calls: Array<[string, File | undefined]> = [];
  const onTranscribe = async () => { throw new Error('must not be called'); };
  renderComposer({
    onSend: async (text, file) => { calls.push([text, file]); },
    onTranscribe,
    transcriptionStatus: 'disabled',
  });
  const audio = new File(['audio bytes'], 'nota.webm', { type: 'audio/webm' });
  selectFile(audio);
  await screen.findByText('nota.webm');
  assert.match(screen.getByRole('status').textContent ?? '', /Transcrição indisponível/i);
  assert.equal(screen.queryByRole('button', { name: 'Transcrever' }), null);

  fireEvent.click(screen.getByRole('button', { name: 'Enviar anexo' }));
  await waitFor(() => assert.equal(calls.length, 1));
  assert.equal(calls[0][0], '');
  assert.equal(calls[0][1], audio);
});

test('checking transcription can become enabled after selecting audio without losing the file', async () => {
  const view = render(React.createElement(ChatComposer, {
    onSend: async () => {}, sending: false, transcriptionStatus: 'checking',
  }));
  const audio = new File(['audio bytes'], 'gravacao.webm', { type: 'audio/webm' });
  selectFile(audio);
  await screen.findByText('gravacao.webm');
  assert.match(screen.getByRole('status').textContent ?? '', /Verificando disponibilidade/i);
  assert.equal(screen.queryByRole('button', { name: 'Transcrever' }), null);

  view.rerender(React.createElement(ChatComposer, {
    onSend: async () => {}, sending: false, transcriptionStatus: 'enabled', onTranscribe: async () => 'texto',
  }));
  assert.ok(await screen.findByRole('button', { name: 'Transcrever' }));
  assert.equal(screen.getByText('gravacao.webm').textContent, 'gravacao.webm');
});

test('requires explicit consent, keeps transcript separate until review, and appends without replacing draft', async () => {
  const transcript = deferred<string>();
  const transcribeCalls: File[] = [];
  const sendCalls: Array<[string, File | undefined]> = [];
  const audio = new File(['audio bytes'], 'voz.webm', { type: 'audio/webm' });
  const view = render(React.createElement(ChatComposer, {
    onSend: async (text: string, file?: File) => { sendCalls.push([text, file]); },
    sending: false,
    transcriptionStatus: 'enabled',
    onTranscribe: async (file: File) => { transcribeCalls.push(file); return transcript.promise; },
  }));
  const draft = screen.getByRole('textbox', { name: 'Mensagem para o assistente' }) as HTMLTextAreaElement;
  fireEvent.change(draft, { target: { value: 'Minha observação' } });
  selectFile(audio);
  await screen.findByText('voz.webm');
  fireEvent.click(screen.getByRole('button', { name: 'Transcrever' }));
  await screen.findByRole('group', { name: 'Confirmação de transcrição' });
  assert.equal(transcribeCalls.length, 0, 'opening consent must not send audio');
  assert.equal(draft.value, 'Minha observação');
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  assert.equal(transcribeCalls.length, 0, 'declining consent must not send audio');

  fireEvent.click(screen.getByRole('button', { name: 'Transcrever' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar e transcrever' }));
  await waitFor(() => assert.equal(transcribeCalls.length, 1));
  assert.equal(transcribeCalls[0], audio);
  transcript.resolve('  texto reconhecido  ');
  const review = await screen.findByRole('textbox', { name: 'Transcrição para revisar' }) as HTMLTextAreaElement;
  assert.equal(review.value, '  texto reconhecido  ');
  assert.equal(draft.value, 'Minha observação', 'transcription must not alter the draft before review');
  assert.equal(sendCalls.length, 0, 'transcription must not send a chat message');

  fireEvent.change(review, { target: { value: 'texto revisado pelo profissional' } });
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar ao rascunho' }));
  assert.equal(draft.value, 'Minha observação\ntexto revisado pelo profissional');
  assert.equal(screen.queryByRole('textbox', { name: 'Transcrição para revisar' }), null);
  assert.equal(sendCalls.length, 0, 'adding to draft must not send automatically');
  fireEvent.click(screen.getByRole('button', { name: 'Remover arquivo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));
  await waitFor(() => assert.deepEqual(sendCalls, [['Minha observação\ntexto revisado pelo profissional', undefined]]));
  view.unmount();
});

test('cancels transcription and ignores a late result', async () => {
  const transcript = deferred<string>();
  let cancelCalls = 0;
  const onTranscribe = async () => transcript.promise;
  const audio = new File(['audio bytes'], 'cancelar.webm', { type: 'audio/webm' });
  const view = render(React.createElement(ChatComposer, {
    onSend: async () => {}, sending: false, transcriptionStatus: 'enabled',
    onTranscribe, onCancelTranscription: () => { cancelCalls += 1; }, transcribing: false,
  }));
  const draft = screen.getByRole('textbox', { name: 'Mensagem para o assistente' }) as HTMLTextAreaElement;
  fireEvent.change(draft, { target: { value: 'rascunho preservado' } });
  selectFile(audio);
  await screen.findByText('cancelar.webm');
  const cancelBaseline = cancelCalls;
  fireEvent.click(screen.getByRole('button', { name: 'Transcrever' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar e transcrever' }));
  assert.equal(cancelCalls, cancelBaseline, 'starting the request must not cancel it');

  view.rerender(React.createElement(ChatComposer, {
    onSend: async () => {}, sending: false, transcriptionStatus: 'enabled',
    onTranscribe, onCancelTranscription: () => { cancelCalls += 1; }, transcribing: true,
  }));
  await screen.findByRole('button', { name: 'Cancelar transcrição' });
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar transcrição' }));
  assert.equal(cancelCalls, cancelBaseline + 1);
  view.rerender(React.createElement(ChatComposer, {
    onSend: async () => {}, sending: false, transcriptionStatus: 'enabled',
    onTranscribe, onCancelTranscription: () => { cancelCalls += 1; }, transcribing: false,
  }));
  transcript.resolve('resposta tardia não deve aparecer');
  await act(async () => flushPendingMediaRequest());
  assert.equal(screen.queryByRole('textbox', { name: 'Transcrição para revisar' }), null);
  assert.equal(draft.value, 'rascunho preservado');
  assert.ok(screen.getByText('cancelar.webm'));
  view.unmount();
});

test('reports microphone permission denied and allows a successful retry', async () => {
  const instances = installRecorder();
  const { stream, track } = makeStream();
  let attempts = 0;
  setMediaDevices(async () => {
    attempts += 1;
    if (attempts === 1) throw new window.DOMException('Permission denied', 'NotAllowedError');
    return stream;
  });
  renderComposer();

  fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
  await screen.findByRole('alert');
  assert.match(screen.getByRole('alert').textContent ?? '', /Permita o acesso ao microfone/i);
  assert.equal(attempts, 1);

  fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
  await screen.findByRole('button', { name: 'Parar' });
  assert.equal(attempts, 2);
  assert.equal(instances.length, 1);
  assert.equal(instances[0].startCalls, 1);

  act(() => instances[0].emit(new Blob(['voice'], { type: 'audio/webm' })));
  fireEvent.click(screen.getByRole('button', { name: 'Parar' }));
  assert.equal(instances[0].stopCalls, 1);
  act(() => instances[0].finishStop());
  await screen.findByLabelText('Arquivo selecionado');
  assert.ok(track.stopCalls >= 1, 'the microphone track should be stopped');
});

test('explains when MediaRecorder is unavailable and leaves file attachment available', async () => {
  Object.defineProperty(window.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => makeStream().stream } });
  renderComposer();
  fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
  const alert = await screen.findByRole('alert');
  assert.match(alert.textContent ?? '', /não está disponível neste navegador/i);
  assert.match(alert.textContent ?? '', /anexar um arquivo de áudio/i);
  const file = new File(['audio'], 'audio.mp3', { type: 'audio/mpeg' });
  selectFile(file);
  await screen.findByText('audio.mp3');
});

test('requests recorder stop at 120 seconds without waiting for wall-clock time', async () => {
  const instances = installRecorder();
  const { stream, track } = makeStream();
  setMediaDevices(async () => stream);
  const originalSetTimeout = window.setTimeout.bind(window);
  const originalClearTimeout = window.clearTimeout.bind(window);
  let maxDurationCallback: (() => void) | null = null;
  let requestedDelay = 0;
  window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    if (delay === 120_000 && typeof handler === 'function') {
      requestedDelay = delay;
      maxDurationCallback = () => handler(...args);
      return -881 as unknown as number;
    }
    return originalSetTimeout(handler, delay, ...args);
  }) as typeof window.setTimeout;
  window.clearTimeout = ((timerId: number) => {
    if (timerId === -881) return;
    originalClearTimeout(timerId);
  }) as typeof window.clearTimeout;
  try {
    renderComposer();
    fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
    await screen.findByRole('button', { name: 'Parar' });
    assert.equal(requestedDelay, 120_000);
    assert.ok(maxDurationCallback);
    act(() => maxDurationCallback?.());
    assert.equal(instances[0].stopCalls, 1);
    act(() => instances[0].emit(new Blob(['voice'], { type: 'audio/webm' })));
    act(() => instances[0].finishStop());
    await screen.findByLabelText('Arquivo selecionado');
    assert.ok(track.stopCalls >= 1, 'the microphone track should be stopped');
  } finally {
    window.setTimeout = originalSetTimeout;
    window.clearTimeout = originalClearTimeout;
  }
});

test('stops recording early when cumulative audio chunks exceed 10 MB', async () => {
  const instances = installRecorder();
  const { stream, track } = makeStream();
  setMediaDevices(async () => stream);
  renderComposer();
  fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
  await screen.findByRole('button', { name: 'Parar' });

  act(() => instances[0].emit(new Blob([new Uint8Array(6 * 1024 * 1024)], { type: 'audio/webm' })));
  act(() => instances[0].emit(new Blob([new Uint8Array(5 * 1024 * 1024)], { type: 'audio/webm' })));
  await screen.findByRole('alert');
  assert.match(screen.getByRole('alert').textContent ?? '', /ultrapassou o limite de 10 MB/i);
  assert.equal(instances[0].stopCalls, 1);
  assert.equal(track.stopCalls, 1);
  act(() => instances[0].finishStop());
  assert.equal(screen.queryByLabelText('Arquivo selecionado'), null);
});

test('enforces the remaining session budget for cumulative recording chunks', async () => {
  const instances = installRecorder();
  const { stream, track } = makeStream();
  setMediaDevices(async () => stream);
  render(React.createElement(ChatComposer, { onSend: async () => {}, sending: false, maxAttachmentBytes: 1024 * 1024 }));
  fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
  await screen.findByRole('button', { name: 'Parar' });

  act(() => instances[0].emit(new Blob([new Uint8Array(1024 * 1024 + 1)], { type: 'audio/webm' })));
  const alert = await screen.findByRole('alert');
  assert.match(alert.textContent ?? '', /ultrapassou os 1 MB restantes nesta sessão/i);
  assert.equal(instances[0].stopCalls, 1);
  assert.equal(track.stopCalls, 1);
  act(() => instances[0].finishStop());
  assert.equal(screen.queryByLabelText('Arquivo selecionado'), null);
});

test('cancelling a recording releases tracks immediately even when onstop is delayed', async () => {
  const instances = installRecorder();
  const { stream, track } = makeStream();
  setMediaDevices(async () => stream);
  renderComposer();
  fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
  await screen.findByRole('button', { name: 'Parar' });
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar gravação' }));
  assert.equal(instances[0].stopCalls, 1);
  assert.equal(track.stopCalls, 1);
  act(() => instances[0].finishStop());
  assert.equal(screen.queryByLabelText('Arquivo selecionado'), null);
});

test('unmounting an active recorder stops both recorder and tracks without waiting for onstop', async () => {
  const instances = installRecorder();
  const { stream, track } = makeStream();
  setMediaDevices(async () => stream);
  const view = renderComposer();
  fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
  await screen.findByRole('button', { name: 'Parar' });
  view.unmount();
  assert.equal(instances[0].stopCalls, 1);
  assert.equal(track.stopCalls, 1);
});

test('explicit stop releases tracks even if the browser never emits onstop', async () => {
  const instances = installRecorder();
  const { stream, track } = makeStream();
  setMediaDevices(async () => stream);
  renderComposer();
  fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
  await screen.findByRole('button', { name: 'Parar' });
  fireEvent.click(screen.getByRole('button', { name: 'Parar' }));
  assert.equal(instances[0].stopCalls, 1);
  assert.equal(track.stopCalls, 1);
});

test('recorder.start failure releases the stream and leaves retry available', async () => {
  const instances = installRecorder({ throwOnStart: true });
  const { stream, track } = makeStream();
  setMediaDevices(async () => stream);
  renderComposer();
  fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
  const alert = await screen.findByRole('alert');
  assert.match(alert.textContent ?? '', /Não foi possível iniciar a gravação/i);
  assert.equal(track.stopCalls, 1);
  assert.equal(instances.length, 1);
  assert.equal(screen.getByRole('button', { name: 'Gravar áudio' }).hasAttribute('disabled'), false);
});

test('late onstop from cancelled recorder does not clear the newer recording state', async () => {
  const instances = installRecorder();
  const first = makeStream();
  const second = makeStream();
  let request = 0;
  setMediaDevices(async () => (++request === 1 ? first.stream : second.stream));
  renderComposer();
  fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
  await screen.findByRole('button', { name: 'Parar' });
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar gravação' }));
  fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
  await waitFor(() => assert.equal(instances.length, 2));
  await screen.findByRole('button', { name: 'Parar' });

  act(() => instances[0].finishStop());
  assert.ok(screen.getByRole('button', { name: 'Parar' }), 'new recording should stay active after stale onstop');
  assert.equal(second.track.stopCalls, 0);
});

test('permission response resolving after cancel or unmount stops newly acquired tracks without creating a recorder', async () => {
  for (const action of ['cancel', 'unmount'] as const) {
    const instances = installRecorder();
    const permission = deferred<MediaStream>();
    const acquired = makeStream();
    setMediaDevices(() => permission.promise);
    const view = renderComposer();
    fireEvent.click(screen.getByRole('button', { name: 'Gravar áudio' }));
    await screen.findByRole('status');
    if (action === 'cancel') fireEvent.click(screen.getByRole('button', { name: 'Cancelar gravação' }));
    else view.unmount();
    permission.resolve(acquired.stream);
    await act(async () => flushPendingMediaRequest());
    assert.equal(acquired.track.stopCalls, 1, `${action} must release a late stream`);
    assert.equal(instances.length, 0, `${action} must not create MediaRecorder for a stale stream`);
    cleanup();
  }
});
