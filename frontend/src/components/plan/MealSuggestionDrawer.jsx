import { AlertTriangle, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useSystemConfig } from '../../business/system/useSystemConfig.js';
import { MEALS, planTotals } from '../../models/mealPlan.model.js';
import { mealPlansService } from '../../services/patients.service.js';
import Alert from '../ui/Alert.jsx';
import Drawer from '../ui/Drawer.jsx';
import { ui } from '../ui/styles.js';

const FIELDS = [
  ['preferences', 'Alimentos que prefiere', 'Ej. avena, pollo, frutas de temporada'],
  ['dislikes', 'Alimentos que no consume', 'Ej. pescado, lacteos'],
  ['budget', 'Presupuesto', 'Ej. bajo, 700 pesos por semana'],
  ['cookingTime', 'Tiempo para cocinar', 'Ej. 20 minutos entre semana'],
  ['schedule', 'Horarios y actividad', 'Ej. trabaja de 9 a 6, entrena en la tarde'],
];

// Sugerencia de plan con IA (skill nutriplan). Muestra la propuesta con sus advertencias; solo se
// carga al editor con la confirmacion del profesional y nunca se guarda sola.
export default function MealSuggestionDrawer({ patientId, onClose, onUse }) {
  const [prefs, setPrefs] = useState(Object.fromEntries(FIELDS.map(([k]) => [k, ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsConsent, setNeedsConsent] = useState(false);
  const provider = useSystemConfig().aiProvider === 'gemini' ? 'Gemini, de Google' : 'Claude, de Anthropic';
  const [s, setS] = useState(null);
  const [reviewed, setReviewed] = useState(false);

  async function ask(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNeedsConsent(false);
    setS(null);
    setReviewed(false);
    try {
      setS(await mealPlansService.suggest(patientId, Object.fromEntries(Object.entries(prefs).map(([k, v]) => [k, v.trim()]))));
    } catch (err) {
      setError(err.message);
      // 409: falta el consentimiento "ia_asistente" (lo exige el servidor antes de enviar datos al asistente).
      setNeedsConsent(err.status === 409 && /consentimiento/i.test(err.message));
    } finally {
      setBusy(false);
    }
  }

  const totals = s ? planTotals({ meals: s.meals }) : null;
  const canUse = s && (!s.requiresReview || reviewed);

  return (
    <Drawer
      title="Sugerir plan con IA"
      onClose={onClose}
      footer={
        s ? (
          <>
            <button type="button" className={ui.btnPrimary} disabled={!canUse} onClick={() => onUse(s)}>
              Cargar en el editor
            </button>
            <button type="button" className={ui.btnSecondary} onClick={() => setS(null)}>
              Pedir otra
            </button>
          </>
        ) : null
      }
    >
      {!s && (
        <form onSubmit={ask} className="space-y-4">
          <p className="text-sm text-muted">
            Bloome envia al asistente ({provider}) solo datos sin identificar: edad, sexo, actividad, objetivo, medidas, energia
            estimada, alergias, condiciones y medicamentos vigentes, y lo que escribas abajo. La propuesta sigue la guia NutriPlan y no se
            guarda hasta que la revises.
          </p>
          <Alert variant="info">No escribas nombres, telefonos ni otros datos que identifiquen al paciente.</Alert>
          {FIELDS.map(([k, label, ph]) => (
            <label key={k} className="block text-sm">
              <span className={ui.label}>{label} (opcional)</span>
              <input className={ui.input} maxLength={300} placeholder={ph} value={prefs[k]} onChange={(e) => setPrefs((p) => ({ ...p, [k]: e.target.value }))} />
            </label>
          ))}
          <Alert>{error}</Alert>
          {needsConsent && (
            <Link to={`/pacientes/${patientId}?tab=historia&consentimiento=ia_asistente`} className={ui.btnSecondary} onClick={onClose}>
              Ir a registrar el consentimiento
            </Link>
          )}
          <button type="submit" className={ui.btnPrimary} disabled={busy}>
            <Sparkles className="size-4" aria-hidden="true" /> {busy ? 'Elaborando propuesta (puede tardar un minuto)...' : 'Pedir propuesta'}
          </button>
        </form>
      )}

      {s && (
        <div className="space-y-4 text-sm">
          {s.warnings.length > 0 && (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-3">
              <p className="flex items-center gap-2 font-semibold text-warning">
                <AlertTriangle className="size-4" aria-hidden="true" /> Advertencias
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {s.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <p>{s.summary}</p>
          <p className="text-muted">{s.approach}</p>
          {MEALS.map((m) => (
            <div key={m.code}>
              <p className="font-semibold">{m.label}</p>
              {(s.meals[m.code] ?? []).length === 0 ? (
                <p className="text-muted">Sin alimentos</p>
              ) : (
                <ul className="list-disc pl-5">
                  {s.meals[m.code].map((f, i) => (
                    <li key={i}>
                      {f.name} <span className="text-muted">({f.portion})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <p className="text-xs text-muted">
            Total estimado: {Math.round(totals.kcal).toLocaleString('es-MX')} kcal. Los macronutrientes de cada alimento son estimaciones del
            asistente: verificalos antes de usar el plan.
          </p>
          {s.assumptions.length > 0 && (
            <details>
              <summary className="cursor-pointer font-medium">Supuestos ({s.assumptions.length})</summary>
              <ul className="mt-1 list-disc pl-5">
                {s.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </details>
          )}
          <details>
            <summary className="cursor-pointer font-medium">Lista de compra y sustituciones</summary>
            {s.shoppingList.map((g) => (
              <p key={g.section} className="mt-1">
                <span className="font-medium">{g.section}:</span> {g.items.join(', ')}
              </p>
            ))}
            <ul className="mt-2 list-disc pl-5">
              {s.substitutions.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </details>
          <p>
            <span className="font-medium">Seguimiento:</span> {s.followUp}
          </p>
          <details>
            <summary className="cursor-pointer font-medium">Datos enviados al asistente</summary>
            <pre className="mt-1 overflow-x-auto rounded-xl bg-tint p-3 text-xs">{JSON.stringify(s.sentProfile, null, 2)}</pre>
          </details>
          <p className="text-xs text-muted">Generado por {s.model}. Es una propuesta: no sustituye el criterio profesional.</p>
          {s.requiresReview && (
            <label className="flex items-start gap-2 rounded-xl bg-tint p-3">
              <input type="checkbox" className="mt-1" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
              <span>Revise las advertencias y las condiciones del paciente; la propuesta es adecuada para cargarla y ajustarla.</span>
            </label>
          )}
        </div>
      )}
    </Drawer>
  );
}
