// "Recordarme" guarda solo el correo en este dispositivo para no reescribirlo.
// Nunca se guarda la contrasena ni el token (el token vive en una cookie HttpOnly).
const KEY = 'lanutria-remember-email';

export function loadRememberedEmail() {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveRememberedEmail(email, remember) {
  try {
    if (remember) localStorage.setItem(KEY, email);
    else localStorage.removeItem(KEY);
  } catch {
    // Almacenamiento bloqueado: simplemente no se recuerda.
  }
}
