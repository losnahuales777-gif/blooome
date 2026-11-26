import { env } from '../../config/env.js';
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS as P, visibleMaxLevel } from '../../business/access.business.js';
import { AuditBusiness } from '../../business/audit.business.js';
import { MODULES, SettingsBusiness } from '../../business/settings.business.js';
import { collection, getDb } from '../../config/database.js';
import { RoleModel } from '../../models/role.model.js';
import { requireAnyPermission, requirePermission } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import { AppError } from '../../utils/AppError.js';
import { requestContext as ctx } from '../../utils/requestContext.js';

// Administracion tecnica y de gobierno (montado en /api/system):
// - Sistemas: salud, errores tecnicos, respaldos y parametros tecnicos.
// - Superusuario: modulos y parametros de seguridad.
// - Administrativo: actividad operativa de los usuarios.
// Ninguna de estas rutas devuelve informacion clinica.
const router = Router();
const run = promisify(execFile);
const BACKEND = fileURLToPath(new URL('../../../', import.meta.url));
const BACKUPS = new URL('../../../backups/', import.meta.url);

// Configuracion visible para cualquier sesion (para que la interfaz oculte modulos desactivados).
router.get('/public', async (_req, res) => {
  const s = await SettingsBusiness.get();
  res.json({ modules: s.modules, maintenanceMessage: s.technical.maintenanceMessage, aiProvider: env.AI_PROVIDER });
});

router.get('/settings', requireAnyPermission(P.SYSTEM_SETTINGS, P.SECURITY_SETTINGS, P.MODULES_MANAGE), async (req, res) => {
  const s = await SettingsBusiness.get();
  const can = (p) => req.user.permissions.has(p);
  res.json({
    moduleNames: MODULES,
    modules: s.modules,
    ...(can(P.SECURITY_SETTINGS) && { security: s.security }),
    technical: s.technical,
    updatedAt: s.updatedAt,
  });
});

router.put(
  '/settings/modules',
  requirePermission(P.MODULES_MANAGE),
  validate({ body: z.strictObject(Object.fromEntries(Object.keys(MODULES).map((m) => [m, z.boolean().optional()]))) }),
  async (req, res) => res.json(await SettingsBusiness.update(req.user, 'modules', req.valid.body, ctx(req))),
);

router.put(
  '/settings/security',
  requirePermission(P.SECURITY_SETTINGS),
  validate({
    body: z.strictObject({
      sessionIdleMinutes: z.number().int().min(5).max(480).optional(),
      loginMaxAttempts: z.number().int().min(3).max(20).optional(),
      loginLockMinutes: z.number().int().min(5).max(1440).optional(),
      aiRequiresConsent: z.boolean().optional(),
    }),
  }),
  async (req, res) => res.json(await SettingsBusiness.update(req.user, 'security', req.valid.body, ctx(req))),
);

router.put(
  '/settings/technical',
  requirePermission(P.SYSTEM_SETTINGS),
  validate({ body: z.strictObject({ maintenanceMessage: z.string().trim().max(300).optional() }) }),
  async (req, res) => res.json(await SettingsBusiness.update(req.user, 'technical', req.valid.body, ctx(req))),
);

// Salud del aplicativo: solo metricas tecnicas y conteos (sin contenido de las colecciones).
router.get('/health', requirePermission(P.SYSTEM_HEALTH), async (_req, res) => {
  const t0 = performance.now();
  await getDb().command({ ping: 1 });
  const dbPingMs = Math.round(performance.now() - t0);
  const names = (await getDb().listCollections({}, { nameOnly: true }).toArray())
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.'))
    .sort();
  const counts = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await collection(n).estimatedDocumentCount()])));
  const since = new Date(Date.now() - 86400000);
  const [errors24h, activeSessions] = await Promise.all([
    collection('erroresSistema').countDocuments({ at: { $gte: since } }),
    collection('sesiones').countDocuments({ revokedAt: null, expiresAt: { $gt: new Date() } }),
  ]);
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    node: process.version,
    memoryMb: Math.round(mem.rss / 1048576),
    dbPingMs,
    errors24h,
    activeSessions,
    collections: counts,
  });
});

router.get('/errors', requirePermission(P.SYSTEM_HEALTH), async (_req, res) => {
  const items = await collection('erroresSistema')
    .find({}, { projection: { _id: 0 } })
    .sort({ at: -1 })
    .limit(200)
    .toArray();
  res.json({ items });
});

// Respaldos: lista de manifiestos (sin el contenido) y creacion de un respaldo cifrado nuevo.
router.get('/backups', requirePermission(P.SYSTEM_BACKUPS), async (_req, res) => {
  let files = [];
  try {
    files = (await readdir(BACKUPS)).filter((f) => f.endsWith('.lnbak.json'));
  } catch {
    files = [];
  }
  const items = await Promise.all(
    files.map(async (f) => {
      const m = JSON.parse(await readFile(new URL(f, BACKUPS), 'utf8'));
      return {
        file: m.file,
        database: m.database,
        createdAt: m.createdAt,
        documents: Object.values(m.counts ?? {}).reduce((s, n) => s + n, 0),
        sha256: m.sha256,
      };
    }),
  );
  res.json({ items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});

router.post('/backups', requirePermission(P.SYSTEM_BACKUPS), async (req, res) => {
  let out;
  try {
    out = await run(process.execPath, ['--env-file-if-exists=.env', 'scripts/backup.js'], {
      cwd: BACKEND,
      timeout: 300_000,
      env: process.env,
    });
  } catch {
    throw new AppError(500, 'El respaldo no se pudo completar; revisa los registros del servidor');
  }
  const file = out.stdout.match(/backups\/(\S+\.lnbak)/)?.[1] ?? null;
  await AuditBusiness.record({ ...ctx(req), userId: req.user.id, event: 'BACKUP_CREATED', details: `archivo=${file}` });
  res.status(201).json({ file });
});

// Actividad operativa: accesos y acciones por usuario en los ultimos 30 dias (sin contenido de las acciones).
router.get('/activity', requirePermission(P.ACTIVITY_VIEW), async (req, res) => {
  const since = new Date(Date.now() - 30 * 86400000);
  const roleIds = await RoleModel.idsUpToLevel(visibleMaxLevel(req.user));
  const users = await collection('users')
    .find({ deletedAt: null, roleId: { $in: roleIds } }, { projection: { fullName: 1, email: 1, roleId: 1, isActive: 1, lastLoginAt: 1 } })
    .limit(1000)
    .toArray();
  const ids = users.map((u) => u._id);
  const [actions, sessions, roles] = await Promise.all([
    collection('auditLog')
      .aggregate([
        { $match: { userId: { $in: ids }, createdAt: { $gte: since } } },
        { $group: { _id: '$userId', actions: { $sum: 1 }, logins: { $sum: { $cond: [{ $eq: ['$event', 'LOGIN_SUCCESS'] }, 1, 0] } } } },
      ])
      .toArray(),
    collection('sesiones')
      .aggregate([
        { $match: { userId: { $in: ids }, revokedAt: null, expiresAt: { $gt: new Date() } } },
        { $group: { _id: '$userId', n: { $sum: 1 } } },
      ])
      .toArray(),
    RoleModel.list(),
  ]);
  const a = new Map(actions.map((x) => [x._id, x]));
  const s = new Map(sessions.map((x) => [x._id, x.n]));
  const r = new Map(roles.map((x) => [x.id, x.name]));
  res.json({
    items: users.map((u) => ({
      id: u._id,
      fullName: u.fullName,
      email: u.email,
      role: r.get(u.roleId) ?? '—',
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt ?? null,
      logins30d: a.get(u._id)?.logins ?? 0,
      actions30d: a.get(u._id)?.actions ?? 0,
      activeSessions: s.get(u._id) ?? 0,
    })),
  });
});

export default router;
