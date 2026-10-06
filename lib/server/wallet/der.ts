/**
 * The little DER (ASN.1) a Wallet pass signature needs: encoders for the CMS structure and a
 * reader for the two certificate fields it copies (issuer, serial). Nothing general-purpose.
 */

function length(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const bytes: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff);
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

export function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), length(content.length), content]);
}

export const sequence = (...parts: Buffer[]) => tlv(0x30, Buffer.concat(parts));
/** DER SET OF: members sorted by their encodings (the signature covers this exact form). */
export const setOf = (...parts: Buffer[]) => tlv(0x31, Buffer.concat([...parts].sort(Buffer.compare)));
export const octetString = (bytes: Buffer) => tlv(0x04, bytes);
export const derNull = () => Buffer.from([0x05, 0x00]);
export const smallInteger = (n: number) => tlv(0x02, Buffer.from([n]));
/** `[n]` context tag, constructed (explicit wrappers and implicit SETs alike). */
export const context = (n: number, ...parts: Buffer[]) => tlv(0xa0 + n, Buffer.concat(parts));

export function oid(dotted: string): Buffer {
  const [a, b, ...rest] = dotted.split('.').map(Number);
  const bytes = [a! * 40 + b!];
  for (const value of rest) {
    const chunk = [value & 0x7f];
    for (let v = Math.floor(value / 128); v > 0; v = Math.floor(v / 128)) chunk.unshift((v & 0x7f) | 0x80);
    bytes.push(...chunk);
  }
  return tlv(0x06, Buffer.from(bytes));
}

export function utcTime(date: Date): Buffer {
  const two = (n: number) => String(n).padStart(2, '0');
  const text =
    two(date.getUTCFullYear() % 100) + two(date.getUTCMonth() + 1) + two(date.getUTCDate()) +
    two(date.getUTCHours()) + two(date.getUTCMinutes()) + two(date.getUTCSeconds()) + 'Z';
  return tlv(0x17, Buffer.from(text, 'ascii'));
}

type Element = { tag: number; start: number; contentStart: number; end: number };

function read(buf: Buffer, offset: number): Element {
  const tag = buf[offset]!;
  let cursor = offset + 1;
  let len = buf[cursor++]!;
  if (len & 0x80) {
    const count = len & 0x7f;
    len = 0;
    for (let i = 0; i < count; i++) len = len * 256 + buf[cursor++]!;
  }
  const end = cursor + len;
  if (end > buf.length) throw new Error('Truncated DER');
  return { tag, start: offset, contentStart: cursor, end };
}

function children(buf: Buffer, parent: Element): Element[] {
  const out: Element[] = [];
  for (let at = parent.contentStart; at < parent.end; ) {
    const child = read(buf, at);
    out.push(child);
    at = child.end;
  }
  return out;
}

/** The certificate's issuer Name and serialNumber, as complete DER elements. */
export function certificateIssuerAndSerial(certDer: Buffer): { issuer: Buffer; serial: Buffer } {
  const certificate = read(certDer, 0);
  const tbs = children(certDer, certificate)[0];
  if (!tbs) throw new Error('Not a certificate');
  const fields = children(certDer, tbs);
  // An explicit [0] version comes first on v3 certificates.
  const offset = fields[0]?.tag === 0xa0 ? 1 : 0;
  const serial = fields[offset];
  const issuer = fields[offset + 2];
  if (serial?.tag !== 0x02 || issuer?.tag !== 0x30) throw new Error('Not a certificate');
  return {
    serial: certDer.subarray(serial.start, serial.end),
    issuer: certDer.subarray(issuer.start, issuer.end),
  };
}

/** The first PEM block's DER bytes (Worker secrets may carry newlines as literal `\n`). */
export function pemToDer(pem: string): Buffer {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----[\s\S]*/, '')
    .replace(/\s+/g, '');
  return Buffer.from(body, 'base64');
}
