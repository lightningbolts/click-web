/** @jest-environment node */
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { X509Certificate, createHash } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { certificateIssuerAndSerial, oid, pemToDer } from '@/lib/server/wallet/der';
import { buildPkpass, crc32, signDetached, storedZip } from '@/lib/server/wallet/pkpass';

function hasOpenssl(): boolean {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const withOpenssl = hasOpenssl() ? describe : describe.skip;

describe('DER helpers', () => {
  it('encodes object identifiers', () => {
    expect(oid('1.2.840.113549.1.7.2').toString('hex')).toBe('06092a864886f70d010702');
  });

  it('reads PEM with literal \\n escapes (Worker secrets)', () => {
    const pem = '-----BEGIN CERTIFICATE-----\\nAAEC\\n-----END CERTIFICATE-----\\n';
    expect(pemToDer(pem)).toEqual(Buffer.from([0, 1, 2]));
  });
});

describe('stored zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('lays out local headers, a central directory and the end record', () => {
    const zip = storedZip([{ name: 'a.txt', data: Buffer.from('hi') }]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    expect(zip.readUInt16LE(zip.length - 12)).toBe(1);
  });
});

withOpenssl('Wallet signature', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pkpass-'));
  const make = (name: string, subject: string) => {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', subject,
      '-keyout', join(dir, `${name}.key`), '-out', join(dir, `${name}.pem`),
    ], { stdio: 'ignore' });
    execFileSync('openssl', ['pkcs8', '-topk8', '-nocrypt', '-in', join(dir, `${name}.key`), '-out', join(dir, `${name}.p8`)]);
  };
  make('pass', '/CN=pass.test.click/O=Click Test');
  make('wwdr', '/CN=WWDR Test');
  const signer = {
    certificatePem: readFileSync(join(dir, 'pass.pem'), 'utf8'),
    privateKeyPem: readFileSync(join(dir, 'pass.p8'), 'utf8'),
    wwdrPem: readFileSync(join(dir, 'wwdr.pem'), 'utf8'),
  };

  it('copies the issuer and serial from the certificate', () => {
    const der = pemToDer(signer.certificatePem);
    const { serial } = certificateIssuerAndSerial(der);
    const x509 = new X509Certificate(signer.certificatePem);
    // INTEGER content may carry a leading 00 for a positive high-bit serial.
    expect(serial.subarray(2).toString('hex').replace(/^00/, '').toUpperCase()).toBe(x509.serialNumber.replace(/^00/, ''));
  });

  it('produces a detached signature OpenSSL verifies', async () => {
    const manifest = Buffer.from('{"pass.json":"0"}');
    writeFileSync(join(dir, 'manifest.json'), manifest);
    writeFileSync(join(dir, 'signature'), await signDetached(manifest, signer));
    expect(() =>
      execFileSync('openssl', [
        'smime', '-verify', '-binary', '-inform', 'DER', '-noverify',
        '-in', join(dir, 'signature'), '-content', join(dir, 'manifest.json'),
      ], { stdio: 'pipe' }),
    ).not.toThrow();
  });

  it('packages pass.json, images, the manifest and the signature', async () => {
    const pkpass = await buildPkpass({ formatVersion: 1 }, { 'icon.png': Buffer.from('png') }, signer);
    const names = [...pkpass.toString('latin1').matchAll(/(pass\.json|icon\.png|manifest\.json|signature)/g)].map((m) => m[1]);
    expect(new Set(names)).toEqual(new Set(['pass.json', 'icon.png', 'manifest.json', 'signature']));
    const manifest = JSON.parse(pkpass.toString('latin1').match(/\{"pass\.json":"[0-9a-f]{40}","icon\.png":"[0-9a-f]{40}"\}/)![0]);
    expect(manifest['icon.png']).toBe(createHash('sha1').update('png').digest('hex'));
  });
});
