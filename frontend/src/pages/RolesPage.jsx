import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useResource } from '../business/hooks/useResource.js';
import { FormDrawer } from '../components/analysis/AnalysisForms.jsx';
import Alert from '../components/ui/Alert.jsx';
import { StatusBadge } from '../components/ui/DataTable.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import RoleBadge from '../components/ui/RoleBadge.jsx';
import { ui } from '../components/ui/styles.js';
import { accessService } from '../services/access.service.js';

const MODULE_LABELS = {
  panel: 'Panel',
  reportes: 'Reportes',
  registros: 'Registros',
  usuarios: 'Usuarios',
  pacientes: 'Pacientes (basico)',
  clinico: 'Clinico',
  portal: 'Portal',
  auditoria: 'Auditoria',
  sistema: 'Sistema',
  seguridad: 'Seguridad (solo superusuario)',
};

// Permisos agrupados por modulo; los de gobierno solo los tiene el superusuario.
function PermissionPicker({ permissions, selected, onToggle, clinicalAllowed }) {
  const groups = permissions.reduce((acc, p) => ((acc[p.module] ??= []).push(p), acc), {});
  return (
    <div className="space-y-3">
      {Object.entries(groups).map(([mod, list]) => (
        <fieldset key={mod} className="rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">{MODULE_LABELS[mod] ?? mod}</legend>
          {list.map((p) => {
            // Permisos de gobierno: no se agregan a ningun rol; solo se muestran si el rol ya los tenia.
            // Lo clinico solo se agrega a roles clinicos (o a uno nuevo, que pasa a ser clinico).
            const locked = !p.isDelegable || (p.clinical && !clinicalAllowed && !selected.has(p.code));
            return (
              <label key={p.code} className={`flex items-start gap-2 py-1 text-sm ${locked ? 'opacity-50' : ''}`}>
                <input type="checkbox" className="mt-1" disabled={locked} checked={selected.has(p.code)} onChange={() => onToggle(p.code)} />
                <span>
                  {p.description}
                  <span className="block font-mono text-xs text-muted">
                    {p.code}
                    {p.clinical && ' · clinico'}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

function RoleForm({ role, permissions, onClose, onSaved }) {
  const [form, setForm] = useState({ code: '', name: role?.name ?? '', description: role?.description ?? '', level: 50 });
  const [selected, setSelected] = useState(new Set(role?.permissions ?? []));
  const toggle = (c) => setSelected((s) => (s.has(c) ? new Set([...s].filter((x) => x !== c)) : new Set([...s, c])));
  return (
    <FormDrawer
      title={role ? `Editar rol: ${role.name}` : 'Nuevo rol'}
      submitLabel="Guardar rol"
      onClose={onClose}
      onSubmit={async () => {
        if (role) await accessService.updateRole(role.id, { name: form.name.trim(), description: form.description.trim(), permissions: [...selected] });
        else await accessService.createRole({ code: form.code.trim(), name: form.name.trim(), description: form.description.trim(), level: Number(form.level), permissions: [...selected] });
        onSaved();
      }}
    >
      {!role && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className={ui.label}>Codigo (minusculas y _)</span>
            <input className={ui.input} maxLength={40} value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          </label>
          <label className="block text-sm">
            <span className={ui.label}>Nivel (1 a 99; menor gestiona menos)</span>
            <input type="number" min={1} max={99} className={ui.input} value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))} />
          </label>
        </div>
      )}
      <label className="block text-sm">
        <span className={ui.label}>Nombre</span>
        <input className={ui.input} maxLength={80} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </label>
      <label className="block text-sm">
        <span className={ui.label}>Descripcion</span>
        <input className={ui.input} maxLength={300} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </label>
      {role && !['clinico'].includes(role.family) && (
        <p className="text-xs text-muted">Este rol no es clinico: el acceso a expedientes solo se otorga de forma temporal desde Permisos y accesos.</p>
      )}
      <PermissionPicker permissions={permissions} selected={selected} onToggle={toggle} clinicalAllowed={!role || role.family === 'clinico'} />
    </FormDrawer>
  );
}

// Gestion de roles (superusuario): permisos por rol, roles nuevos y activacion.
export default function RolesPage() {
  const roles = useResource(() => accessService.roles(), []);
  const catalog = useResource(() => accessService.catalog(), []);
  const [panel, setPanel] = useState(null);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const permissions = catalog.data?.permissions ?? [];

  async function toggleActive(r) {
    try {
      await accessService.updateRole(r.id, { active: !r.active });
      roles.reload();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  return (
    <section className="space-y-4">
      <PageHeader
        title="Roles"
        description="Cada rol es un nivel y una lista de permisos. Agrega roles nuevos sin cambiar la aplicacion."
        actions={
          <button type="button" className={ui.btnPrimary} onClick={() => setPanel({ type: 'new' })}>
            <Plus className="size-4" aria-hidden="true" /> Nuevo rol
          </button>
        }
      />
      <Alert>{roles.error || catalog.error}</Alert>
      <Alert variant={msg.type || 'info'}>{msg.text}</Alert>
      <ul className="grid gap-4 lg:grid-cols-2">
        {(roles.data?.items ?? []).map((r) => (
          <li key={r.id} className={`${ui.card} space-y-2 p-5`}>
            <div className="flex flex-wrap items-center gap-2">
              <RoleBadge role={r.code} name={r.name} />
              <span className="text-xs text-muted">nivel {r.level}</span>
              <StatusBadge tone={r.active ? 'success' : 'neutral'}>{r.active ? 'Activo' : 'Inactivo'}</StatusBadge>
              {!r.system && <StatusBadge tone="info">Personalizado</StatusBadge>}
            </div>
            <p className="text-sm text-muted">{r.description}</p>
            <p className="text-xs text-muted">
              {r.permissions.length} permisos · {r.activeUsers} de {r.users} usuarios activos
            </p>
            {r.code !== 'superuser' && r.code !== 'paciente' && (
              <div className="flex gap-2">
                <button type="button" className={ui.btnSecondary} disabled={!permissions.length} onClick={() => setPanel({ type: 'edit', role: r })}>
                  Editar permisos
                </button>
                <button type="button" className={ui.btnSecondary} onClick={() => toggleActive(r)}>
                  {r.active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {panel && (
        <RoleForm
          role={panel.role}
          permissions={permissions}
          onClose={() => setPanel(null)}
          onSaved={() => {
            setPanel(null);
            setMsg({ type: 'success', text: 'Rol guardado; el cambio quedo en la auditoria.' });
            roles.reload();
          }}
        />
      )}
    </section>
  );
}
