import { z } from 'zod';
import { PASSWORD_POLICY } from '../../utils/password.js';

export const loginSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Correo invalido')),
  // Longitud maxima para evitar DoS con contrasenas enormes en el hash.
  password: z.string().min(1, 'La contrasena es obligatoria').max(128),
});

// Canje de codigo de invitacion o de restablecimiento.
export const redeemSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('Correo invalido')),
  code: z.string().trim().min(8).max(20),
  password: z.string().regex(PASSWORD_POLICY, 'Minimo 12 caracteres con mayuscula, minuscula, numero y simbolo'),
});

export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1, 'Escribe tu contrasena actual').max(128),
  newPassword: z.string().regex(PASSWORD_POLICY, 'Minimo 12 caracteres con mayuscula, minuscula, numero y simbolo'),
});
