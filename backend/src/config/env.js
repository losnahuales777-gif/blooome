import { z } from 'zod';

// Validacion de variables de entorno al arrancar: si falta algo critico, la app no inicia.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.url(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\/\S+$/, 'MONGODB_URI debe ser una cadena de conexion mongodb:// o mongodb+srv://'),
  MONGODB_DB: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,63}$/, 'MONGODB_DB invalido')
    .default('nutria'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRES_MINUTES: z.coerce.number().int().positive().max(60).default(15),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  // Llave AES-256 en base64 (32 bytes) para cifrar datos sensibles y documentos. Sin ella no se inicia.
  DATA_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'DATA_ENCRYPTION_KEY debe ser de 32 bytes en base64'),
  ENCRYPTION_KEY_ID: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,20}$/)
    .default('k1'),
  // Cierre de sesion por inactividad (minutos).
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(480).default(30),
  // Anos de conservacion del expediente desde su ultima actividad (confirmar con asesoria juridica).
  RETENTION_YEARS: z.coerce.number().int().min(1).max(50).default(5),
  // Asistente de IA para sugerir planes (opcional): sin clave, la funcion queda desactivada.
  ANTHROPIC_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(20).optional()),
  AI_MODEL: z
    .string()
    .regex(/^[a-z0-9.-]{3,60}$/)
    .default('claude-opus-5-5'),
  // Proveedor del asistente: anthropic (Claude, predeterminado) o gemini (Google AI Studio, p. ej. para pruebas).
  AI_PROVIDER: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['anthropic', 'gemini']).default('anthropic')),
  GEMINI_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(20).optional()),
  GEMINI_MODEL: z
    .string()
    .regex(/^[a-z0-9.-]{3,60}$/)
    .default('gemini-3.1-flash-lite'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Configuracion invalida en variables de entorno:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = Object.freeze({
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
});
