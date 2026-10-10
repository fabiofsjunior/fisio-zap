export const MAX_TRANSCRIPTION_RESPONSE_BYTES = 256 * 1024;
export const MAX_TRANSCRIPTION_TEXT_CHARS = 4_000;
export const TRANSCRIPTION_TIMEOUT_MS = 20_000;

const ALLOWED_MODELS = new Set([
  'gpt-4o-mini-transcribe',
  'gpt-4o-transcribe',
  'whisper-1',
]);

export function getTranscriptionConfig(env = process.env) {
  const model = env.FISIOZAP_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe';
  const apiKey = env.OPENAI_API_KEY;
  return {
    enabled: env.FISIOZAP_TRANSCRIPTION_ENABLED === 'true'
      && typeof apiKey === 'string' && apiKey.trim().length > 0
      && ALLOWED_MODELS.has(model),
    apiKey: typeof apiKey === 'string' ? apiKey : '',
    model: ALLOWED_MODELS.has(model) ? model : null,
  };
}

async function readLimitedResponse(response, controller) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('invalid_provider_response');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_TRANSCRIPTION_RESPONSE_BYTES) {
        controller.abort();
        throw new Error('provider_response_too_large');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size).toString('utf8');
}

export async function transcribeWithOpenAI({ bytes, mime, filename, apiKey, model, signal: clientSignal, fetchImpl = fetch }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT_MS);
  const signal = clientSignal ? AbortSignal.any([controller.signal, clientSignal]) : controller.signal;
  try {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: mime }), filename);
    form.append('model', model);
    form.append('response_format', 'json');
    let response;
    try {
      response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal,
      });
    } catch {
      throw new Error('provider_unavailable');
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error('provider_rejected_request');
    }
    let payload;
    try {
      payload = JSON.parse(await readLimitedResponse(response, controller));
    } catch {
      throw new Error('invalid_provider_response');
    }
    if (typeof payload?.text !== 'string' || !payload.text.trim() || payload.text.length > MAX_TRANSCRIPTION_TEXT_CHARS) {
      throw new Error('invalid_provider_response');
    }
    return payload.text;
  } finally {
    clearTimeout(timeout);
  }
}
