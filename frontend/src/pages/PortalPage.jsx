import { Bell, CalendarDays, Download, FileText, Salad, Target, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../business/auth/useAuth.js';
import { useResource } from '../business/hooks/useResource.js';
import Alert from '../components/ui/Alert.jsx';
import { StatusBadge } from '../components/ui/DataTable.jsx';
import { ui } from '../components/ui/styles.js';
import { APPOINTMENT_STATUS, fmt } from '../models/analysis.model.js';
import { GOAL_STATUS } from '../models/analysis.model.js';
import { MEALS } from '../models/mealPlan.model.js';
import { portalService } from '../services/admin.service.js';

// Portal del paciente: solo su propia informacion (el servidor decide cual a partir de la sesion).
function Card({ icon: Icon, title, children }) {
  return (
    <section className={`${ui.card} p-6`}>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <Icon className="size-5 text-highlight" aria-hidden="true" /> {title}
      </h2>
      {children}
    </section>
  );
}

function ProfileForm({ me, onSaved }) {
  const [form, setForm] = useState({ phone: me.phone, email: me.email, address: me.address, emergencyContact: me.emergencyContact });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setEc = (k, v) => setForm((f) => ({ ...f, emergencyContact: { ...f.emergencyContact, [k]: v } }));

  async function submit(e) {
    e.preventDefault();
    try {
      await portalService.updateMe(form);
      setMsg({ type: 'success', text: 'Tus datos de contacto se actualizaron.' });
      onSaved();
    } catch (err) {
      setMsg({ type: 'error', text: err.details?.map((d) => d.message).join('. ') || err.message });
    }
  }

  const input = (id, label, value, onChange, type = 'text', max = 120) => (
    <label htmlFor={id} className="block text-sm">
      <span className={ui.label}>{label}</span>
      <input id={id} type={type} className={ui.input} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-muted">
        {me.fullName} · {me.age} anos. Tu nombre y fecha de nacimiento solo los corrige tu nutriologo.
      </p>
      <Alert variant={msg.type || 'info'}>{msg.text}</Alert>
      <div className="grid gap-3 sm:grid-cols-2">
        {input('pt-phone', 'Telefono', form.phone, (v) => set('phone', v), 'tel', 20)}
        {input('pt-email', 'Correo de contacto', form.email, (v) => set('email', v), 'email', 254)}
        <div className="sm:col-span-2">{input('pt-address', 'Domicilio', form.address, (v) => set('address', v), 'text', 200)}</div>
        {input('pt-ec-name', 'Contacto de emergencia', form.emergencyContact.name, (v) => setEc('name', v))}
        {input('pt-ec-phone', 'Telefono de emergencia', form.emergencyContact.phone, (v) => setEc('phone', v), 'tel', 20)}
      </div>
      <button type="submit" className={ui.btnPrimary}>
        Guardar
      </button>
    </form>
  );
}

export default function PortalPage() {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  const me = useResource(() => portalService.me(), [tick]);
  const summary = useResource(() => portalService.summary(), []);
  const appts = useResource(() => portalService.appointments(), []);
  const notes = useResource(() => portalService.notifications(), [tick]);
  const [error, setError] = useState('');
  const upcoming = (appts.data?.items ?? []).filter((a) => a.status === 'programada').sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const s = summary.data;

  // Marca como leidas las notificaciones al verlas.
  useEffect(() => {
    const unread = (notes.data?.items ?? []).filter((n) => !n.read);
    if (unread.length) Promise.all(unread.map((n) => portalService.markRead(n.id))).catch(() => {});
  }, [notes.data]);

  async function download(d) {
    try {
      const blob = await portalService.documentFile(d.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = d.title;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Hola, {user.fullName.split(' ')[0]}</h1>
        <p className="text-muted">{me.data?.nutritionistName ? `Tu nutriologo: ${me.data.nutritionistName}` : 'Tu espacio personal en Bloome'}</p>
      </header>
      <Alert>{me.error || summary.error || error}</Alert>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card icon={CalendarDays} title="Mis citas">
          {upcoming[0] ? (
            <p className="mb-3 rounded-xl bg-tint px-4 py-3">
              Proxima cita: <span className="font-semibold">{fmt.dateTime(upcoming[0].scheduledAt)}</span>
            </p>
          ) : (
            <p className="mb-3 text-sm text-muted">No tienes citas programadas.</p>
          )}
          <ul className="divide-y divide-line text-sm">
            {(appts.data?.items ?? []).slice(0, 8).map((a) => (
              <li key={a.id} className="flex justify-between py-2">
                <span>{fmt.dateTime(a.scheduledAt)}</span>
                <StatusBadge tone={a.status === 'realizada' ? 'success' : a.status === 'cancelada' ? 'neutral' : 'info'}>{APPOINTMENT_STATUS[a.status] ?? a.status}</StatusBadge>
              </li>
            ))}
          </ul>
        </Card>

        <Card icon={Bell} title="Notificaciones">
          {(notes.data?.items ?? []).length === 0 ? (
            <p className="text-sm text-muted">Sin notificaciones.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {notes.data.items.slice(0, 10).map((n) => (
                <li key={n.id} className="py-2">
                  <span className={n.read ? '' : 'font-semibold'}>{n.title}</span>
                  {n.type === 'cita' && n.body && <span className="text-muted"> · {fmt.dateTime(n.body)}</span>}
                  <span className="block text-xs text-muted">{fmt.dateTime(n.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card icon={Salad} title="Mi plan alimenticio">
          {!s?.plan ? (
            <p className="text-sm text-muted">Tu nutriologo aun no ha guardado un plan.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <p className="text-xs text-muted">
                Version {s.plan.version} · {fmt.date(s.plan.updatedAt)}
              </p>
              {MEALS.map((m) => (
                <p key={m.code}>
                  <span className="font-medium">{m.label}:</span> {(s.plan.meals[m.code] ?? []).map((f) => `${f.name} (${f.portion})`).join(', ') || '—'}
                </p>
              ))}
            </div>
          )}
        </Card>

        <Card icon={Target} title="Mis objetivos y mediciones">
          <ul className="mb-3 space-y-1 text-sm">
            {(s?.goals ?? []).map((g, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span>{g.description}</span>
                <StatusBadge tone={g.status === 'cumplido' ? 'success' : 'info'}>{GOAL_STATUS[g.status] ?? g.status}</StatusBadge>
              </li>
            ))}
            {s && s.goals.length === 0 && <li className="text-muted">Sin objetivos registrados.</li>}
          </ul>
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={ui.th}>Fecha</th>
                <th className={`${ui.th} text-right`}>Peso (kg)</th>
                <th className={`${ui.th} text-right`}>Cintura (cm)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...(s?.measurements ?? [])]
                .reverse()
                .slice(0, 6)
                .map((m, i) => (
                  <tr key={i}>
                    <td className={ui.td}>{fmt.date(m.takenAt)}</td>
                    <td className={`${ui.td} text-right`}>{fmt.number(m.weightKg)}</td>
                    <td className={`${ui.td} text-right`}>{fmt.number(m.waistCm)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>

        <Card icon={FileText} title="Mis documentos">
          {(s?.documents ?? []).length === 0 ? (
            <p className="text-sm text-muted">Tu nutriologo aun no ha compartido documentos contigo.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {s.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    {d.title}
                    <span className="block text-xs text-muted">Compartido {fmt.date(d.sharedAt)}</span>
                  </span>
                  <button type="button" className={ui.btnSecondary} onClick={() => download(d)}>
                    <Download className="size-4" aria-hidden="true" /> Descargar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card icon={UserRound} title="Mi perfil">
          {me.data && <ProfileForm me={me.data} onSaved={() => setTick((x) => x + 1)} />}
        </Card>
      </div>
    </section>
  );
}
