import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate.js';
import { loginLimiter } from '../../middlewares/rateLimiter.js';
import { validate } from '../../middlewares/validate.js';
import { AuthController } from './auth.controller.js';
import { AuthBusiness } from '../../business/auth.business.js';
import { requestContext } from '../../utils/requestContext.js';
import { changePasswordSchema, loginSchema, redeemSchema } from './auth.validator.js';

const router = Router();

router.get('/csrf', AuthController.csrf);
router.post('/login', loginLimiter, validate({ body: loginSchema }), AuthController.login);
router.post('/logout', authenticate, AuthController.logout);
// Activar cuenta (invitacion de paciente) o definir contrasena tras un restablecimiento. Mismo limite que el login.
router.post('/redeem', loginLimiter, validate({ body: redeemSchema }), async (req, res) => {
  res.json(await AuthBusiness.redeemCode(req.valid.body, requestContext(req)));
});
router.get('/me', authenticate, AuthController.me);
router.get('/sessions', authenticate, AuthController.sessions);
router.post('/sessions/revoke-others', authenticate, AuthController.revokeOthers);
// Mismo limite que el login: impide adivinar la contrasena actual por fuerza bruta.
router.post('/password', authenticate, loginLimiter, validate({ body: changePasswordSchema }), AuthController.changePassword);

export default router;
