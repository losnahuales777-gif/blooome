// RBAC: superusuario, administrador nivel 1 (administrativo y sistemas), administrador nivel 2,
// nutriologo y paciente. Verifica acceso por rol, aislamiento del paciente, intentos de escalar
// privilegios y registro de acciones criticas.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestApi } from './helpers.js';

const ROLE = { nutri: 1, l2: 2, super: 3, administrativo: 4, sistemas: 5 };
const NEW_PASS = 'Paciente#Seguro2026';
let t;
const s = {};
const ids = {};
let pid;
let otherPid;
const year = new Date().getFullYear();

before(async () => {
  t = await startTestApi();
  for (const [k, roleId] of Object.entries(ROLE)) ids[k] = await t.createUser(`${k}@prueba.test`, `Usuario ${k}`, roleId);
  ids.nutri2 = await t.createUser('nutri2@prueba.test', 'Usuario nutri2', ROLE.nutri);
  for (const k of [...Object.keys(ROLE), 'nutri2']) s[k] = await t.session(`${k}@prueba.test`);
  const mk = (sess, name) =>
    sess.call('POST', '/patients', { fullName: name, birthDate: `${year - 30}-01-01`, sex: 'F', weightKg: 60, heightCm: 160, activity: 'ligera', goal: 'mantener' });
  pid = (await mk(s.nutri, 'Paciente Portal Prueba')).body.patient.id;
  otherPid = (await mk(s.nutri2, 'Otro Paciente Prueba')).body.patient.id;
});

after(async () => t?.stop());

const status = async (sess, method, path, body) => (await sess.call(method, path, body)).status;
const events = async (event) => t.db.collection('auditLog').countDocuments({ event });

describe('superusuario', () => {
  it('accede a todos los modulos', async () => {
    for (const path of ['/users', '/access/roles', '/access/audit', '/system/health', '/system/settings', '/system/errors', '/system/backups', '/system/activity', '/stats/overview', '/patients/directory']) {
      assert.equal(await status(s.super, 'GET', path), 200, path);
    }
  });

  it('activa y desactiva modulos; el servidor bloquea el modulo apagado', async () => {
    assert.equal(await status(s.super, 'PUT', '/system/settings/modules', { catalogos: false }), 200);
    assert.equal(await status(s.nutri, 'GET', '/catalogs'), 403);
    assert.equal(await status(s.super, 'PUT', '/system/settings/modules', { catalogos: true }), 200);
    const { SettingsBusiness } = await import('../../src/business/settings.business.js');
    SettingsBusiness.invalidate();
    assert.equal(await status(s.nutri, 'GET', '/catalogs'), 200);
    assert.ok((await events('SETTINGS_MODULES_UPDATED')) >= 2);
  });

  it('gestiona roles: crea uno nuevo sin permisos de gobierno y no puede editar el de superusuario', async () => {
    const bad = await s.super.call('POST', '/access/roles', { code: 'auditor_externo', name: 'Auditor externo', level: 50, permissions: ['audit.view', 'permissions.manage'] });
    assert.equal(bad.status, 400);
    const ok = await s.super.call('POST', '/access/roles', { code: 'auditor_externo', name: 'Auditor externo', level: 50, permissions: ['audit.view'] });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.equal(await status(s.super, 'PATCH', '/access/roles/3', { permissions: [] }), 400);
    // Editar un rol existente tampoco puede agregarle permisos de gobierno (escalamiento via rol).
    assert.equal(await status(s.super, 'PATCH', '/access/roles/2', { permissions: ['users.view', 'roles.manage'] }), 400);
    assert.equal(await status(s.super, 'PATCH', `/access/roles/${ok.body.id}`, { permissions: ['audit.view', 'security.settings'] }), 400);
    // Lo clinico no entra de forma permanente a roles administrativos, y el rol paciente es fijo.
    assert.equal(await status(s.super, 'PATCH', '/access/roles/4', { permissions: ['dashboard.view', 'reports.view', 'activity.view', 'users.view', 'patients.view'] }), 400);
    assert.equal(await status(s.super, 'PATCH', `/access/roles/${ok.body.id}`, { permissions: ['audit.view', 'patients.manage'] }), 400);
    assert.equal(await status(s.super, 'PATCH', '/access/roles/6', { permissions: ['portal.self', 'patients.view'] }), 400);
    assert.ok((await events('ROLE_CREATED')) >= 1);
  });

  it('no puede eliminarse ni dejar la plataforma sin superusuario', async () => {
    assert.equal(await status(s.super, 'DELETE', `/users/${ids.super}`), 400);
  });
});

describe('administrador nivel 1 - administrativo', () => {
  it('consulta reportes agregados sin identificar pacientes y la actividad operativa', async () => {
    const r = await s.administrativo.call('GET', '/stats/overview');
    assert.equal(r.status, 200);
    assert.equal(r.body.anonymized, true);
    assert.deepEqual(r.body.alerts.withoutFollowUp, []);
    assert.equal(await status(s.administrativo, 'GET', '/system/activity'), 200);
    assert.equal(await status(s.administrativo, 'GET', '/users'), 200);
  });

  it('no accede a lo clinico, a sistemas, a seguridad ni crea usuarios', async () => {
    for (const [m, p, b] of [
      ['GET', '/patients'],
      ['GET', `/patients/${pid}/chart`],
      ['GET', '/patients/directory'],
      ['GET', '/system/health'],
      ['GET', '/system/settings'],
      ['PUT', '/system/settings/security', { sessionIdleMinutes: 60 }],
      ['GET', '/access/audit'],
      ['POST', '/users', { email: 'x@prueba.test', fullName: 'X Prueba', password: 'Clave#Segura2026', role: 'user' }],
      ['PATCH', `/users/${ids.l2}/role`, { role: 'user' }],
    ]) {
      assert.equal(await status(s.administrativo, m, p, b), 403, `${m} ${p}`);
    }
  });
});

describe('administrador nivel 1 - sistemas', () => {
  it('gestiona lo tecnico: salud, errores, respaldos y parametros tecnicos', async () => {
    const h = await s.sistemas.call('GET', '/system/health');
    assert.equal(h.status, 200);
    assert.ok(h.body.dbPingMs >= 0 && h.body.collections);
    assert.equal(await status(s.sistemas, 'PUT', '/system/settings/technical', { maintenanceMessage: 'Mantenimiento de prueba' }), 200);
    const settings = await s.sistemas.call('GET', '/system/settings');
    assert.equal(settings.body.security, undefined, 'no ve la configuracion de seguridad');
  });

  it('no modifica seguridad, modulos, usuarios, sus propios privilegios ni ve expedientes', async () => {
    for (const [m, p, b] of [
      ['PUT', '/system/settings/security', { sessionIdleMinutes: 60 }],
      ['PUT', '/system/settings/modules', { alertas: false }],
      ['GET', '/users'],
      ['PUT', `/users/${ids.sistemas}/permissions`, { permissions: ['patients.view'] }],
      ['GET', `/patients/${pid}/chart`],
      ['GET', '/patients'],
    ]) {
      assert.equal(await status(s.sistemas, m, p, b), 403, `${m} ${p}`);
    }
  });

  it('solo ve un expediente con autorizacion temporal y justificada del superusuario', async () => {
    assert.equal(await status(s.super, 'PUT', `/users/${ids.sistemas}/permissions`, { permissions: ['patients.view'] }), 400, 'permanente: rechazado');
    const just = 'Revision de incidencia tecnica reportada en el expediente';
    assert.equal(await status(s.super, 'POST', `/users/${ids.sistemas}/permissions/temporary`, { permission: 'patients.view', justification: 'corto', hours: 1 }), 400);
    for (const permission of ['patients.view', 'patients.view_all']) {
      assert.equal(await status(s.super, 'POST', `/users/${ids.sistemas}/permissions/temporary`, { permission, justification: just, hours: 1 }), 200);
    }
    assert.equal(await status(s.sistemas, 'GET', `/patients/${pid}/chart`), 200);
    assert.ok((await events('PERMISSION_TEMP_GRANTED')) >= 2);
    // Al vencer, el acceso desaparece sin intervencion.
    await t.db.collection('userPermissions').updateMany({ userId: ids.sistemas }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal(await status(s.sistemas, 'GET', `/patients/${pid}/chart`), 403);
  });
});

describe('administrador nivel 2 - usuarios', () => {
  it('administra cuentas sin crear administradores ni superusuarios', async () => {
    const mk = (role, n) => s.l2.call('POST', '/users', { email: `${n}@prueba.test`, fullName: `Cuenta ${n}`, password: 'Clave#Segura2026', role });
    assert.equal((await mk('user', 'nuevo.nutri')).status, 201);
    assert.equal((await mk('admin_administrativo', 'nuevo.adm')).status, 403);
    assert.equal((await mk('superuser', 'nuevo.su')).status, 403);
    assert.equal((await mk('paciente', 'nuevo.pac')).status, 400, 'pacientes solo por invitacion');
    const found = await s.l2.call('GET', '/users?q=nuevo.nutri');
    assert.equal(found.body.items.length, 1);
  });

  it('no cambia roles (ni el suyo), permisos ni configuraciones', async () => {
    assert.equal(await status(s.l2, 'PATCH', `/users/${ids.l2}/role`, { role: 'superuser' }), 403);
    assert.equal(await status(s.l2, 'PATCH', `/users/${ids.nutri}/role`, { role: 'admin' }), 403);
    assert.equal(await status(s.l2, 'PUT', `/users/${ids.nutri}/permissions`, { permissions: [] }), 403);
    assert.equal(await status(s.l2, 'GET', '/system/settings'), 403);
  });

  it('registra pacientes con datos basicos y no ve su historial clinico', async () => {
    const r = await s.l2.call('POST', '/patients/basic', { fullName: 'Paciente Basico Prueba', birthDate: `${year - 40}-02-02`, sex: 'M', phone: '', nutritionistId: ids.nutri });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const dir = await s.l2.call('GET', '/patients/directory?q=Basico');
    assert.equal(dir.body.items[0].intakePending, true);
    assert.ok(!('weightKg' in dir.body.items[0]));
    assert.equal(await status(s.l2, 'GET', `/patients/${r.body.id}/chart`), 403);
    assert.equal(await status(s.l2, 'GET', `/patients/${r.body.id}/analysis`), 403);
  });

  it('restablece contrasenas con un codigo de un solo uso', async () => {
    const r = await s.l2.call('POST', `/users/${ids.nutri2}/reset-password`);
    assert.equal(r.status, 200);
    assert.match(r.body.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.equal(await status(s.nutri2, 'GET', '/auth/me'), 401, 'se cierran sus sesiones');
    const anon = await t.session('nadie@prueba.test');
    assert.equal(await status(anon, 'POST', '/auth/redeem', { email: 'nutri2@prueba.test', code: 'AAAA-BBBB-CCCC', password: NEW_PASS }), 400);
    assert.equal(await status(anon, 'POST', '/auth/redeem', { email: 'nutri2@prueba.test', code: r.body.code, password: NEW_PASS }), 200);
    assert.equal(await status(anon, 'POST', '/auth/redeem', { email: 'nutri2@prueba.test', code: r.body.code, password: NEW_PASS }), 400, 'un solo uso');
    assert.equal((await t.session('nutri2@prueba.test', NEW_PASS)).login.status, 200);
    assert.equal((await t.session('nutri2@prueba.test')).login.status, 401, 'la contrasena anterior ya no sirve');
    s.nutri2 = await t.session('nutri2@prueba.test', NEW_PASS);
  });
});

describe('paciente', () => {
  let patient;
  let docId;

  it('se activa con la invitacion vinculada a su expediente', async () => {
    const inv = await s.l2.call('POST', `/patients/${pid}/portal-invite`, { email: 'paciente.portal@prueba.test' });
    assert.equal(inv.status, 201, JSON.stringify(inv.body));
    assert.equal(await status(s.nutri, 'POST', `/patients/${otherPid}/portal-invite`, { email: 'otro@prueba.test' }), 404, 'el nutriologo solo invita a sus pacientes');
    const anon = await t.session('nadie@prueba.test');
    assert.equal(await status(anon, 'POST', '/auth/redeem', { email: 'paciente.portal@prueba.test', code: inv.body.code, password: NEW_PASS }), 200);
    patient = await t.session('paciente.portal@prueba.test', NEW_PASS);
    assert.equal(patient.login.status, 200);
    assert.ok((await events('PATIENT_INVITED')) >= 1 && (await events('ACCOUNT_ACTIVATED')) >= 1);
  });

  it('consulta solo su propia informacion y lo que su nutriologo compartio', async () => {
    const me = await patient.call('GET', '/portal/me');
    assert.equal(me.body.fullName, 'Paciente Portal Prueba');
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8, 1)]);
    docId = (await (await s.nutri.raw('POST', `/patients/${pid}/documents`, png, { 'Content-Type': 'image/png', 'X-Document-Description': 'Indicaciones' })).json()).id;
    assert.equal((await patient.call('GET', '/portal/summary')).body.documents.length, 0, 'no compartido: no visible');
    assert.equal(await status(patient, 'GET', `/portal/documents/${docId}/file`), 404);
    assert.equal(await status(s.nutri, 'PATCH', `/patients/${pid}/documents/${docId}/share`, { shared: true }), 200);
    assert.equal((await patient.call('GET', '/portal/summary')).body.documents.length, 1);
    assert.equal((await patient.raw('GET', `/portal/documents/${docId}/file`)).status, 200);
    const notes = await patient.call('GET', '/portal/notifications');
    assert.ok(notes.body.items.some((n) => n.type === 'documento'));
  });

  it('no accede a otros pacientes, a modulos administrativos ni a registros clinicos', async () => {
    for (const [m, p, b] of [
      ['GET', `/patients/${pid}/chart`],
      ['GET', `/patients/${otherPid}`],
      ['GET', '/patients'],
      ['GET', '/users'],
      ['GET', '/stats/overview'],
      ['GET', '/system/settings'],
      ['POST', `/patients/${pid}/diagnoses`, { evaluationId: 'a'.repeat(24), problem: 'x', etiology: 'x', signs: 'x' }],
      ['PATCH', `/users/${ids.super}/role`, { role: 'user' }],
    ]) {
      assert.equal(await status(patient, m, p, b), 403, `${m} ${p}`);
    }
  });

  it('no puede escalar privilegios ni apuntar a otro expediente modificando la solicitud', async () => {
    assert.equal(await status(patient, 'PUT', '/portal/me', { phone: '', email: '', address: '', emergencyContact: { name: '', relationship: '', phone: '' }, role: 'superuser' }), 400);
    assert.equal(await status(patient, 'PUT', '/portal/me', { phone: '', email: '', address: '', emergencyContact: { name: '', relationship: '', phone: '' }, patientId: otherPid }), 400);
    const ok = await patient.call('PUT', '/portal/me', { phone: '55 1234 0000', email: 'contacto@prueba.test', address: 'Calle de prueba', emergencyContact: { name: '', relationship: '', phone: '' } });
    assert.equal(ok.status, 200);
    const other = await t.db.collection('patients').findOne({ _id: otherPid });
    assert.notEqual(other.identification?.address, 'Calle de prueba');
  });

  it('el portal se bloquea si el superusuario desactiva el modulo', async () => {
    await s.super.call('PUT', '/system/settings/modules', { portal_pacientes: false });
    assert.equal(await status(patient, 'GET', '/portal/me'), 403);
    await s.super.call('PUT', '/system/settings/modules', { portal_pacientes: true });
  });
});

describe('proteccion general y auditoria', () => {
  it('las rutas protegidas rechazan solicitudes sin sesion', async () => {
    const anon = await t.session('nadie@prueba.test');
    for (const p of ['/users', '/patients', '/portal/me', '/system/health', '/access/roles']) assert.equal(await status(anon, 'GET', p), 401, p);
  });

  it('la baja logica bloquea el acceso y queda en la auditoria', async () => {
    const victim = await t.createUser('baja@prueba.test', 'Usuario baja', ROLE.nutri);
    const sess = await t.session('baja@prueba.test');
    assert.equal(await status(s.l2, 'DELETE', `/users/${victim}`), 403, 'solo el superusuario elimina');
    assert.equal(await status(s.super, 'DELETE', `/users/${victim}`), 200);
    assert.equal(await status(sess, 'GET', '/auth/me'), 401);
    assert.equal((await t.session('baja@prueba.test')).login.status, 401);
    for (const e of ['USER_DELETED', 'PASSWORD_RESET_ISSUED', 'ROLE_CREATED', 'PERMISSION_TEMP_GRANTED', 'SETTINGS_TECHNICAL_UPDATED']) {
      assert.ok((await events(e)) >= 1, `auditoria: ${e}`);
    }
  });
});
