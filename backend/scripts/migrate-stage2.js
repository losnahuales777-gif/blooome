// Migracion de la etapa 2: elimina del expediente los datos duplicados y versiona los planes.
//
//  - Peso, estatura y cintura guardados en "patients" pasan a ser una medicion del historico si el
//    paciente no tiene ninguna medicion con ese dato (metodo "registro migrado").
//  - nextVisitAt / lastVisitAt pasan a "citas" si no existe ya la cita equivalente.
//  - Despues se eliminan esos campos del expediente (ahora se derivan de mediciones y citas).
//  - Cada plan de la coleccion anterior "mealPlans" se copia como version 1 en "planesAlimenticios".
//    La coleccion anterior NO se borra: queda como respaldo.
//
// No inventa datos: solo traslada valores que ya estaban registrados, marcados con source "migracion".
// Es idempotente (se puede ejecutar varias veces).
//
// Uso:  npm run migrate:stage2            (simulacion: muestra lo que haria, no escribe)
//       npm run migrate:stage2 -- --apply (aplica los cambios)
import { bootstrapDatabase } from '../src/config/bootstrap.js';
import { closeDb, collection, connectDb } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { AuditModel } from '../src/models/audit.model.js';
import { MealPlanModel } from '../src/models/mealPlan.model.js';

const APPLY = process.argv.includes('--apply');
const MEASURES = ['weightKg', 'heightCm', 'waistCm'];
const LEGACY_FIELDS = { weightKg: '', heightCm: '', waistCm: '', nextVisitAt: '', lastVisitAt: '' };
const counts = { patients: 0, measurements: 0, scheduled: 0, completed: 0, cleaned: 0, plans: 0 };

try {
  await connectDb();
  console.log(`Base "${env.MONGODB_DB}" — ${APPLY ? 'APLICANDO cambios' : 'SIMULACION (sin escribir)'}`);
  if (APPLY) await bootstrapDatabase();

  const patients = await collection('patients')
    .find({ $or: Object.keys(LEGACY_FIELDS).map((f) => ({ [f]: { $exists: true } })) })
    .toArray();

  for (const p of patients) {
    counts.patients += 1;
    // 1. Medidas: solo las que no existan ya en el historico.
    const values = {};
    for (const f of MEASURES) {
      if (!Number.isFinite(p[f])) continue;
      const has = await collection('mediciones').countDocuments(
        { patientId: p._id, supersededBy: null, [`values.${f}`]: { $type: 'number' } },
        { limit: 1 },
      );
      if (!has) values[f] = p[f];
    }
    if (Object.keys(values).length) {
      counts.measurements += 1;
      if (APPLY) {
        await collection('mediciones').insertOne({
          patientId: p._id,
          appointmentId: null,
          takenAt: p.updatedAt ?? p.createdAt ?? new Date(),
          values,
          method: 'registro migrado',
          notes: 'Valor que estaba en el expediente antes de la etapa 2',
          source: 'migracion',
          supersedes: null,
          supersededBy: null,
          recordedBy: null,
          recordedAt: new Date(),
        });
      }
    }

    // 2. Proxima cita futura sin cita programada equivalente.
    if (p.nextVisitAt instanceof Date && p.nextVisitAt > new Date()) {
      const pending = await collection('citas').countDocuments({ patientId: p._id, status: 'programada' }, { limit: 1 });
      if (!pending) {
        counts.scheduled += 1;
        if (APPLY) {
          await collection('citas').insertOne({
            patientId: p._id,
            nutritionistId: p.nutritionistId,
            scheduledAt: p.nextVisitAt,
            status: 'programada',
            source: 'migracion',
            createdBy: null,
            createdAt: new Date(),
          });
        }
      }
    }

    // 3. Ultima consulta registrada sin ninguna cita realizada.
    if (p.lastVisitAt instanceof Date) {
      const done = await collection('citas').countDocuments({ patientId: p._id, status: 'realizada' }, { limit: 1 });
      if (!done) {
        counts.completed += 1;
        if (APPLY) {
          await collection('citas').insertOne({
            patientId: p._id,
            nutritionistId: p.nutritionistId,
            scheduledAt: p.lastVisitAt,
            completedAt: p.lastVisitAt,
            status: 'realizada',
            source: 'migracion',
            createdBy: null,
            createdAt: new Date(),
          });
        }
      }
    }

    // 4. Sin copias en el expediente.
    counts.cleaned += 1;
    if (APPLY) await collection('patients').updateOne({ _id: p._id }, { $unset: LEGACY_FIELDS });
  }

  // 5. Planes: version 1 a partir de la coleccion anterior.
  for (const doc of await collection('mealPlans').find({}).toArray()) {
    const exists = await collection('planesAlimenticios').countDocuments({ patientId: doc._id }, { limit: 1 });
    if (exists) continue;
    counts.plans += 1;
    if (APPLY) await MealPlanModel.importLegacy(doc._id, doc);
  }

  if (APPLY) {
    const indexes = await collection('patients').indexes();
    if (indexes.some((i) => i.name === 'idx_patients_next_visit')) await collection('patients').dropIndex('idx_patients_next_visit');
    await AuditModel.log({
      event: 'MIGRATION_STAGE2',
      details: Object.entries(counts)
        .map(([k, v]) => `${k}=${v}`)
        .join(' '),
    });
  }

  console.log('Pacientes con campos duplicados:', counts.patients);
  console.log('  mediciones a crear (valores sin historico):', counts.measurements);
  console.log('  citas programadas a crear:', counts.scheduled);
  console.log('  citas realizadas a crear:', counts.completed);
  console.log('  expedientes a limpiar:', counts.cleaned);
  console.log('Planes a versionar (version 1):', counts.plans);
  if (!APPLY) console.log('\nNada se escribio. Ejecuta con --apply para aplicar.');
} catch (err) {
  console.error(`Migracion detenida: ${err.name}: ${err.message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
