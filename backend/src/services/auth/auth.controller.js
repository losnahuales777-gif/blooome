import { env } from '../../config/env.js';
import { AuthBusiness } from '../../business/auth.business.js';
import { ACCESS_COOKIE } from '../../middlewares/authenticate.js';
import { CSRF_COOKIE, generateCsrfToken } from '../../middlewares/csrf.js';
import { requestContext } from '../../utils/requestContext.js';

const baseCookie = {
  secure: env.isProd,
  sameSite: 'strict',
  path: '/',
};

function issueCsrfCookie(res) {
  const token = generateCsrfToken();
  // No es HttpOnly a proposito: el frontend debe leerla para reenviarla en la cabecera.
  res.cookie(CSRF_COOKIE, token, { ...baseCookie, httpOnly: false });
  return token;
}

// Capa SERVICE: traduce HTTP <-> Business. Sin reglas de negocio aqui.
export const AuthController = {
  csrf(_req, res) {
    res.json({ csrfToken: issueCsrfCookie(res) });
  },

  async login(req, res) {
    const { token, user, permissions } = await AuthBusiness.login(req.valid.body, requestContext(req));

    res.cookie(ACCESS_COOKIE, token, {
      ...baseCookie,
      httpOnly: true,
      maxAge: env.JWT_EXPIRES_MINUTES * 60 * 1000,
    });
    // Se rota el token CSRF tras autenticarse.
    issueCsrfCookie(res);
    res.json({ user, permissions });
  },

  async logout(req, res) {
    await AuthBusiness.logout(req.user.id, req.user.sid, requestContext(req));
    res.clearCookie(ACCESS_COOKIE, { ...baseCookie, httpOnly: true });
    res.clearCookie(CSRF_COOKIE, baseCookie);
    res.status(204).end();
  },

  async changePassword(req, res) {
    await AuthBusiness.changePassword(req.user.id, req.valid.body, requestContext(req), req.user.sid);
    res.status(204).end();
  },

  async sessions(req, res) {
    res.json(await AuthBusiness.listSessions(req.user.id, req.user.sid));
  },

  async revokeOthers(req, res) {
    res.json(await AuthBusiness.revokeOtherSessions(req.user.id, req.user.sid, requestContext(req)));
  },

  async me(req, res) {
    res.json(await AuthBusiness.getProfile(req.user.id));
  },
};
