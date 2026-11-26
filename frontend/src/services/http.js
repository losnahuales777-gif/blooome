// Capa SERVICE: unico punto de comunicacion con la API.
const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';
const CSRF_COOKIE = 'csrf_token';
const TIMEOUT_MS = 15_000;

// Respuesta sin cuerpo JSON de la API con 5xx: el proxy de desarrollo no alcanzo al servidor (apagado o reiniciando).
const UNAVAILABLE = 'El servidor no esta disponible en este momento. Espera unos segundos e intenta de nuevo.';
const fallbackMessage = (status, generic = 'Error inesperado') => (status >= 500 ? UNAVAILABLE : generic);

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

function readCookie(name) {
  const entry = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

async function ensureCsrfToken() {
  if (!readCookie(CSRF_COOKIE)) {
    await fetch(`${BASE_URL}/auth/csrf`, { credentials: 'include' });
  }
  return readCookie(CSRF_COOKIE) ?? '';
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = await ensureCsrfToken();

  let response;
  try {
    // credentials: 'include' envia la cookie HttpOnly con el JWT; el token nunca toca localStorage.
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(0, UNAVAILABLE);
  }

  if (response.status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new CustomEvent('lanutria:session-ended'));
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(response.status, data.error ?? fallbackMessage(response.status), data.details);
  }
  return data;
}

function withQuery(path, query) {
  if (!query) return path;
  const params = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== null));
  return `${path}?${params}`;
}

// Peticiones con archivos: subida en bruto y descarga como Blob (con la misma cookie y CSRF).
async function binary(path, { method = 'GET', body, headers = {} } = {}) {
  const h = { ...headers };
  if (method !== 'GET') h['X-CSRF-Token'] = await ensureCsrfToken();
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { method, headers: h, body, credentials: 'include', signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new HttpError(0, UNAVAILABLE);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new HttpError(response.status, data.error ?? (response.status === 413 ? 'El archivo supera 5 MB' : fallbackMessage(response.status)), data.details);
  }
  return response;
}

export const http = {
  upload: async (path, file, headers) => (await binary(path, { method: 'POST', body: file, headers })).json(),
  download: async (path) => (await binary(path)).blob(),
  get: (path, query) => request(withQuery(path, query)),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
