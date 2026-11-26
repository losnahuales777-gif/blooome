import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

// Cifrado de datos sensibles en la aplicacion (AES-256-GCM), adicional al cifrado en reposo de Atlas.
// - Cada valor lleva su propio IV aleatorio y la etiqueta de autenticacion (detecta alteraciones).
// - "kid" identifica la llave para permitir rotarla en el futuro.
// - El contexto (AAD) ata el texto cifrado a su campo: no puede copiarse a otro campo y descifrarse.
// - Los valores sin cifrar (anteriores a la etapa 6) se leen tal cual hasta que se migran.
const ALG = 'aes-256-gcm';
const key = () => Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64');
const FILE_MAGIC = Buffer.from('LNE1');

export const isEncrypted = (v) => Boolean(v && typeof v === 'object' && v._enc === 1 && typeof v.ct === 'string');

export function encryptValue(value, context) {
  if (value === null || value === undefined || value === '') return value ?? null;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key(), iv);
  cipher.setAAD(Buffer.from(context));
  const ct = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return {
    _enc: 1,
    kid: env.ENCRYPTION_KEY_ID,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  };
}

export function decryptValue(stored, context) {
  if (!isEncrypted(stored)) return stored;
  if (stored.kid !== env.ENCRYPTION_KEY_ID) throw new Error(`Llave de cifrado desconocida: ${stored.kid}`);
  const decipher = createDecipheriv(ALG, key(), Buffer.from(stored.iv, 'base64'));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(stored.tag, 'base64'));
  const plain = Buffer.concat([decipher.update(Buffer.from(stored.ct, 'base64')), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}

// Archivos: "LNE1" + longitud del kid + kid + IV(12) + etiqueta(16) + contenido cifrado.
export function encryptBuffer(buf, context) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key(), iv);
  cipher.setAAD(Buffer.from(context));
  const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
  const kid = Buffer.from(env.ENCRYPTION_KEY_ID);
  return Buffer.concat([FILE_MAGIC, Buffer.from([kid.length]), kid, iv, cipher.getAuthTag(), ct]);
}

export const isEncryptedBuffer = (buf) => buf.length > 34 && buf.subarray(0, 4).equals(FILE_MAGIC);

export function decryptBuffer(buf, context) {
  if (!isEncryptedBuffer(buf)) return buf;
  const kidLen = buf[4];
  const kid = buf.subarray(5, 5 + kidLen).toString();
  if (kid !== env.ENCRYPTION_KEY_ID) throw new Error(`Llave de cifrado desconocida: ${kid}`);
  let p = 5 + kidLen;
  const iv = buf.subarray(p, (p += 12));
  const tag = buf.subarray(p, (p += 16));
  const decipher = createDecipheriv(ALG, key(), iv);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(buf.subarray(p)), decipher.final()]);
}
