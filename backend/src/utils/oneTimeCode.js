import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

// Codigos de un solo uso para invitar pacientes y restablecer contrasenas (sin correo electronico):
// el administrador entrega el codigo por un canal seguro. Se guarda solo su hash; caducan y tienen un
// numero maximo de intentos. Alfabeto sin caracteres ambiguos (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const MAX_CODE_ATTEMPTS = 5;

export function generateCode(length = 12) {
  let code = '';
  for (let i = 0; i < length; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code.match(/.{1,4}/g).join('-');
}

const normalizeCode = (code) =>
  String(code)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
export const hashCode = (code) => createHash('sha256').update(normalizeCode(code)).digest('hex');

export function codeMatches(code, storedHash) {
  const a = Buffer.from(hashCode(code), 'hex');
  const b = Buffer.from(String(storedHash ?? ''), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
