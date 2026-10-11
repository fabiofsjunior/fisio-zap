const ATTACHMENT_MIME_KINDS = new Map([
  ['application/pdf', 'document'],
  ['image/jpeg', 'image'],
  ['image/png', 'image'],
  ['image/webp', 'image'],
  ['audio/webm', 'audio'],
  ['audio/ogg', 'audio'],
  ['audio/wav', 'audio'],
  ['audio/x-wav', 'audio'],
  ['audio/mpeg', 'audio'],
  ['audio/mp3', 'audio'],
  ['audio/mp4', 'audio'],
  ['audio/x-m4a', 'audio'],
]);
const MIME_EXTENSIONS = new Map([
  ['application/pdf', new Set(['pdf'])],
  ['image/jpeg', new Set(['jpg', 'jpeg'])],
  ['image/png', new Set(['png'])],
  ['image/webp', new Set(['webp'])],
  ['audio/webm', new Set(['webm'])],
  ['audio/ogg', new Set(['ogg', 'oga'])],
  ['audio/wav', new Set(['wav'])],
  ['audio/x-wav', new Set(['wav'])],
  ['audio/mpeg', new Set(['mp3'])],
  ['audio/mp3', new Set(['mp3'])],
  ['audio/mp4', new Set(['mp4', 'm4a'])],
  ['audio/x-m4a', new Set(['mp4', 'm4a'])],
]);

export const MAX_CHAT_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function normalizeAttachmentMime(contentType) {
  if (typeof contentType !== 'string' || contentType.length > 160) return null;
  const [rawMime, ...parameters] = contentType.split(';');
  const mime = rawMime.trim().toLowerCase();
  if (!ATTACHMENT_MIME_KINDS.has(mime)) return null;
  if (parameters.length > 1) return null;
  if (parameters.length === 1) {
    if (!mime.startsWith('audio/')) return null;
    if (!/^\s*codecs\s*=\s*(?:"[a-z0-9._,-]+"|[a-z0-9._,-]+)\s*$/i.test(parameters[0])) return null;
  }
  return mime;
}

export function attachmentKind(mime) {
  return ATTACHMENT_MIME_KINDS.get(mime) ?? null;
}

export function attachmentNameMatchesMime(name, mime) {
  const extensionStart = name.lastIndexOf('.');
  if (extensionStart <= 0) return false;
  const extension = name.slice(extensionStart + 1).toLowerCase();
  return MIME_EXTENSIONS.get(mime)?.has(extension) ?? false;
}

export function decodeSafeAttachmentName(encodedName) {
  if (typeof encodedName !== 'string' || !encodedName || encodedName.length > 1080) return null;
  let name;
  try {
    name = decodeURIComponent(encodedName);
  } catch {
    return null;
  }
  if (!name || name.length > 120 || encodeURIComponent(name) !== encodedName) return null;
  if (name === '.' || name === '..' || /[\p{Cc}/\\]/u.test(name)) return null;
  return name;
}

// Checks only container magic bytes; this is not malware scanning or full parsing.
export function matchesAttachmentSignature(mime, bytes) {
  if (!Buffer.isBuffer(bytes)) return false;
  switch (mime) {
    case 'application/pdf':
      return bytes.length >= 5 && bytes.subarray(0, 5).equals(Buffer.from('%PDF-'));
    case 'image/jpeg':
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/png':
      return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/webp':
      return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    case 'audio/webm':
      return bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    case 'audio/ogg':
      return bytes.length >= 4 && bytes.toString('ascii', 0, 4) === 'OggS';
    case 'audio/wav':
    case 'audio/x-wav':
      return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE';
    case 'audio/mpeg':
    case 'audio/mp3':
      return bytes.length >= 3 && (
        bytes.toString('ascii', 0, 3) === 'ID3'
        || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
      );
    case 'audio/mp4':
    case 'audio/x-m4a':
      return bytes.length >= 8 && bytes.toString('ascii', 4, 8) === 'ftyp';
    default:
      return false;
  }
}
