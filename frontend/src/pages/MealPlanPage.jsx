import { History, Printer, Save, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useAuth } from '../business/auth/useAuth.js';
import { usePatients } from '../business/patients/usePatients.js';
import BmiBadge from '../components/patients/BmiMark.jsx';
import MacroBalance from '../components/plan/MacroBalance.jsx';
import MealSection from '../components/plan/MealSection.jsx';
import MealSuggestionDrawer from '../components/plan/MealSuggestionDrawer.jsx';
import Alert from '../components/ui/Alert.jsx';
import Drawer from '../components/ui/Drawer.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { ui } from '../components/ui/styles.js';
import { PERMISSIONS as P } from '../models/access.model.js';
import { fmt } from '../models/analysis.model.js';
import { macroTargets, MEALS, planTotals } from '../models/mealPlan.model.js';
import { GOALS } from '../models/patient.model.js';
import { mealPlansService } from '../services/patients.service.js';

const withIds = (plan) => ({
  ...plan,
  meals: Object.fromEntries(
    Object.entries(plan.meals ?? {}).map(([code, items]) => [code, items.map((i) => ({ ...i, id: crypto.randomUUID() }))]),
  ),
});

const withoutIds = (plan) => ({
  meals: Object.fromEntries(Object.entries(plan.meals).map(([code, items]) => [code, items.map(({ id: _id, ...i }) => i)])),
});

export default function MealPlanPage() {
  const { hasPermission } = useAuth();
  const readOnly = !hasPermission(P.MEAL_PLANS_MANAGE);
  const { patients, loading: loadingPatients } = usePatients();
  const [params, setParams] = useSearchParams();
  const patientId = Number(params.get('paciente')) || null;
  const patient = patients.find((p) => p.id === patientId);

  const [plan, setPlan] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState('');
  const [showVersions, setShowVersions] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);

  useEffect(() => {
    setPlan(null);
    setDirty(false);
    setStatus({ type: '', text: '' });
    if (!patientId) return;
    let active = true;
    mealPlansService
      .get(patientId)
      .then((data) => active && setPlan(withIds(data)))
      .catch((err) => active && setStatus({ type: 'error', text: err.message }));
    return () => {
      active = false;
    };
  }, [patientId]);

  // Aviso del navegador al cerrar la pagina con cambios del plan sin guardar.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function changeMeal(code, update) {
    setPlan((prev) => ({ ...prev, meals: { ...prev.meals, [code]: update(prev.meals[code] ?? []) } }));
    setDirty(true);
    setStatus({ type: '', text: '' });
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Cada guardado crea una version nueva; expectedVersion evita sobrescribir cambios de otra persona.
      const saved = await mealPlansService.save(patientId, { ...withoutIds(plan), reason: reason.trim(), expectedVersion: plan.version ?? 0 });
      setPlan(withIds(saved));
      setDirty(false);
      setReason('');
      setStatus({
        type: 'success',
        text: saved.version > 1 ? `Plan guardado como version ${saved.version}. La version anterior se conserva.` : 'Plan guardado (version 1).',
      });
    } catch (err) {
      setStatus({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  const totals = plan ? planTotals(plan) : null;
  const targets = patient ? macroTargets(patient.kcalTarget) : null;

  return (
    <section>
      <PageHeader
        title="Plan alimenticio"
        description="Distribucion diaria por tiempo de comida, calculada sobre la meta energetica del paciente."
        actions={
          plan && (
            <div className="flex gap-2 print:hidden">
              <button type="button" className={ui.btnSecondary} onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden="true" /> Imprimir
              </button>
              {plan.version > 0 && (
                <button type="button" className={ui.btnSecondary} onClick={() => setShowVersions(true)}>
                  <History className="size-4" aria-hidden="true" /> Versiones
                </button>
              )}
              {!readOnly && (
                <button type="button" className={ui.btnSecondary} onClick={() => setShowSuggest(true)}>
                  <Sparkles className="size-4" aria-hidden="true" /> Sugerir con IA
                </button>
              )}
              {!readOnly && (
                <button type="button" className={ui.btnPrimary} onClick={handleSave} disabled={!dirty || saving}>
                  <Save className="size-4" aria-hidden="true" /> {saving ? 'Guardando...' : 'Guardar plan'}
                </button>
              )}
            </div>
          )
        }
      />

      <div className="mb-6 max-w-md print:hidden">
        <label htmlFor="plan-patient" className={ui.label}>
          Paciente
        </label>
        <select
          id="plan-patient"
          className={ui.input}
          value={patientId ?? ''}
          disabled={loadingPatients}
          onChange={(e) => {
            if (dirty && !window.confirm('Hay cambios sin guardar en este plan. ¿Descartarlos?')) return;
            setParams(e.target.value ? { paciente: e.target.value } : {});
          }}
        >
          <option value="">Elige un paciente...</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.fullName} ({p.age} anos)
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <Alert variant={status.type || 'info'}>{status.text}</Alert>
      </div>

      {!patientId && (
        <p className="rounded-xl border border-dashed border-line p-10 text-center text-muted">
          Elige un paciente para ver su plan o armar uno nuevo.
        </p>
      )}

      {patient && plan && (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line pb-4">
              <h2 className="text-2xl font-semibold">{patient.fullName}</h2>
              <span className="text-muted">{patient.age} anos</span>
              <BmiBadge category={patient.bmiCategory} value={patient.bmi} />
              <span className="text-muted">{GOALS.find((g) => g.code === patient.goal)?.label}</span>
              <span className="text-sm text-muted">
                {plan.version > 0 ? `Version ${plan.version} · ${fmt.dateTime(plan.updatedAt)}` : 'Sin plan guardado'}
              </span>
              {dirty && <span className="text-sm font-bold text-highlight">Cambios sin guardar</span>}
            </div>
            {dirty && !readOnly && (
              <div className="mb-6 max-w-xl print:hidden">
                <label htmlFor="plan-reason" className={ui.label}>
                  Motivo del cambio (opcional, queda en la version)
                </label>
                <input id="plan-reason" className={ui.input} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            )}

            <ol className="space-y-8 border-l-2 border-line pl-0 [&>li]:-ml-[9px]">
              {MEALS.map((meal) => (
                <MealSection
                  key={meal.code}
                  meal={meal}
                  items={plan.meals[meal.code] ?? []}
                  kcalGoal={Math.round((patient.kcalTarget * meal.share) / 10) * 10}
                  readOnly={readOnly}
                  onAdd={(food) => changeMeal(meal.code, (items) => [...items, { ...food, id: crypto.randomUUID() }])}
                  onRemove={(id) => changeMeal(meal.code, (items) => items.filter((i) => i.id !== id))}
                />
              ))}
            </ol>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className={`${ui.card} p-5`}>
              <h2 className="mb-1 text-lg font-semibold">Balance del dia</h2>
              <p className="mb-5 text-sm text-muted">Planeado contra la meta de {patient.kcalTarget.toLocaleString('es-MX')} kcal.</p>
              <MacroBalance totals={totals} kcalTarget={patient.kcalTarget} targets={targets} />
              <p className="mt-5 border-t border-line pt-4 text-xs text-muted">
                Reparto de referencia: 25% proteinas, 50% carbohidratos, 25% grasas.
              </p>
            </div>
          </aside>
        </div>
      )}
      {showVersions && patientId && <PlanVersions patientId={patientId} onClose={() => setShowVersions(false)} />}
      {showSuggest && patientId && (
        <MealSuggestionDrawer
          patientId={patientId}
          onClose={() => setShowSuggest(false)}
          onUse={(s) => {
            // La propuesta reemplaza el contenido del editor (sin guardar); el motivo deja constancia de su origen.
            setPlan((prev) => withIds({ ...prev, meals: s.meals }));
            setDirty(true);
            setReason(`Basado en propuesta de IA (${s.model}, guia NutriPlan) revisada por el profesional`);
            setStatus({ type: 'info', text: 'Propuesta cargada en el editor. Revisa y ajusta los alimentos; se guardara solo al pulsar "Guardar plan".' });
            setShowSuggest(false);
          }}
        />
      )}
    </section>
  );
}

// Historial de versiones del plan: ninguna prescripcion anterior se pierde.
function PlanVersions({ patientId, onClose }) {
  const [versions, setVersions] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    mealPlansService
      .versions(patientId)
      .then((r) => active && setVersions(r.items))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [patientId]);

  async function view(v) {
    if (open?.version === v.version) return setOpen(null);
    try {
      setOpen(await mealPlansService.version(patientId, v.version));
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <Drawer title="Versiones del plan" onClose={onClose}>
      <Alert>{error}</Alert>
      {!versions && !error && <p className="text-sm text-muted">Cargando...</p>}
      {versions?.length === 0 && <p className="text-sm text-muted">El plan aun no tiene versiones guardadas.</p>}
      <ol className="space-y-3">
        {(versions ?? []).map((v) => (
          <li key={v.version} className="rounded-xl border border-line p-4 text-sm">
            <button type="button" className="w-full text-left" onClick={() => view(v)} aria-expanded={open?.version === v.version}>
              <span className="font-semibold">Version {v.version}</span>{' '}
              <span className={v.status === 'vigente' ? 'font-medium text-success' : 'text-muted'}>({v.status})</span>
              <span className="block text-xs text-muted">
                {fmt.dateTime(v.createdAt)} · {v.foods} alimentos · {v.kcal.toLocaleString('es-MX')} kcal
              </span>
              {v.reason && <span className="mt-1 block">{v.reason}</span>}
            </button>
            {open?.version === v.version && (
              <ul className="mt-3 space-y-1 border-t border-line pt-3">
                {MEALS.map((m) => (
                  <li key={m.code}>
                    <span className="font-medium">{m.label}:</span>{' '}
                    {(open.meals[m.code] ?? []).map((f) => `${f.name} (${f.portion})`).join(', ') || <span className="text-muted">sin alimentos</span>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </Drawer>
  );
}
