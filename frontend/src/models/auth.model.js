// Capa MODEL: forma de los datos y reglas de validacion del lado cliente.
// La validacion real ocurre en el backend; esta solo mejora la experiencia de usuario.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_POLICY = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/;

export const EMPTY_CREDENTIALS = Object.freeze({ email: '', password: '' });

export function normalizeCredentials({ email, password }) {
  return { email: email.trim().toLowerCase(), password };
}

export function isValidEmail(email) {
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function validateCredentials({ email, password }) {
  const errors = {};
  if (!email) errors.email = 'El correo es obligatorio';
  else if (!isValidEmail(email)) errors.email = 'Correo inválido';

  if (!password) errors.password = 'La contraseña es obligatoria';
  else if (password.length > 128) errors.password = 'Contraseña demasiado larga';

  return errors;
}
