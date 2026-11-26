import { Router } from 'express';
import { authenticate } from '../middlewares/authenticate.js';
import alertsRoutes from './alerts/alerts.routes.js';
import privacyRoutes from './privacy/privacy.routes.js';
import systemRoutes from './system/system.routes.js';
import portalRoutes from './portal/portal.routes.js';
import patientAccountsRoutes from './patients/patientAccounts.routes.js';
import accessRoutes from './access/access.routes.js';
import analysisRoutes from './analysis/analysis.routes.js';
import authRoutes from './auth/auth.routes.js';
import catalogsRoutes from './catalogs/catalogs.routes.js';
import documentsRoutes from './documents/documents.routes.js';
import chartRoutes from './chart/chart.routes.js';
import patientsRoutes from './patients/patients.routes.js';
import recordsRoutes from './records/records.routes.js';
import statsRoutes from './stats/stats.routes.js';
import usersRoutes from './users/users.routes.js';
import worklistsRoutes from './worklists/worklists.routes.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok' }));
router.use('/auth', authRoutes);

// A partir de aqui todo exige sesion valida; cada ruta exige ademas su permiso.
router.use(authenticate);
router.use('/users', usersRoutes);
router.use('/records', recordsRoutes);
router.use('/patients', patientAccountsRoutes);
router.use('/patients', patientsRoutes);
router.use('/patients', analysisRoutes);
router.use('/patients', chartRoutes);
router.use('/patients', documentsRoutes);
router.use('/clinical', worklistsRoutes);
router.use('/catalogs', catalogsRoutes);
router.use(alertsRoutes);
router.use(privacyRoutes);
router.use('/system', systemRoutes);
router.use('/portal', portalRoutes);
router.use('/stats', statsRoutes);
router.use('/access', accessRoutes);

export default router;
