import { createHash } from 'crypto';
import {
  certificateIssuerAndSerial,
  context,
  derNull,
  octetString,
  oid,
  pemToDer,
  sequence,
  setOf,
  smallInteger,
  utcTime,
} from '@/lib/server/wallet/der';

/**
 * Apple Wallet `.pkpass` packaging: `manifest.json` (SHA-1 of every file), a detached CMS
 * signature of the manifest by the Pass Type ID certificate (with Apple's WWDR intermediate), and
 * a stored (uncompressed) zip of it all. WebCrypto signs, so it runs the same on Node and Workers.
 */

export type PassSigner = {
  /** Pass Type ID certificate, PEM. */
  certificatePem: string;
  /** Its private key, PKCS#8 PEM (`BEGIN PRIVATE KEY`). */
  privateKeyPem: string;
  /** Apple WWDR intermediate certificate, PEM. */
  wwdrPem: string;
};

const OID = {
  data: '1.2.840.113549.1.7.1',
  signedData: '1.2.840.113549.1.7.2',
  contentType: '1.2.840.113549.1.9.3',
  messageDigest: '1.2.840.113549.1.9.4',
  signingTime: '1.2.840.113549.1.9.5',
  sha256: '2.16.840.1.101.3.4.2.1',
  rsaEncryption: '1.2.840.113549.1.1.1',
};

const algorithm = (id: string) => sequence(oid(id), derNull());

async function rsaSha256(privateKeyPem: string, data: Buffer): Promise<Buffer> {
  const key = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    new Uint8Array(pemToDer(privateKeyPem)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return Buffer.from(await globalThis.crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new Uint8Array(data)));
}

/** Detached PKCS#7 SignedData over `content`, DER. */
export async function signDetached(content: Buffer, signer: PassSigner, now = new Date()): Promise<Buffer> {
  const certificate = pemToDer(signer.certificatePem);
  const wwdr = pemToDer(signer.wwdrPem);
  const { issuer, serial } = certificateIssuerAndSerial(certificate);

  const attributes = [
    sequence(oid(OID.contentType), setOf(oid(OID.data))),
    sequence(oid(OID.signingTime), setOf(utcTime(now))),
    sequence(oid(OID.messageDigest), setOf(octetString(createHash('sha256').update(content).digest()))),
  ];
  // Signed as a DER SET; carried as the implicit [0] of the same bytes.
  const signedAttributes = setOf(...attributes);
  const signature = await rsaSha256(signer.privateKeyPem, signedAttributes);

  const signerInfo = sequence(
    smallInteger(1),
    sequence(issuer, serial),
    algorithm(OID.sha256),
    Buffer.concat([Buffer.from([0xa0]), signedAttributes.subarray(1)]),
    algorithm(OID.rsaEncryption),
    octetString(signature),
  );
  const signedData = sequence(
    smallInteger(1),
    setOf(algorithm(OID.sha256)),
    sequence(oid(OID.data)),
    context(0, certificate, wwdr),
    setOf(signerInfo),
  );
  return sequence(oid(OID.signedData), context(0, signedData));
}

// --- Stored zip -------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** A zip with every entry stored (no compression); Wallet accepts it and it needs no deflate. */
export function storedZip(files: Array<{ name: string; data: Buffer }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12); // 1980-01-01: a fixed stamp keeps builds reproducible
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, file.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + file.data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** The signed `.pkpass` for `pass.json` plus its images. */
export async function buildPkpass(
  passJson: Record<string, unknown>,
  images: Record<string, Buffer>,
  signer: PassSigner,
): Promise<Buffer> {
  const files = [
    { name: 'pass.json', data: Buffer.from(JSON.stringify(passJson), 'utf8') },
    ...Object.entries(images).map(([name, data]) => ({ name, data })),
  ];
  const manifest = Buffer.from(
    JSON.stringify(Object.fromEntries(files.map((f) => [f.name, createHash('sha1').update(f.data).digest('hex')]))),
    'utf8',
  );
  const signature = await signDetached(manifest, signer);
  return storedZip([...files, { name: 'manifest.json', data: manifest }, { name: 'signature', data: signature }]);
}
