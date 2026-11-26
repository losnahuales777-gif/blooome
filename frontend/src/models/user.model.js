import { isValidEmail, PASSWORD_POLICY } from './auth.model.js';

export const EMPTY_USER = Object.freeze({ email: '', fullName: '', password: '', role: 'user' });

export function validateNewUser({ email, fullName, password }) {
  const errors = {};
  if (!isValidEmail(email.trim())) errors.email = 'Correo invalido';
  if (fullName.trim().length < 2) errors.fullName = 'Nombre demasiado corto';
  if (!PASSWORD_POLICY.test(password)) {
    errors.password = 'Minimo 12 caracteres con mayuscula, minuscula, numero y simbolo';
  }
  return errors;
}

export function formatDate(value) {
  return value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}
