import { ageFromBirthDate, bmi, round } from '../../../calculations/src/index.js';
import { StatsModel } from '../models/stats.model.js';
import { PERMISSIONS } from './access.business.js';

// Capa BUSINESS del dashboard administrativo. El nutriologo ve las cifras de sus pacientes;
// quien tiene patients.view_all (super usuario) ve las de todo el consultorio.

const FOLLOW_UP_DAYS = 42;
const MEASUREMENT_DAYS = 60;
const BMI_BIN = 2.5; // ancho de clase del histograma de IMC (kg/m2)

const counts = (rows) => Object.fromEntries(rows.map((r) => [String(r._id), r.count]));
const pct = (num, den) => (den > 0 ? round((num / den) * 100, 1) : null);

function monthsBetween(from, to) {
  const out = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (d <= to) {
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

export const StatsBusiness = {
  async overview(actor, { from, to, tz }) {
    // Clinico: sus pacientes (o todos con view_all). Solo reportes (Administrativo): toda la practica, sin identificar.
    const clinical = actor.permissions.has(PERMISSIONS.PATIENTS_VIEW);
    const scope = !clinical || actor.permissions.has(PERMISSIONS.PATIENTS_VIEW_ALL) ? {} : { nutritionistId: actor.id };
    const ids = await StatsModel.patientIds(scope);
    const range = { from, to, tz };
    const dayRange = { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };

    const [patients, appts, overdue, noFollowUp, noMeasurements, adherence, indicators] = await Promise.all([
      StatsModel.patients(scope, range),
      StatsModel.appointments(ids, range),
      StatsModel.overdueAppointments(ids),
      StatsModel.withoutFollowUp(scope, FOLLOW_UP_DAYS),
      StatsModel.withoutRecentMeasurements(scope, MEASUREMENT_DAYS),
      StatsModel.adherenceByMonth(ids, dayRange),
      StatsModel.indicatorsByMonth(ids, range),
    ]);

    const status = counts(patients.status);
    const byStatus = counts(appts.byStatus);
    const done = byStatus.realizada ?? 0;
    const cancelled = byStatus.cancelada ?? 0;
    const missed = byStatus.no_asistida ?? 0;

    // Perfil actual de cada paciente activo (calculado con el motor, sin datos identificativos).
    const points = patients.profiles
      .map((p) => {
        const value = (() => {
          try {
            return bmi({ weightKg: p.weightKg, heightCm: p.heightCm }).value;
          } catch {
            return null;
          }
        })();
        const age = p.birthDate ? ageFromBirthDate(p.birthDate) : null;
        return Number.isFinite(value) && Number.isFinite(age) ? { age, bmi: value, goal: p.goal } : null;
      })
      .filter(Boolean);
    const histogram = new Map();
    for (const p of points) {
      const start = Math.floor(p.bmi / BMI_BIN) * BMI_BIN;
      histogram.set(start, (histogram.get(start) ?? 0) + 1);
    }

    const months = monthsBetween(from, to);
    const newByMonth = counts(patients.newByMonth);
    const apptMonth = new Map();
    for (const r of appts.byMonth) {
      const row = apptMonth.get(r._id.month) ?? {};
      row[r._id.status] = r.count;
      apptMonth.set(r._id.month, row);
    }
    const adherenceMonth = new Map(adherence.map((r) => [r._id, r]));
    const monthly = months.map((m) => {
      const a = apptMonth.get(m) ?? {};
      const ad = adherenceMonth.get(m);
      return {
        month: m,
        newPatients: newByMonth[m] ?? 0,
        scheduled: a.programada ?? 0,
        done: a.realizada ?? 0,
        cancelled: a.cancelada ?? 0,
        missed: a.no_asistida ?? 0,
        adherencePct: ad ? pct(ad.followed, ad.planned) : null,
      };
    });
    const yearly = [...new Set(months.map((m) => m.slice(0, 4)))].map((year) => {
      const rows = monthly.filter((r) => r.month.startsWith(year));
      const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
      return { year, newPatients: sum('newPatients'), done: sum('done'), cancelled: sum('cancelled'), missed: sum('missed') };
    });

    const totals = adherence.reduce((s, r) => ({ f: s.f + r.followed, p: s.p + r.planned }), { f: 0, p: 0 });

    return {
      scope: scope.nutritionistId ? 'own' : 'all',
      range: { from, to, tz },
      kpis: {
        activePatients: status.true ?? 0,
        inactivePatients: status.false ?? 0,
        newPatients: Object.values(newByMonth).reduce((s, n) => s + n, 0),
        appointments: { scheduled: appts.upcoming, done, cancelled, missed },
        attendancePct: pct(done, done + cancelled + missed),
        adherencePct: pct(totals.f, totals.p),
        pendingFollowUp: noFollowUp.length,
      },
      goals: counts(patients.goals),
      monthly,
      yearly,
      indicators: indicators.map((r) => ({
        month: r._id,
        avgWeightKg: round(r.avgWeightKg, 1),
        avgBmi: r.avgBmi === null ? null : round(r.avgBmi, 1),
        measurements: r.measurements,
        patients: r.patients,
      })),
      bmiHistogram: [...histogram.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([start, count]) => ({ from: start, to: start + BMI_BIN, count })),
      ageBmi: points,
      heatmap: appts.heatmap.map((r) => ({ day: r._id.day, hour: r._id.hour, count: r.count })),
      anonymized: !clinical,
      alerts: !clinical
        ? { overdueAppointments: [], withoutFollowUp: [], withoutRecentMeasurements: [] }
        : {
            overdueAppointments: overdue.map((a) => ({ patientId: a.patientId, fullName: a.fullName, scheduledAt: a.scheduledAt })),
            withoutFollowUp: noFollowUp.map((p) => ({ patientId: p._id, fullName: p.fullName, lastVisitAt: p.lastVisitAt ?? null })),
            withoutRecentMeasurements: noMeasurements.map((p) => ({
              patientId: p._id,
              fullName: p.fullName,
              lastMeasurementAt: p.lastMeasurementAt ?? null,
            })),
          },
    };
  },
};
