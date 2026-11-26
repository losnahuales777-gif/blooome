import { KeyRound, Search, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../business/auth/useAuth.js';
import { useResource } from '../business/hooks/useResource.js';
import Alert from '../components/ui/Alert.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Pagination from '../components/ui/Pagination.jsx';
import RoleBadge from '../components/ui/RoleBadge.jsx';
import { ui } from '../components/ui/styles.js';
import { assignableRoles, PERMISSIONS as P } from '../models/access.model.js';
import { EMPTY_USER, formatDate, validateNewUser } from '../models/user.model.js';
import { accessService } from '../services/access.service.js';
import { usersService } from '../services/users.service.js';
import { OneTimeCodeDrawer } from './PatientDirectoryPage.jsx';

const PAGE_SIZE = 20;

function CreateUserForm({ roles, onCreated, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY_USER, role: roles.at(-1)?.code ?? 'user' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    const validation = validateNewUser(form);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    setServerError('');
    try {
      await usersService.create({ ...form, email: form.email.trim().toLowerCase(), fullName: form.fullName.trim() });
      onCreated();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const field = (name, label, props = {}) => (
    <div>
      <label htmlFor={`new-${name}`} className={ui.label}>
        {label}
      </label>
      <input id={`new-${name}`} className={ui.input} value={form[name]} onChange={set(name)} {...props} />
      {errors[name] && <p className={ui.fieldError}>{errors[name]}</p>}
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className={`${ui.card} mb-6 space-y-4 p-5`} noValidate>
      <h3 className="font-medium text-ink">Nuevo usuario</h3>
      <Alert>{serverError}</Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        {field('fullName', 'Nombre completo', { maxLength: 120 })}
        {field('email', 'Correo', { type: 'email', maxLength: 254, autoComplete: 'off' })}
        {field('password', 'Contrasena inicial', { type: 'password', maxLength: 128, autoComplete: 'new-password' })}
        <div>
          <label htmlFor="new-role" className={ui.label}>
            Rol
          </label>
          <select id="new-role" className={ui.input} value={form.role} onChange={set('role')}>
            {roles.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" className={ui.btnPrimary} disabled={saving}>
          {saving ? 'Guardando...' : 'Crear usuario'}
        </button>
        <button type="button" className={ui.btnSecondary} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default function AccountsPage() {
  const { user: me, hasPermission } = useAuth();
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [actionError, setActionError] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [codeResult, setCodeResult] = useState(null);
  const { data, error, loading, reload } = useResource(
    () => usersService.list({ page, pageSize: PAGE_SIZE, ...(search ? { q: search } : {}) }),
    [page, search],
  );
  // Roles desde el catalogo del servidor (incluye roles personalizados activos).
  const catalog = useResource(() => accessService.catalog(), []);

  const roles = assignableRoles(me.role, catalog.data?.roles ?? null);
  const canReset = hasPermission(P.USERS_RESET_PASSWORD);
  const canDelete = hasPermission(P.USERS_DELETE);
  const canCreate = hasPermission(P.USERS_CREATE) && roles.length > 0;
  const canUpdate = hasPermission(P.USERS_UPDATE);
  const canAssignRole = hasPermission(P.ROLES_ASSIGN);

  async function run(action) {
    setActionError('');
    try {
      await action();
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function resetPassword(u) {
    if (!window.confirm(`Generar un codigo de restablecimiento para ${u.fullName}? Su contrasena actual dejara de funcionar.`)) return;
    setActionError('');
    try {
      setCodeResult(await usersService.resetPassword(u.id));
      reload();
    } catch (err) {
      setActionError(err.message);
    }
  }

  function removeUser(u) {
    if (!window.confirm(`Eliminar la cuenta de ${u.fullName}? Se cierran sus sesiones y deja de aparecer en la lista; la auditoria se conserva.`)) return;
    run(() => usersService.remove(u.id));
  }

  return (
    <section>
      <PageHeader
        title="Cuentas del sistema"
        description="Accesos de nutriologos y personal a la plataforma."
        actions={
          canCreate &&
          !showForm && (
            <button type="button" className={ui.btnPrimary} onClick={() => setShowForm(true)}>
              <UserPlus className="size-4" aria-hidden="true" /> Nuevo usuario
            </button>
          )
        }
      />

      {showForm && (
        <CreateUserForm
          roles={roles}
          onCancel={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            page === 1 ? reload() : setPage(1);
          }}
        />
      )}

      <form
        className="mb-4 flex max-w-md gap-2"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSearch(q.trim());
        }}
      >
        <input className={ui.input} placeholder="Buscar por nombre o correo" maxLength={80} value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cuentas" />
        <button type="submit" className={ui.btnSecondary}>
          <Search className="size-4" aria-hidden="true" /> Buscar
        </button>
      </form>

      <div className="mb-4 space-y-2">
        <Alert>{error}</Alert>
        <Alert>{actionError}</Alert>
      </div>

      <div className={`${ui.card} overflow-x-auto`}>
        <table className="min-w-full divide-y divide-line">
          <thead className="bg-tint">
            <tr>
              <th className={ui.th}>Usuario</th>
              <th className={ui.th}>Rol</th>
              <th className={ui.th}>Estado</th>
              <th className={ui.th}>Ultimo acceso</th>
              {(canUpdate || canReset || canDelete) && <th className={ui.th}>Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data?.items.map((u) => {
              const isMe = u.id === me.id;
              return (
                <tr key={u.id}>
                  <td className={ui.td}>
                    <p className="font-medium text-ink">
                      {u.fullName} {isMe && <span className="text-xs text-muted">(tu)</span>}
                    </p>
                    <p className="text-xs text-muted">{u.email}</p>
                  </td>
                  <td className={ui.td}>
                    {canAssignRole && !isMe ? (
                      <select
                        aria-label={`Rol de ${u.fullName}`}
                        className={`${ui.input} w-auto py-1`}
                        value={u.role}
                        onChange={(e) => run(() => usersService.changeRole(u.id, e.target.value))}
                      >
                        {roles.map((r) => (
                          <option key={r.code} value={r.code}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <RoleBadge role={u.role} name={u.roleName} />
                    )}
                  </td>
                  <td className={ui.td}>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        u.isActive ? 'bg-accent/15 text-accent' : 'bg-danger/15 text-danger'
                      }`}
                    >
                      {u.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className={`${ui.td} whitespace-nowrap`}>{formatDate(u.lastLoginAt)}</td>
                  {(canUpdate || canReset || canDelete) && (
                    <td className={ui.td}>
                      {!isMe && (
                        <div className="flex flex-wrap gap-2">
                          {canUpdate && (
                            <button type="button" className={ui.btnSecondary} onClick={() => run(() => usersService.setStatus(u.id, !u.isActive))}>
                              {u.isActive ? 'Desactivar' : 'Activar'}
                            </button>
                          )}
                          {canReset && (
                            <button type="button" className={ui.btnSecondary} onClick={() => resetPassword(u)} title="Generar codigo de restablecimiento">
                              <KeyRound className="size-4" aria-hidden="true" /> Restablecer
                            </button>
                          )}
                          {canDelete && (
                            <button type="button" className={ui.btnSecondary} onClick={() => removeUser(u)} aria-label={`Eliminar a ${u.fullName}`}>
                              <Trash2 className="size-4 text-danger" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {!loading && data?.items.length === 0 && (
              <tr>
                <td colSpan={5} className={`${ui.td} py-10 text-center text-muted`}>
                  No hay usuarios para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {data && <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />}
      </div>
      {codeResult && <OneTimeCodeDrawer title="Codigo de restablecimiento" result={codeResult} onClose={() => setCodeResult(null)} />}
    </section>
  );
}
