import { ArrowLeft, FlaskConical, Plus, Ruler, Target, Utensils } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useAuth } from '../business/auth/useAuth.js';
import { useResource } from '../business/hooks/useResource.js';
import {
  CorrectionForm,
  GoalForm,
  IntakeForm,
  LabForm,
  MeasurementForm,
  OverrideForm,
} from '../components/analysis/AnalysisForms.jsx';
import { GoalsList, LabsTable, Timeline } from '../components/analysis/ClinicalHistory.jsx';
import EvaluationTable from '../components/analysis/EvaluationTable.jsx';
import { CategoryBars, DailyBarChart, GroupedBars } from '../components/charts/BarCharts.jsx';
import { ChartCard, KpiCard } from '../components/charts/ChartParts.jsx';
import RangeFilter from '../components/charts/RangeFilter.jsx';
import TimeSeriesChart from '../components/charts/TimeSeriesChart.jsx';
import Alert from '../components/ui/Alert.jsx';
import { ui } from '../components/ui/styles.js';
import { PERMISSIONS as P } from '../models/access.model.js';
import { fmt, formatResult, KINDS, latestByField, rangeFromPreset } from '../models/analysis.model.js';
import { ageFrom, GOALS } from '../models/patient.model.js';
import { analysisService } from '../services/analysis.service.js';

const avg = (rows, key) => {
  const v = rows.map((r) => r[key]).filter(Number.isFinite);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};

// Dashboard individual: evaluacion trazable, evolucion antropometrica, consumo y seguimiento.
export default function PatientAnalysisPage({ embedded = false, patientId }) {
  const params = useParams();
  const id = patientId ?? params.id;
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(P.PATIENTS_MANAGE);
  const [preset, setPreset] = useState('semestre');
  const [custom, setCustom] = useState({});
  const [panel, setPanel] = useState(null);
  const [notice, setNotice] = useState({ type: '', text: '' });

  const range = useMemo(() => rangeFromPreset(preset, custom), [preset, custom]);
  const { data: a, error, loading, reload } = useResource(() => analysisService.get(id, range), [id, range.from, range.to]);

  const result = (formula) => a?.evaluation.find((r) => r.formula === formula);
  const kindLabel = (r) => (r?.override ? KINDS.ajustado.label : KINDS[r?.kind]?.label);

  // Cada registro nuevo recarga el analisis: los graficos se actualizan solos.
  const save = (fn, message) => async (payload) => {
    await fn(payload);
    setPanel(null);
    setNotice({ type: 'success', text: message });
    reload();
  };

  async function cancelAppointment(appt) {
    const reason = window.prompt('Motivo de la cancelacion de la cita');
    if (!reason || reason.trim().length < 3) return;
    try {
      await analysisService.cancelAppointment(id, appt.id, reason.trim());
      setNotice({ type: 'success', text: 'Cita cancelada.' });
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }

  async function setGoalStatus(goal, status) {
    try {
      await analysisService.setGoalStatus(id, goal.id, status);
      reload();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    }
  }

  const s = a?.series;
  const currentWeight = s?.weightKg.at(-1)?.value ?? null;
  const initial = a?.reference.initialWeight?.value ?? null;
  const macroRows = a?.targets.macros
    ? [
        { label: 'Proteinas', registrado: avg(a.intake, 'proteinG'), prescrito: a.targets.macros.protein },
        { label: 'Carbohidratos', registrado: avg(a.intake, 'carbsG'), prescrito: a.targets.macros.carbs },
        { label: 'Grasas', registrado: avg(a.intake, 'fatG'), prescrito: a.targets.macros.fat },
      ]
    : [];
  const adherenceRows = (a?.intake ?? []).map((d) => ({
    date: d.date,
    pct: Number.isFinite(d.mealsPlanned) && d.mealsPlanned > 0 && Number.isFinite(d.mealsFollowed) ? (d.mealsFollowed / d.mealsPlanned) * 100 : null,
  }));

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {!embedded && (
            <Link to={`/pacientes/${id}`} className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
              <ArrowLeft className="size-4" aria-hidden="true" /> Ficha del paciente
            </Link>
          )}
          {embedded ? (
            <h2 className="text-xl font-semibold">Evolucion y analisis</h2>
          ) : (
            <h1 className="text-2xl font-semibold">{a?.patient.fullName ?? 'Analisis del paciente'}</h1>
          )}
          {a && (
            <p className="text-muted">
              {ageFrom(a.patient.birthDate)} anos, {GOALS.find((g) => g.code === a.patient.goal)?.label}
              {a.patient.targetWeightKg && `, peso objetivo ${fmt.number(a.patient.targetWeightKg)} kg`}
            </p>
          )}
        </div>
        {canEdit && a && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ui.btnPrimary} onClick={() => setPanel({ type: 'measurement' })}>
              <Ruler className="size-4" aria-hidden="true" /> Nueva medicion
            </button>
            <button type="button" className={ui.btnSecondary} onClick={() => setPanel({ type: 'intake' })}>
              <Utensils className="size-4" aria-hidden="true" /> Registrar consumo
            </button>
            <button type="button" className={ui.btnSecondary} onClick={() => setPanel({ type: 'lab' })}>
              <FlaskConical className="size-4" aria-hidden="true" /> Laboratorio
            </button>
          </div>
        )}
      </div>

      <RangeFilter preset={preset} custom={custom} onPresetChange={setPreset} onCustomChange={setCustom} />
      <Alert>{error}</Alert>
      <Alert variant={notice.type || 'info'}>{notice.text}</Alert>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Peso actual" value={fmt.number(currentWeight)} unit="kg" kind="Medido" hint={s?.weightKg.at(-1) && fmt.date(s.weightKg.at(-1).date)} />
        <KpiCard label="Cambio de peso" value={formatResult(result('cambio_peso_pct')?.effectiveValue, '%')} kind={kindLabel(result('cambio_peso_pct'))} hint="desde la primera medicion" />
        <KpiCard label="IMC" value={formatResult(result('imc')?.effectiveValue, 'kg/m2')} kind={kindLabel(result('imc'))} />
        <KpiCard label="Avance al objetivo" value={formatResult(result('progreso_peso_objetivo')?.effectiveValue, '%')} kind={kindLabel(result('progreso_peso_objetivo'))} tone="accent" />
        <KpiCard label="Adherencia al plan" value={formatResult(result('adherencia_plan')?.effectiveValue, '%')} kind={kindLabel(result('adherencia_plan'))} hint="dias registrados" />
        <KpiCard label="Consumo promedio" value={formatResult(result('promedio_consumo_calorico')?.effectiveValue, 'kcal/dia')} kind={kindLabel(result('promedio_consumo_calorico'))} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Evolucion del peso"
          description="Mediciones vigentes; la linea discontinua es el peso objetivo."
          loading={loading && !a}
          empty={!s?.weightKg.length}
          emptyText="Registra mediciones para ver la evolucion."
        >
          {s && <TimeSeriesChart series={[{ key: 'w', label: 'Peso', points: s.weightKg }]} unit="kg" reference={a.targets.weightKg ? { value: a.targets.weightKg, label: 'Objetivo' } : null} />}
        </ChartCard>

        <ChartCard title="Peso inicial, actual y objetivo" loading={loading && !a} empty={!Number.isFinite(currentWeight)}>
          <CategoryBars
            unit="kg"
            data={[
              { label: 'Inicial', value: initial, kind: 'medido' },
              { label: 'Actual', value: currentWeight, kind: 'medido' },
              ...(a?.targets.weightKg ? [{ label: 'Objetivo', value: a.targets.weightKg, kind: 'prescrito' }] : []),
            ].filter((d) => Number.isFinite(d.value))}
          />
          {!a?.targets.weightKg && <p className="text-xs text-muted">Define un peso objetivo en el expediente para compararlo.</p>}
        </ChartCard>

        <ChartCard title="Evolucion del IMC" description="Calculado en cada medicion (peso / estatura²)." loading={loading && !a} empty={!s?.bmi.length}>
          {s && <TimeSeriesChart series={[{ key: 'b', label: 'IMC', points: s.bmi }]} unit="kg/m²" />}
        </ChartCard>

        <ChartCard title="Cintura y cadera" loading={loading && !a} empty={!s?.waistCm.length && !s?.hipCm.length}>
          {s && (
            <TimeSeriesChart
              series={[
                { key: 'waist', label: 'Cintura', points: s.waistCm },
                { key: 'hip', label: 'Cadera', points: s.hipCm },
              ].filter((x) => x.points.length)}
              unit="cm"
            />
          )}
        </ChartCard>

        <ChartCard
          title="Masa grasa y masa muscular"
          description="Solo con mediciones validas de composicion corporal."
          loading={loading && !a}
          empty={!s?.fatMassKg.length && !s?.muscleMassKg.length}
          emptyText="Sin mediciones de composicion corporal (bioimpedancia, pliegues o DEXA)."
        >
          {s && (
            <TimeSeriesChart
              series={[
                { key: 'fat', label: 'Masa grasa (calculada)', points: s.fatMassKg },
                { key: 'muscle', label: 'Masa muscular (medida)', points: s.muscleMassKg },
              ].filter((x) => x.points.length)}
              unit="kg"
            />
          )}
        </ChartCard>

        <ChartCard
          title="Macronutrientes: registrado y prescrito"
          description="Promedio diario registrado frente al reparto prescrito (25/50/25)."
          loading={loading && !a}
          empty={!macroRows.length || macroRows.every((r) => r.registrado === null)}
          emptyText="Registra el consumo diario para comparar con la prescripcion."
        >
          <GroupedBars
            data={macroRows}
            unit="g"
            series={[
              { key: 'registrado', label: 'Registrado (promedio)' },
              { key: 'prescrito', label: 'Prescrito' },
            ]}
          />
        </ChartCard>

        <ChartCard title="Energia registrada y objetivo" loading={loading && !a} empty={!a?.intake.some((d) => Number.isFinite(d.kcal))}>
          {a && <DailyBarChart data={a.intake} dataKey="kcal" label="Energia registrada" unit="kcal" target={a.targets.kcal} targetLabel="Objetivo prescrito" />}
        </ChartCard>

        <ChartCard title="Cumplimiento del plan" description="Comidas seguidas / planificadas por dia." loading={loading && !a} empty={!adherenceRows.some((d) => Number.isFinite(d.pct))}>
          <DailyBarChart data={adherenceRows} dataKey="pct" label="Cumplimiento" unit="%" max={100} />
        </ChartCard>

        <ChartCard title="Hidratacion" loading={loading && !a} empty={!a?.intake.some((d) => Number.isFinite(d.waterMl))}>
          {a && <DailyBarChart data={a.intake} dataKey="waterMl" label="Agua registrada" unit="ml" target={a.targets.waterMl} targetLabel="Estimacion orientativa" />}
        </ChartCard>

        <ChartCard title="Actividad fisica" loading={loading && !a} empty={!a?.intake.some((d) => Number.isFinite(d.activityMinutes))}>
          {a && <DailyBarChart data={a.intake} dataKey="activityMinutes" label="Minutos de actividad" unit="min" />}
        </ChartCard>
      </div>

      <ChartCard title="Evaluacion nutricional" description="Calculos del motor con su origen y version de formula." loading={loading && !a}>
        {a && <EvaluationTable evaluation={a.evaluation} canEdit={canEdit} onAdjust={(r) => setPanel({ type: 'override', result: r })} />}
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Indicadores metabolicos y laboratorio" loading={loading && !a}>
          {a && <LabsTable labs={a.labs} />}
        </ChartCard>
        <ChartCard
          title="Objetivos"
          loading={loading && !a}
          actions={
            canEdit && (
              <button type="button" className={ui.btnSecondary} onClick={() => setPanel({ type: 'goal' })}>
                <Target className="size-4" aria-hidden="true" /> <Plus className="-ml-1 size-3" aria-hidden="true" /> Objetivo
              </button>
            )
          }
        >
          {a && <GoalsList goals={a.goals} canEdit={canEdit} onStatus={setGoalStatus} />}
        </ChartCard>
      </div>

      <ChartCard title="Historial de consultas y evaluaciones" loading={loading && !a}>
        {a && <Timeline analysis={a} canEdit={canEdit} onCorrect={(m) => setPanel({ type: 'correct', measurement: m })} onCancel={cancelAppointment} />}
      </ChartCard>

      {panel?.type === 'measurement' && (
        <MeasurementForm previous={latestByField(a?.measurements)} onClose={() => setPanel(null)} onSave={save((d) => analysisService.addMeasurement(id, d), 'Medicion registrada.')} />
      )}
      {panel?.type === 'correct' && (
        <CorrectionForm
          measurement={panel.measurement}
          onClose={() => setPanel(null)}
          onSave={save((d) => analysisService.correctMeasurement(id, panel.measurement.id, d), 'Correccion guardada; la version original se conserva.')}
        />
      )}
      {panel?.type === 'intake' && <IntakeForm onClose={() => setPanel(null)} onSave={save((d) => analysisService.addIntake(id, d), 'Consumo registrado.')} />}
      {panel?.type === 'lab' && <LabForm onClose={() => setPanel(null)} onSave={save((d) => analysisService.addLab(id, d), 'Resultado registrado.')} />}
      {panel?.type === 'goal' && <GoalForm onClose={() => setPanel(null)} onSave={save((d) => analysisService.addGoal(id, d), 'Objetivo agregado.')} />}
      {panel?.type === 'override' && (
        <OverrideForm result={panel.result} onClose={() => setPanel(null)} onSave={save((d) => analysisService.addOverride(id, d), 'Ajuste profesional guardado.')} />
      )}
    </section>
  );
}
