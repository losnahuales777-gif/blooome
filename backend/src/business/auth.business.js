import { env } from '../config/env.js';
import { UserModel } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import { SessionModel } from '../models/session.model.js';
import { codeMatches, MAX_CODE_ATTEMPTS } from '../utils/oneTimeCode.js';
import { signAccessToken } from '../utils/jwt.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../utils/password.js';
import { resolvePermissions, toUserDto } from './access.business.js';
import { AuditBusiness } from './audit.business.js';
import { SettingsBusiness } from './settings.business.js';

// Mensaje unico para cualquier fallo: no revela si el correo existe ni si la cuenta esta bloqueada.
const INVALID_CREDENTIALS = 'Credenciales invalidas';

// Capa BUSINESS: reglas de negocio de autenticacion, independientes de HTTP.
export const AuthBusiness = {
  async login({ email, password }, { ip, userAgent }) {
    const user = await UserModel.findByEmail(email);

    if (!user || !user.is_active) {
      await verifyPassword(password, DUMMY_HASH);
      await AuditBusiness.record({ event: 'LOGIN_FAILED_UNKNOWN_USER', ip, userAgent });
      throw new AppError(401, INVALID_CREDENTIALS);
    }

    if (user.locked_until && user.locked_until > new Date()) {
      await verifyPassword(password, DUMMY_HASH);
      await AuditBusiness.record({ userId: user.id, event: 'LOGIN_BLOCKED_LOCKED', ip, userAgent });
      throw new AppError(401, INVALID_CREDENTIALS);
    }

    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      const { security } = await SettingsBusiness.get();
      await UserModel.registerFailedAttempt(user.id, security.loginMaxAttempts, security.loginLockMinutes);
      await AuditBusiness.record({ userId: user.id, event: 'LOGIN_FAILED_BAD_PASSWORD', ip, userAgent });
      throw new AppError(401, INVALID_CREDENTIALS);
    }

    await UserModel.registerSuccessfulLogin(user.id);
    await AuditBusiness.record({ userId: user.id, event: 'LOGIN_SUCCESS', ip, userAgent });

    const { sid } = await SessionModel.create({ userId: user.id, ip, userAgent, ttlMinutes: env.JWT_EXPIRES_MINUTES });
    return { token: signAccessToken(user, sid), ...(await this.getProfile(user.id)) };
  },

  async changePassword(userId, { currentPassword, newPassword }, ctx, currentSid = null) {
    const currentHash = await UserModel.findPasswordHash(userId);
    if (!currentHash) throw new AppError(401, 'Sesion no valida');

    if (!(await verifyPassword(currentPassword, currentHash))) {
      await AuditBusiness.record({ ...ctx, userId, event: 'PASSWORD_CHANGE_FAILED' });
      throw new AppError(400, 'La contrasena actual no es correcta');
    }
    if (currentPassword === newPassword) {
      throw new AppError(400, 'La nueva contrasena debe ser distinta de la actual');
    }

    await UserModel.setPassword(userId, await hashPassword(newPassword));
    // Cambiar la contrasena cierra las demas sesiones abiertas de la cuenta.
    const closed = await SessionModel.revokeAllForUser(userId, 'cambio de contrasena', currentSid);
    await AuditBusiness.record({ ...ctx, userId, event: 'PASSWORD_CHANGED', details: `sesiones_cerradas=${closed}` });
  },

  // Canje de un codigo de un solo uso: activa una cuenta invitada o restablece la contrasena.
  // Cualquier fallo responde lo mismo (no revela si el correo existe, si el codigo vencio o si fue usado).
  async redeemCode({ email, code, password }, ctx) {
    const INVALID = 'Codigo invalido o vencido';
    const user = await UserModel.findForCode(email);
    const otc = user?.oneTimeCode;
    if (!otc || otc.expiresAt < new Date() || otc.attempts >= MAX_CODE_ATTEMPTS) {
      await AuditBusiness.record({ ...ctx, userId: user?._id ?? null, event: 'CODE_REDEEM_FAILED' });
      throw new AppError(400, INVALID);
    }
    if (!codeMatches(code, otc.codeHash)) {
      await UserModel.registerCodeAttempt(user._id);
      await AuditBusiness.record({ ...ctx, userId: user._id, event: 'CODE_REDEEM_FAILED' });
      throw new AppError(400, INVALID);
    }
    const ok = await UserModel.completeCode(user._id, otc.codeHash, await hashPassword(password));
    if (!ok) throw new AppError(400, INVALID);
    await SessionModel.revokeAllForUser(user._id, 'contrasena definida con codigo');
    await AuditBusiness.record({
      ...ctx,
      userId: user._id,
      event: otc.purpose === 'invite' ? 'ACCOUNT_ACTIVATED' : 'PASSWORD_RESET_COMPLETED',
    });
    return { activated: otc.purpose === 'invite' };
  },

  async logout(userId, sid, { ip, userAgent }) {
    await SessionModel.revoke(sid, 'cierre de sesion');
    await AuditBusiness.record({ userId, event: 'LOGOUT', ip, userAgent });
  },

  async listSessions(userId, currentSid) {
    const rows = await SessionModel.listActive(userId);
    return {
      items: rows.map((s) => ({
        id: s._id.slice(0, 8),
        current: s._id === currentSid,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        expiresAt: s.expiresAt,
        ip: s.ip,
        userAgent: s.userAgent,
      })),
      idleMinutes: (await SettingsBusiness.get()).security.sessionIdleMinutes,
    };
  },

  async revokeOtherSessions(userId, currentSid, ctx) {
    const closed = await SessionModel.revokeAllForUser(userId, 'cerrada por el usuario', currentSid);
    await AuditBusiness.record({ ...ctx, userId, event: 'SESSIONS_REVOKED', details: `sesiones=${closed}` });
    return { closed };
  },

  // Rol y permisos se leen de la base en cada peticion: un cambio o revocacion aplica al instante,
  // sin esperar a que caduque el JWT.
  async resolveSession(userId) {
    const user = await UserModel.findActiveById(userId);
    if (!user) throw new AppError(401, 'Sesion no valida');
    return { user, permissions: await resolvePermissions(user) };
  },

  async getProfile(userId) {
    const { user, permissions } = await this.resolveSession(userId);
    return { user: toUserDto(user), permissions: [...permissions].sort() };
  },
};
