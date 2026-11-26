import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

// Parametros recomendados por OWASP Password Storage Cheat Sheet para scrypt.
const COST = 2 ** 17;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;
const MAX_MEM = 256 * 1024 * 1024;

function derive(password, salt, N, r, p) {
  return scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r, p, maxmem: MAX_MEM });
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLELISM);
  return ['scrypt', COST, BLOCK_SIZE, PARALLELISM, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, storedHash) {
  const parts = String(storedHash).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await derive(password, Buffer.from(saltB64, 'base64'), Number(N), Number(r), Number(p));

  // Comparacion en tiempo constante para evitar ataques de temporizacion.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Hash ficticio: se verifica contra el cuando el usuario no existe, para que la respuesta
// tarde lo mismo y no se pueda enumerar usuarios midiendo tiempos.
export const DUMMY_HASH = await hashPassword(randomBytes(32).toString('hex'));

// Politica de contrasenas para altas de usuario (ISO 27001 A.5.17).
export const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/;

// Lista legible de los requisitos que una contrasena no cumple (vacia si cumple todos).
export function passwordPolicyGaps(password) {
  const gaps = [];
  if (password.length < 12) gaps.push(`al menos 12 caracteres (tiene ${password.length})`);
  if (password.length > 128) gaps.push('maximo 128 caracteres');
  if (!/[a-z]/.test(password)) gaps.push('una letra minuscula');
  if (!/[A-Z]/.test(password)) gaps.push('una letra MAYUSCULA');
  if (!/\d/.test(password)) gaps.push('un numero');
  if (!/[^A-Za-z0-9]/.test(password)) gaps.push('un simbolo, por ejemplo ! @ # $ % & *');
  return gaps;
}
