import { collection } from './database.js';
import { AlertsBusiness } from '../business/alerts.business.js';
import { logger } from './logger.js';

// Equivalente al antiguo schema.sql: indices + catalogo RBAC. Se ejecuta en cada arranque y es
// idempotente: solo agrega lo que falte, nunca borra ni sobrescribe datos existentes.

import { PERMISSIONS, RBAC_VERSION, ROLES } from './rbac.catalog.js';

async function ensureIndexes() {
  await Promise.all([
    collection('users').createIndexes([
      { key: { email: 1 }, name: 'uq_users_email', unique: true },
      { key: { roleId: 1 }, name: 'idx_users_role' },
    ]),
    collection('userPermissions').createIndex({ userId: 1, permissionId: 1 }, { name: 'uq_user_permission', unique: true }),
    collection('patients').createIndexes([{ key: { nutritionistId: 1, fullName: 1 }, name: 'idx_patients_nutritionist' }]),
    collection('records').createIndex({ ownerId: 1, createdAt: -1 }, { name: 'idx_records_owner' }),
    collection('patients').createIndex({ createdAt: 1 }, { name: 'idx_patients_created' }),
    collection('mediciones').createIndexes([
      { key: { patientId: 1, takenAt: 1 }, name: 'idx_mediciones_paciente_fecha' },
      { key: { takenAt: 1 }, name: 'idx_mediciones_fecha' },
      { key: { appointmentId: 1 }, name: 'idx_mediciones_consulta', sparse: true },
    ]),
    collection('citas').createIndexes([
      { key: { patientId: 1, scheduledAt: -1 }, name: 'idx_citas_paciente' },
      { key: { patientId: 1, status: 1, scheduledAt: 1 }, name: 'idx_citas_estado' },
      { key: { nutritionistId: 1, status: 1 }, name: 'idx_citas_nutriologo' },
    ]),
    collection('consumos').createIndex({ patientId: 1, date: 1, recordedAt: -1 }, { name: 'idx_consumos_paciente_dia' }),
    collection('laboratorios').createIndex({ patientId: 1, takenAt: -1 }, { name: 'idx_laboratorios_paciente' }),
    collection('objetivos').createIndex({ patientId: 1, createdAt: -1 }, { name: 'idx_objetivos_paciente' }),
    collection('ajustesClinicos').createIndex({ patientId: 1, formula: 1, adjustedAt: -1 }, { name: 'idx_ajustes_paciente' }),
    collection('evaluaciones').createIndex({ patientId: 1, computedAt: -1 }, { name: 'idx_evaluaciones_paciente' }),
    collection('antecedentes').createIndexes([
      { key: { patientId: 1, supersededBy: 1, category: 1 }, name: 'idx_antecedentes_vigentes' },
      { key: { rootId: 1, version: -1 }, name: 'idx_antecedentes_versiones' },
    ]),
    collection('notasClinicas').createIndexes([
      { key: { patientId: 1, consultationAt: -1 }, name: 'idx_notas_paciente' },
      { key: { status: 1, consultationAt: -1 }, name: 'idx_notas_estado' },
      { key: { appointmentId: 1 }, name: 'idx_notas_consulta', sparse: true },
    ]),
    collection('planesAlimenticios').createIndexes([
      { key: { patientId: 1, version: 1 }, name: 'uq_planes_version', unique: true },
      { key: { patientId: 1, status: 1 }, name: 'idx_planes_vigente' },
    ]),
    collection('catalogos').createIndexes([
      { key: { type: 1, source: 1, code: 1 }, name: 'uq_catalogo_termino', unique: true },
      { key: { type: 1, active: 1, name: 1 }, name: 'idx_catalogo_busqueda' },
    ]),
    collection('reglasAlerta').createIndex({ type: 1, system: 1 }, { name: 'idx_reglas_tipo' }),
    collection('reglasAlertaVersiones').createIndex({ ruleId: 1, version: -1 }, { name: 'idx_reglas_versiones' }),
    collection('alertasRevision').createIndexes([
      { key: { patientId: 1, key: 1 }, name: 'uq_alerta_revision', unique: true },
      { key: { patientId: 1, at: -1 }, name: 'idx_alerta_revision_fecha' },
    ]),
    collection('documentos').createIndexes([
      { key: { patientId: 1, createdAt: -1 }, name: 'idx_documentos_paciente' },
      {
        key: { patientId: 1, reportType: 1, version: 1 },
        name: 'uq_documentos_version',
        unique: true,
        partialFilterExpression: { kind: 'reporte' },
      },
    ]),
    collection('sesiones').createIndexes([
      { key: { userId: 1, revokedAt: 1 }, name: 'idx_sesiones_usuario' },
      { key: { purgeAt: 1 }, name: 'ttl_sesiones', expireAfterSeconds: 0 },
    ]),
    collection('consentimientos').createIndex({ patientId: 1, type: 1, recordedAt: -1 }, { name: 'idx_consentimientos_paciente' }),
    collection('erroresSistema').createIndex({ at: 1 }, { name: 'ttl_errores', expireAfterSeconds: 90 * 86400 }),
    collection('notificaciones').createIndex({ userId: 1, createdAt: -1 }, { name: 'idx_notificaciones_usuario' }),
    collection('users').createIndex(
      { patientId: 1 },
      { name: 'uq_usuario_paciente', unique: true, partialFilterExpression: { patientId: { $type: 'number' } } },
    ),
    collection('notasVersiones').createIndex({ noteId: 1, version: -1 }, { name: 'idx_notas_versiones' }),
    collection('diagnosticos').createIndex({ patientId: 1, recordedAt: -1 }, { name: 'idx_diagnosticos_paciente' }),
    collection('auditLog').createIndexes([
      { key: { createdAt: -1 }, name: 'idx_audit_date' },
      { key: { userId: 1 }, name: 'idx_audit_user' },
      { key: { event: 1, createdAt: -1 }, name: 'idx_audit_event_date' },
    ]),
  ]);
}

async function seedCatalog() {
  // Permisos: el catalogo del codigo es la fuente de verdad de su descripcion y clasificacion.
  await collection('permissions').bulkWrite(
    PERMISSIONS.map(([code, description, module, action, isDelegable, clinical]) => ({
      updateOne: { filter: { _id: code }, update: { $set: { description, module, action, isDelegable, clinical } }, upsert: true },
    })),
  );
  // Roles del sistema: se crean si faltan. Cuando la definicion sube de version se actualizan sus datos y se
  // AGREGAN los permisos nuevos (nunca se quitan los que el superusuario haya otorgado al rol).
  const now = new Date();
  await collection('roles').bulkWrite(
    ROLES.map(({ _id, code, name, description, level, family, permissions }) => ({
      updateOne: {
        filter: { _id },
        update: {
          $setOnInsert: {
            code,
            name,
            description,
            level,
            family,
            permissions,
            system: true,
            active: true,
            rbacVersion: RBAC_VERSION,
            createdAt: now,
          },
        },
        upsert: true,
      },
    })),
  );
  for (const r of ROLES) {
    await collection('roles').updateOne(
      { _id: r._id, $or: [{ rbacVersion: { $exists: false } }, { rbacVersion: { $lt: RBAC_VERSION } }] },
      {
        $set: {
          code: r.code,
          name: r.name,
          description: r.description,
          level: r.level,
          family: r.family,
          system: true,
          active: true,
          rbacVersion: RBAC_VERSION,
        },
        $addToSet: { permissions: { $each: r.permissions } },
      },
    );
  }
  // El superusuario siempre tiene todos los permisos del catalogo.
  await collection('roles').updateOne({ code: 'superuser' }, { $addToSet: { permissions: { $each: PERMISSIONS.map(([c]) => c) } } });
}

export async function bootstrapDatabase() {
  await ensureIndexes();
  await seedCatalog();
  await AlertsBusiness.ensureDefaults();
  logger.info('Base de datos lista: indices y catalogo de roles verificados');
}
