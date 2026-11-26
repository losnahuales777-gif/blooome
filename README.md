# Bloome

> Nutre tu cuerpo, florece tu vida

Aplicativo web con **backend** en Node.js (Express 5 + MongoDB Atlas) y **frontend** en React 19 + Tailwind CSS 4 (Vite).

## Arquitectura MBS (Model - Business - Service)

Ambos proyectos se dividen en tres capas con responsabilidades separadas:

| Capa | Backend (`backend/src`) | Frontend (`frontend/src`) |
|------|-------------------------|---------------------------|
| **Model** | `models/` - acceso a datos con consultas parametrizadas | `models/` - forma de los datos y validaciones del formulario |
| **Business** | `business/` - reglas de negocio (login, bloqueo, auditoria) | `business/` - estado de sesion (`AuthProvider`, `useAuth`) |
| **Service** | `services/` - rutas, controladores y validadores HTTP | `services/` - cliente HTTP hacia la API |

Flujo: `Service -> Business -> Model`. Una capa nunca salta a la otra.

## Roles y permisos (RBAC)

Catalogo unico en `backend/src/config/rbac.catalog.js` (version `RBAC_VERSION`). Al arrancar, el bootstrap
actualiza roles y permisos en la base **sin quitar** permisos ya asignados. Cada rol tiene un nivel: solo se
gestionan cuentas de nivel inferior.

| Nivel | Rol (codigo) | Alcance | Permisos del rol |
|-------|--------------|---------|------------------|
| 100 | **Superusuario** (`superuser`) | Toda la plataforma: roles, permisos, seguridad, modulos, auditoria, bajas. | Todos |
| 80 | **Admin. nivel 1 - Administrativo** (`admin_administrativo`) | Reportes agregados y anonimizados, actividad de usuarios, consulta de cuentas. Sin datos clinicos. | `dashboard.view`, `reports.view`, `activity.view`, `users.view` |
| 80 | **Admin. nivel 1 - Sistemas** (`admin_sistemas`) | Salud del sistema, errores tecnicos, respaldos y parametros tecnicos. Sin datos clinicos. | `dashboard.view`, `system.health`, `system.settings`, `system.backups` |
| 60 | **Admin. nivel 2 - Usuarios** (`admin`) | Cuentas de nivel inferior, restablecer contrasenas, datos basicos de pacientes e invitaciones. Sin historial clinico ni cambios de privilegios. | `dashboard.view`, `users.view/create/update`, `users.reset_password`, `patients.basic`, `patients.invite` |
| 40 | **Nutriologo** (`user`) | Atencion clinica de sus pacientes (rol clinico). | `dashboard.view`, `records.*`, `patients.view/manage`, `meal_plans.manage`, `patients.invite` |
| 10 | **Paciente** (`paciente`) | Solo su portal: perfil, citas, plan, mediciones, objetivos, documentos compartidos y notificaciones. | `portal.self` (fijo) |

El superusuario puede crear roles nuevos desde **Roles** (`/roles`); un rol con permisos clinicos pasa a la
familia clinica, el resto es administrativo.

Reglas adicionales de esta version (validadas en el servidor, `backend/test/integration/rbac.test.js`):

- **Permisos de gobierno** (`roles.manage`, `roles.assign`, `permissions.manage`, `security.settings`, `modules.manage`, `users.delete`, `systems.transfer`, `portal.self`) no se agregan a ningun rol ni usuario: son del superusuario.
- **Datos clinicos:** un rol o usuario no clinico nunca recibe permisos clinicos permanentes. Solo un **acceso temporal** (1 a 72 h, con justificacion de 20+ caracteres) desde *Permisos y accesos*; vence solo y queda en la auditoria.
- **Pacientes aislados:** la cuenta de paciente se crea con una **invitacion vinculada** al expediente (codigo de un solo uso, 72 h). Todo `/api/portal/*` toma el expediente de la sesion, nunca de la solicitud. El rol paciente no se edita ni se asigna desde *Cuentas*.
- **Restablecer contrasena:** genera un codigo de un solo uso (30 min, 5 intentos) e invalida la contrasena anterior. El usuario lo canjea en `/activar` (enlace "Registrate" del login).
- **Baja logica** (`DELETE /api/users/:id`, solo superusuario): cierra sesiones, libera el correo y conserva la auditoria.
- **Modulos** (portal de pacientes, asistente IA, alertas, catalogos, reportes PDF): si el superusuario apaga uno, el servidor lo bloquea para todos.
- **Seguridad configurable:** minutos de inactividad, intentos de inicio de sesion y minutos de bloqueo (superusuario).
- **Reportes anonimizados:** quien ve reportes sin `patients.view` recibe solo agregados, sin nombres ni listas de pacientes.
- Paneles iniciales distintos por rol: el clinico ve su consulta; los administradores, accesos directos segun sus permisos; el paciente entra directo a su portal.

Permisos efectivos = permisos del rol + permisos directos otorgados por el super usuario.

Reglas que aplica la capa Business (`backend/src/business/access.business.js`):

- **Jerarquia:** cada actor solo ve y gestiona usuarios de nivel inferior; el super usuario gestiona a todos. Un usuario fuera de su alcance responde 404, asi no se revela que existe.
- **Sin escalamiento:** nadie asigna un rol igual o superior al suyo (salvo el super usuario). Los permisos `roles.assign`, `permissions.manage` y `systems.transfer` **no son delegables** (segregacion de funciones, ISO 27001 A.5.3).
- **Sin autobloqueo:** nadie cambia su propio rol, estado ni permisos, y siempre debe quedar al menos un super usuario activo.
- **Revocacion inmediata:** el JWT solo guarda el id; rol, permisos y estado activo se leen de la base en cada peticion.
- **Herencia de sistemas** (`POST /api/users/:id/transfer`): en una sola transaccion pasa la propiedad de los registros y los permisos directos del usuario origen al destino, y opcionalmente desactiva al origen (ISO 27001 A.5.11). El rol no se hereda; se cambia por separado.
- Toda accion de gobierno (alta, cambio de rol, permisos, herencia) queda en `audit_log`.

### Endpoints

| Metodo y ruta | Permiso |
|---------------|---------|
| `GET /api/auth/me` | sesion (devuelve `user` y `permissions`) |
| `GET /api/records` / `POST /api/records` | `records.view` / `records.create` (`records.view_all` para ver los de todos) |
| `GET /api/users` / `POST /api/users` | `users.view` / `users.create` |
| `PATCH /api/users/:id`, `PATCH /api/users/:id/status` | `users.update` |
| `PATCH /api/users/:id/role` | `roles.assign` |
| `GET` / `PUT /api/users/:id/permissions` | `permissions.manage` |
| `POST /api/users/:id/transfer` | `systems.transfer` |
| `GET /api/access/catalog` | `users.view` |
| `GET /api/access/audit` | `audit.view` |
| `GET` / `POST /api/access/roles`, `PATCH /api/access/roles/:roleId` | `roles.manage` |
| `POST /api/users/:id/reset-password` | `users.reset_password` |
| `DELETE /api/users/:id` | `users.delete` |
| `POST /api/users/:id/permissions/temporary` | `permissions.manage` |
| `POST /api/auth/redeem` | publico (codigo de un solo uso, limitado) |
| `GET /api/patients/directory`, `POST /api/patients/basic`, `PUT /api/patients/:id/basic` | `patients.basic` |
| `POST /api/patients/:id/portal-invite` | `patients.invite` |
| `PATCH /api/patients/:id/documents/:docId/share` | `patients.manage` |
| `GET/PUT /api/portal/me`, `GET /api/portal/summary`, `/appointments`, `/notifications`, `/documents/:docId/file` | `portal.self` |
| `GET /api/system/health`, `/errors` | `system.health` |
| `GET/POST /api/system/backups` | `system.backups` |
| `PUT /api/system/settings/technical` · `/modules` · `/security` | `system.settings` · `modules.manage` · `security.settings` |
| `GET /api/system/activity` | `activity.view` |

En el frontend el sidebar, las rutas y los botones se filtran por estos mismos permisos (`frontend/src/models/navigation.model.js`). Es solo para la interfaz: la API los vuelve a validar siempre.

```
backend/
  scripts/create-superuser.js  Alta interactiva del primer super usuario
  scripts/db-check.js      Verifica la conexion con Atlas y muestra las colecciones
  src/
    config/        env (validado con zod), cliente MongoDB, bootstrap (indices + catalogo RBAC), logger
    models/        user, role, permission, patient, mealPlan, record, audit
    business/      access (RBAC), auth, users, permissions, records, audit
    services/      auth/, users/, records/, access/ (routes, controller, validator)
    middlewares/   authenticate, csrf, rateLimiter, validate, errorHandler
    utils/         password (scrypt), jwt, AppError
frontend/
  src/
    models/        auth, access (roles/permisos), user, navigation
    business/      auth/ (AuthProvider, useAuth), hooks/useResource
    services/      http, auth, users, records, access
    components/    layout/ (Topbar, Sidebar, MainLayout), routing/
    pages/         Login, Dashboard, Registros, Usuarios, Accesos, Auditoria
```

## Puesta en marcha

Requisitos: Node.js 24 o superior y un cluster de MongoDB Atlas (base `nutria`).

1. Atlas (una sola vez):
   - **Database Access:** crea un usuario de base de datos con el rol *readWrite* solo sobre la base `nutria` (no uses el administrador del proyecto).
   - **Network Access:** agrega la IP desde la que corre la API (evita `0.0.0.0/0` en produccion).
   - **Connect > Drivers > Node.js:** copia la cadena `mongodb+srv://...`.
2. Backend:
   ```bash
   cd backend
   cp .env.example .env      # pega MONGODB_URI y define JWT_SECRET
   npm install
   npm run db:check          # verifica la conexion y crea indices y catalogo
   npm run create-superuser  # crea el primer super usuario
   npm run dev               # http://localhost:3000
   ```
3. Frontend (otra terminal):
   ```bash
   cd frontend
   npm install
   npm run dev               # http://localhost:5173
   ```

En desarrollo Vite redirige `/api` al backend, asi que frontend y API comparten origen.

## Seguridad (OWASP Top 10 / ISO/IEC 27001)

| Control | Implementacion |
|---------|----------------|
| **Inyeccion NoSQL** (OWASP A03) | Validacion con lista blanca (zod `strictObject`): solo llegan tipos primitivos, nunca objetos como `{"$ne": null}`; los filtros usan `$eq` explicito; no se usa `$where` ni JavaScript en el servidor. |
| Almacenamiento de contrasenas | `scrypt` (N=2^17, r=8, p=1) con sal aleatoria; comparacion en tiempo constante. |
| Enumeracion de usuarios | Mensaje unico "Credenciales invalidas" y hash ficticio para igualar tiempos de respuesta. |
| Fuerza bruta | Rate limit en `/auth/login` (10 / 15 min por IP) + bloqueo de cuenta tras 5 fallos (configurable). |
| Sesion | JWT HS256 de 15 min en cookie `HttpOnly`, `SameSite=Strict`, `Secure` en produccion. Nunca en `localStorage`. |
| CSRF | Cookie + cabecera `X-CSRF-Token` (double submit) en toda peticion que modifica estado. |
| Control de acceso (A01) | RBAC por permisos (`requirePermission`) en cada endpoint, jerarquia de roles y filtrado por propietario en registros (evita IDOR). |
| Cabeceras / configuracion (A05) | `helmet` (CSP, HSTS, X-Frame-Options...), `x-powered-by` desactivado, CORS con origen unico, body limitado a 10 kB, errores sin trazas. |
| XSS | React escapa todo el contenido; no se usa `dangerouslySetInnerHTML`. |
| Redireccion abierta | Tras el login solo se aceptan rutas internas. |
| Registro y auditoria (A09 / ISO 27001 A.8.15) | Tabla `audit_log` con eventos de login/logout; logs `pino` con contrasenas, cookies y tokens censurados. |
| Gestion de secretos (ISO 27001 A.8.24) | Variables de entorno validadas al arrancar; `.env` fuera del repositorio; `JWT_SECRET` de minimo 32 caracteres. |
| Minimo privilegio (ISO 27001 A.8.2) | Usuario de Atlas con rol *readWrite* solo sobre la base `nutria`; acceso por lista de IPs; conexion cifrada con TLS (`mongodb+srv`). |
| Dependencias (A06) | `npm run audit:deps` en ambos proyectos. |

### Antes de produccion

- Servir todo bajo HTTPS y poner `NODE_ENV=production`.
- Si la API esta detras de un proxy, ajustar `TRUST_PROXY=1` para que el rate limit vea la IP real.
- Si frontend y API van en dominios distintos, definir `VITE_API_URL` y revisar `CORS_ORIGIN` y la politica de cookies.

## Modulo de nutricion

Sidebar principal: **Dashboard**, **Usuarios** (pacientes) y **Plan alimenticio**. Las cuentas de acceso, permisos y auditoria quedan en la seccion *Administracion*, visible solo para quien tenga esos permisos.

- **Dashboard:** regla de edades 18-60 con cada paciente marcado por su categoria de IMC (color y forma), consultas del dia y pacientes sin seguimiento.
- **Usuarios:** lista con busqueda y filtros, ficha con meta energetica (Mifflin-St Jeor), alta/edicion y registro de consulta (peso, cintura y proxima cita).
- **Plan alimenticio:** cinco tiempos de comida con alimentos y macronutrientes, y balance del dia contra la meta.

### Reglas del backend

- Colecciones `patients` y `mealPlans` (un documento por paciente con todo su plan).
- **Edad 18-60** validada en la capa Business al crear y editar; la proxima cita debe ser futura.
- **Cada nutriologo solo ve y edita sus pacientes**: un paciente ajeno responde 404 (evita IDOR). `patients.view_all` (super usuario) ve todos.
- Guardar un plan reemplaza el anterior en una transaccion.
- La herencia de sistemas tambien transfiere los pacientes al usuario destino.
- La auditoria registra solo identificadores: los datos de salud nunca se escriben en logs (ISO 27001 A.5.34).

| Metodo y ruta | Permiso |
|---------------|---------|
| `GET /api/patients`, `GET /api/patients/:id` | `patients.view` |
| `POST /api/patients`, `PUT /api/patients/:id` | `patients.manage` |
| `POST /api/patients/:id/visits` | `patients.manage` |
| `GET /api/patients/:id/meal-plan` | `patients.view` |
| `PUT /api/patients/:id/meal-plan` | `meal_plans.manage` |

El rol **Usuario** (nutriologo) recibe `patients.view`, `patients.manage` y `meal_plans.manage`. Al arrancar, la API crea los indices y el catalogo de roles y permisos que falten (`src/config/bootstrap.js`); nunca borra datos.

## Sistema visual

- **Tipografia:** Poppins (400, 500, 600, 700) servida localmente desde `frontend/src/assets/fonts` (licencia OFL incluida). Escala basada en la proporcion aurea (phi = 1.618, pasos de 1/4): texto 1 rem con interlineado phi, subtitulo phi rem (25.9 px), titulo phi^2 rem (41.9 px). Tokens `--text-*` en `frontend/src/index.css`.
- **Regla 60-30-10:** 60 % fondo (`canvas`), 30 % superficies en el tono secundario (`#A7D6C0` en claro, `#145C46` en oscuro: sidebar, topbar, tarjetas, paneles) y 10 % acento solo para acciones y senales (botones primarios, elemento activo, enlaces, cifras clave).
- **Paleta Holst:** `#0B3D2E` `#145C46` `#1E7A5D` `#2E9D74` `#61B795` `#A7D6C0` `#EAF6F0`, sin tonos neon.
- **Tema claro y oscuro:** el login mantiene siempre el diseno de marca en verdes oscuros; dentro de la app, interruptor en el menu de usuario y opcion Claro/Oscuro/Como el sistema en Configuracion. La eleccion se guarda en el navegador; sin eleccion se usa el tema del sistema operativo. Los colores son variables CSS por tema (`frontend/src/index.css`) expuestas como utilidades semanticas: `canvas`, `ink`, `muted`, `accent`, `on-accent`, `highlight`, `line`, `tint`, `overlay`, `danger`, `info`. Contrastes verificados: texto >= 11:1, secundario y botones >= 4.7:1.
- **Glassmorphism** en tres niveles (utilidades de Tailwind), con valores propios de cada tema:
  - `glass`: superficies base (sidebar, topbar, tarjetas, tablas).
  - `glass-strong`: capas flotantes (paneles laterales, login, tooltips).
  - `glass-field`: campos de formulario, mas opacos para leer lo escrito.
  Cada nivel = fondo translucido + `backdrop-filter: blur` + borde de 1 px + brillo interior. El fondo tiene halos verdes fijos para que el desenfoque se perciba. Sin soporte de `backdrop-filter` cae a colores opacos; al imprimir se usa fondo blanco.
- **Graficas:** IMC y macronutrientes usan azul, verde, naranja y rosa validados para daltonismo en ambos temas, siempre acompanados de forma o etiqueta.

## Login y menu de usuario

- **Login** identico al diseno de marca: en escritorio se muestra la imagen de referencia (`frontend/src/assets/brand/login-referencia.png`, 800x533) y encima, en las mismas coordenadas, los campos, la casilla, los enlaces y el boton reales (`frontend/src/components/login/LoginReplica.jsx`). En pantallas menores de 768 px se usa una version adaptable con el mismo estilo. Para mayor nitidez en monitores grandes, reemplaza la imagen por una version de mayor resolucion con la misma proporcion.
  - *Recordarme* guarda solo el correo en el navegador; nunca la contrasena ni el token.
  - *Olvidaste tu contrasena* y *Registrate* explican que las cuentas y los restablecimientos los gestiona un administrador: no hay registro publico ni recuperacion por correo (las cuentas se crean por rol desde **Cuentas**).
- **Menu de usuario** en la esquina superior derecha (topbar): nombre, correo y rol, interruptor de tema oscuro, **Configuracion** y **Salir**. Se maneja con teclado (flechas, Esc).
- **Configuracion** (`/configuracion`): perfil, apariencia y cambio de contrasena.
  - `POST /api/auth/password` verifica la contrasena actual, exige la politica de 12+ caracteres, comparte el limite de intentos del login y queda en auditoria (`PASSWORD_CHANGED` / `PASSWORD_CHANGE_FAILED`).

## Base de datos (MongoDB Atlas)

| Coleccion | Contenido |
|-----------|-----------|
| `users` | Cuentas (correo unico, hash scrypt, rol, bloqueo por intentos) |
| `roles` | Los 3 roles con su nivel y sus permisos |
| `permissions` | Catalogo de permisos (`_id` = codigo) |
| `userPermissions` | Permisos directos otorgados por el super usuario |
| `patients` | Pacientes de 18 a 60 anos y su nutriologo responsable |
| `mealPlans` | Plan alimenticio vigente de cada paciente |
| `records` | Registros capturados |
| `auditLog` | Bitacora de seguridad (solo identificadores, sin datos de salud) |
| `counters` | Secuencias para los IDs numericos de la API |

Las operaciones de varios pasos (guardar un plan, heredar sistemas, cambiar permisos) usan transacciones de MongoDB. La coleccion `citas` que ya existe en el cluster no la usa la aplicacion todavia: las citas viven en el campo `nextVisitAt` de cada paciente.

## Modulo de analisis nutricional

Calculos verificables y dashboards integrados al expediente. No emite diagnosticos ni prescripciones automaticas: cada cifra indica si es **medida**, **calculada**, **estimada** o **prescrita**, y el nutriologo puede sustituir cualquier resultado con un ajuste justificado (el valor calculado se conserva).

### Motor de calculos (`calculations/`)

Paquete independiente, sin dependencias, usado por el backend y por el frontend (alias `@calc`). Cada formula es una funcion pura que devuelve `{ formula, version, kind, value, unit, missing, note }`: con datos faltantes devuelve `value: null` y la lista de lo que falta (no imputa); con datos fuera de rango lanza `CalculationError`.

| Formula | Funcion | Tipo | Referencia |
|---|---|---|---|
| IMC = peso / estatura^2 | `bmi` | calculado | OMS, TRS 894 (2000) |
| TMR Mifflin-St Jeor | `restingEnergyMifflin` | estimado | Mifflin et al., Am J Clin Nutr 1990;51:241-247 |
| Gasto energetico total = TMR x factor de actividad | `totalEnergyExpenditure` | estimado | FAO/OMS/UNU 2004 |
| Objetivo energetico = GET +- ajuste por objetivo | `energyTarget` | prescrito | -500 / 0 / +300 kcal |
| Balance = ingesta - gasto | `energyBalance` | calculado | |
| % cambio de peso | `weightChangePercent` | calculado | Blackburn et al., JPEN 1977 |
| Indice cintura-cadera | `waistHipRatio` | calculado | OMS 2008 |
| Indice cintura-estatura | `waistHeightRatio` | calculado | Ashwell y Hsieh 2005 |
| Masa grasa y masa libre de grasa | `fatMass`, `fatFreeMass` | calculado | peso x %grasa |
| Distribucion de macronutrientes | `macroDistribution` | prescrito | Factores de Atwater 4/4/9 |
| Requerimiento proteico = peso x g/kg | `proteinRequirement` | prescrito | IOM 2005 |
| Hidratacion orientativa (35 ml/kg) | `hydrationEstimate` | estimado | EFSA 2010 |
| Avance al peso objetivo | `weightProgressToGoal` | calculado | |
| Cumplimiento de objetivos | `goalCompliance` | calculado | |
| Adherencia al plan | `planAdherence` | calculado | comidas seguidas / planificadas |
| Consumo calorico promedio | `averageCaloricIntake` | calculado | solo dias registrados |
| Variacion semanal / mensual | `periodVariation` | calculado | semana ISO / mes, sin interpolar |

### Datos (MongoDB)

| Coleccion | Contenido |
|---|---|
| `mediciones` | Historico antropometrico de solo agregar: fecha, valores con unidad en el nombre (`weightKg`, `waistCm`...), metodo, responsable. Una correccion crea una version nueva (`supersedes`) y marca la anterior (`supersededBy`); nada se sobrescribe. |
| `citas` | Consultas `programada` / `realizada` / `cancelada`, sincronizadas con la proxima cita del expediente. |
| `consumos` | Registro diario: energia, macronutrientes, agua, actividad, comidas planificadas y seguidas. |
| `laboratorios` | Estudio, valor, unidad, rango de referencia, fecha. |
| `objetivos` | Objetivos del paciente con historial de estados. |
| `ajustesClinicos` | Sustituciones del profesional: valor calculado, valor ajustado, version de formula, motivo, autor y fecha. |
| `evaluaciones` | Instantanea de resultados con la version de cada formula, generada con cada medicion. |

El expediente (`patients`) suma tres campos opcionales: `targetWeightKg` y `proteinGPerKg` (prescritos) e `isActive`.

### Endpoints

| Metodo y ruta | Permiso |
|---|---|
| `GET /api/patients/:id/analysis?from&to` | `patients.view` |
| `POST /api/patients/:id/measurements` | `patients.manage` |
| `POST /api/patients/:id/measurements/:measurementId/corrections` | `patients.manage` |
| `POST /api/patients/:id/intake` | `patients.manage` |
| `POST /api/patients/:id/labs` | `patients.manage` |
| `POST /api/patients/:id/goals`, `PATCH /api/patients/:id/goals/:goalId` | `patients.manage` |
| `POST /api/patients/:id/overrides` | `patients.manage` |
| `POST /api/patients/:id/appointments/:appointmentId/cancel` | `patients.manage` |
| `GET /api/stats/overview?from&to&tz` | `patients.view` (propios) / `patients.view_all` (todos) |

Las estadisticas se calculan con agregaciones de MongoDB (`$facet`, `$group`, `$lookup`, `$dateToString` con zona horaria). Los puntos agregados no incluyen nombres. Cada registro clinico queda en la auditoria solo con identificadores.

### Dashboards

- **Paciente** (`/usuarios/:id`, desde la ficha con "Ver analisis"): evolucion de peso con objetivo, comparacion inicial/actual/objetivo, IMC, cintura y cadera, masa grasa y muscular, macronutrientes registrados vs prescritos, energia vs objetivo, cumplimiento del plan, hidratacion, actividad, laboratorio, objetivos, evaluacion trazable e historial cronologico. Filtros: semana, mes, 3 meses, 6 meses, ano o fechas personalizadas. Cada registro nuevo recarga las graficas.
- **Consultorio** (al final del Dashboard): pacientes activos/inactivos y por objetivo (donas), nuevos por mes, consultas por mes y estado (barras apiladas), mapa de calor dia x hora, IMC promedio y adherencia por mes (lineas), histograma de IMC, dispersion edad-IMC, alertas de seguimiento y tabla mensual/anual.
- Graficas con Recharts (cargadas bajo demanda), tooltips, leyendas con texto y paletas por tema validadas para daltonismo.

### Pruebas

```bash
cd backend
npm test                   # 28 unitarias: motor de calculos + evaluacion clinica
npm run test:integration   # 14 de integracion contra Atlas, en una base temporal que se borra al final
```

## Expediente clinico integral (etapa 1)

La ficha del paciente (`/pacientes/:id`) es el centro de la aplicacion. Principios: no se borra
informacion clinica, todo cambio deja version y autor, las notas firmadas son inmutables (solo
adendas) y la auditoria guarda identificadores, nunca contenido clinico.

### Navegacion (11 secciones)

Dashboard general, Pacientes, Expedientes clinicos, Consultas, Evaluaciones nutricionales, Planes
alimenticios, Seguimiento y evolucion, Estudios de laboratorio, Agenda, Reportes y Administracion
(Cuentas, Permisos y accesos, Auditoria). Las rutas antiguas `/usuarios` redirigen a `/pacientes`.
Los roles y permisos no cambiaron.

### Ficha del paciente

- Encabezado clinico: nombre, numero de expediente (`BL-000001`), edad, ultima y proxima consulta,
  profesional responsable, estado del expediente y avisos.
- Indicadores con unidad, fecha, metodo y origen del dato (medido, calculado, prescrito, ajustado).
- Pestanas (`?tab=`): Resumen clinico, Historia clinica, Consultas y notas SOAP, Antropometria,
  Laboratorios, Diagnosticos, Plan nutricional, Objetivos, Evolucion y Documentos.
- Linea de tiempo filtrable por tipo de evento, periodo y autor; solo muestra registros reales.

### Componentes clinicos

| Elemento | Comportamiento |
| --- | --- |
| Identificacion | Correo, domicilio, ocupacion, motivo de consulta, contacto de emergencia y estado del expediente. |
| Antecedentes | 16 categorias con campos condicionales (severidad, dosis, frecuencia); cada edicion crea una version. |
| Notas SOAP | Borrador con autoguardado y control de version; firma con confirmacion y huella SHA-256; adendas despues de firmar. |
| Diagnosticos | Formato PES, documentados por el profesional y vinculados a una evaluacion guardada del mismo paciente. |
| Objetivos | Se pueden vincular a un diagnostico activo. |
| Avisos | Reglas administrativas verificables (alergia registrada, cita vencida, borrador sin firmar, datos faltantes). No son diagnosticos ni juicios de gravedad. |

### Endpoints nuevos

- `/api/patients/:id/chart`, `/identification`, `/history`, `/notes`, `/evaluations`, `/diagnoses`, `/timeline`
- `/api/clinical/records`, `/notes`, `/agenda`, `/labs`, `/evaluations` (listas de trabajo)

Cada consulta de la ficha registra `PATIENT_RECORD_VIEWED` en la auditoria.

### Marco normativo (pendiente de revision legal)

El diseno toma como referencia la NOM-004-SSA3-2012 (expediente clinico), la NOM-024-SSA3-2012
(sistemas de informacion de registro electronico para la salud) y la Ley Federal de Proteccion de
Datos Personales en Posesion de los Particulares publicada en el DOF el 20 de marzo de 2025. Esto
**no** es una certificacion de cumplimiento: la vigencia, el alcance y la aplicacion de cada
disposicion deben confirmarse con asesoria legal y con revision de profesionales de la salud.

## Etapa 2: consultas vinculadas, datos sin duplicar y planes versionados

### Fuente unica de cada dato

El expediente (`patients`) ya no guarda peso, estatura, cintura ni fechas de visita. Se derivan al
leer (`backend/src/models/derived.pipeline.js`):

| Dato | Fuente |
| --- | --- |
| Peso, estatura, cintura actuales | Ultima medicion vigente que registro ese dato (`mediciones`) |
| Proxima consulta | Cita `programada` mas proxima (`citas`) |
| Ultima consulta | Cita `realizada` mas reciente (`citas`) |

Editar al paciente ya no acepta medidas (la API responde 400): un cambio de peso es una medicion
nueva o una correccion con motivo. Las mediciones nuevas solo guardan lo que se midio; la estatura
no se copia de mediciones anteriores.

### Consulta vinculada

La cita realizada es la consulta. Registrar la consulta (`POST /api/patients/:id/visits`) devuelve
`consultation { appointmentId, measurementId }` y la medicion queda vinculada a ella. Una nota SOAP
se vincula a la cita indicada o, si no se indica, a la consulta mas cercana dentro de 12 horas. La
nota muestra las mediciones de su consulta y la linea de tiempo resume lo registrado en cada una.

### Planes alimenticios versionados

Cada guardado crea una version en `planesAlimenticios`; la anterior queda `reemplazado` con su
motivo, autor y fecha. `expectedVersion` evita sobrescribir el trabajo de otra persona (409).

- `GET /api/patients/:id/meal-plan` (incluye `version`)
- `PUT /api/patients/:id/meal-plan` con `{ meals, reason, expectedVersion }`
- `GET /api/patients/:id/meal-plan/versions` y `/versions/:version`

### Migracion

```bash
cd backend
npm run migrate:stage2            # simulacion: muestra lo que haria
npm run migrate:stage2 -- --apply # aplica
```

Traslada los valores que ya estaban en el expediente a `mediciones`/`citas` (marcados
`source: "migracion"`) solo cuando no existen ahi, elimina los campos duplicados y copia cada plan de
`mealPlans` como version 1. No inventa datos, es idempotente y conserva `mealPlans` como respaldo.

## Etapa 3: formularios clinicos inteligentes

| Requisito | Implementacion |
| --- | --- |
| Autoguardado seguro | Notas SOAP con autoguardado en el servidor y control de version; aviso del navegador al cerrar con cambios sin guardar (nota y plan). No se guardan datos clinicos en el navegador. |
| Validacion de campos y unidades | Cada campo muestra su unidad y rango; la API valida de nuevo. |
| Comparacion con la consulta anterior | El formulario de medicion muestra el valor anterior de cada campo y avisa (sin bloquear) si difiere 10 % o mas: suele ser un error de captura o de unidad. No es una alerta clinica. |
| Reutilizacion de informacion vigente | En la nota, el panel "Datos vigentes" permite confirmar alergias, medicamentos, suplementos y enfermedades sin volver a capturarlos (`POST /api/patients/:id/history/verify`); la confirmacion queda en la linea de tiempo. Las mediciones de la consulta se insertan en Objetivo (O) con un clic. |
| Deteccion de informacion faltante | Antes de firmar se listan avisos: nota sin consulta, consulta sin mediciones, sin registro de alergias, antecedentes sin confirmar. |
| Catalogos autorizados | Busqueda rapida (combobox accesible) de medicamentos y diagnosticos con codigo, fuente y version. Sin catalogo cargado se usa texto libre. |
| Objetivos | Indicador medible (peso, cintura, IMC, grasa corporal, adherencia), valor meta y periodo de seguimiento. |

Ademas: la linea de tiempo incluye evaluaciones y cada evento abre su registro original (la nota
concreta, antropometria, laboratorios, etc.), y la ficha muestra peso y cintura con el cambio
respecto a la medicion anterior, composicion corporal, requerimiento energetico con su metodo,
adherencia y progreso de objetivos.

### Catalogos

La aplicacion **no incluye contenido de catalogos**: deben importarse desde una fuente autorizada y
vigente que elija la institucion (CSV con columnas `code,name`).

```bash
cd backend
npm run catalog:import -- --type medicamento --source "Fuente autorizada" --version "2026-01" --file catalogo.csv
npm run catalog:import -- --type medicamento --source "Fuente autorizada" --version "2026-01" --file catalogo.csv --apply
```

Sin `--apply` solo valida. Al importar una version nueva, los terminos que ya no vienen se
desactivan (no se borran). La busqueda trata la entrada como texto literal (sin expresiones regulares).

## Etapa 4: alertas clinicas configurables

Una alerta senala un registro que conviene revisar; **no es un diagnostico**. Su prioridad la fija la
regla configurada, nunca un calculo de "gravedad". Las alertas se calculan al momento con los registros
vigentes (no se guardan copias); solo se guarda su estado de revision.

| Tipo de regla | Clase | Que detecta |
| --- | --- | --- |
| Alergias registradas | administrativa | Alergia o intolerancia activa en la historia clinica |
| Seguimientos pendientes | administrativa | Cita programada vencida sin registrar |
| Consultas no realizadas | administrativa | Citas canceladas en los ultimos N dias |
| Datos clinicos incompletos | administrativa | Campos del expediente sin capturar |
| Objetivos sin revision | administrativa | Objetivo pendiente con fecha meta vencida |
| Notas sin firmar | administrativa | Borrador sin firmar por mas de N horas |
| Cambios antropometricos | clinica | Cambio de peso, cintura, cadera o grasa >= X % en N dias |
| Laboratorio fuera de rango | clinica | Resultado del mismo estudio y unidad fuera de los limites configurados |
| Interaccion a revisar | clinica | Terminos configurados presentes a la vez en antecedentes y plan vigente |

- Las reglas administrativas se crean activas por defecto (hechos verificables) y se pueden editar o
  desactivar.
- Las reglas clinicas **no traen umbrales ni terminos de fabrica**: las configura un profesional y no
  se pueden activar sin registrar la referencia clinica que las valida (protocolo, guia o acuerdo).
- Cada cambio de regla queda versionado (`reglasAlertaVersiones`) y en la auditoria.
- Cada alerta muestra motivo, prioridad, fecha, origen, regla y version, y estado de revision
  (pendiente, revisada o descartada con motivo). Las revisiones aparecen en la linea de tiempo.
- Pantallas: Administracion > Reglas de alertas; panel "Alertas" en la ficha del paciente; la seccion
  Seguimiento y evolucion reune las alertas de todos los pacientes activos.
- Permiso nuevo `alerts.configure` (configurar reglas). El super usuario lo tiene y puede delegarlo
  desde Permisos y accesos; los roles no cambiaron. Revisar alertas requiere `patients.manage`.

Endpoints: `GET/POST /api/alerts/rules`, `PUT /api/alerts/rules/:id` (con `expectedVersion`),
`GET /api/alerts/rules/:id/versions`, `GET /api/patients/:id/alerts?status=`,
`POST /api/patients/:id/alerts/review`, `GET /api/clinical/alerts?status=`.

## Etapa 5: reportes PDF y documentos

Los reportes se generan en el servidor (`backend/src/reports/`, con pdfkit y Poppins) a partir de los
registros vigentes. Cada uno se guarda como **documento inmutable** (GridFS `archivos` + coleccion
`documentos`) con su huella SHA-256, una version por paciente y tipo, quien lo genero y el resumen de
los registros de origen. Generar y descargar quedan en la auditoria.

| Reporte | Contenido | Para terceros |
| --- | --- | --- |
| Historia clinica | Identificacion, antecedentes vigentes (con su version), diagnosticos | No |
| Resumen de consulta | Nota SOAP (version, firma y huella), mediciones de la consulta, adendas | No |
| Evaluacion nutricional | Ultima evaluacion guardada con version de formula y datos faltantes | No |
| Plan alimenticio | Plan vigente (version) por tiempo de comida y totales | Si |
| Reporte de evolucion | Peso y cintura: primera, ultima, cambio y grafico solo con mediciones reales | Si |
| Resultados antropometricos | Tabla de mediciones vigentes con metodo | Si (peso, estatura y cintura) |
| Seguimiento de objetivos | Objetivos con indicador, periodo y estado | Si (sin vinculo a diagnosticos) |

Todo reporte lleva identificacion del paciente, profesional responsable, fecha y hora, autor, version
del documento y del registro, paginacion y aviso de confidencialidad. La version **para terceros**
identifica al paciente solo con nombre y edad (sin fecha de nacimiento, expediente, contacto,
diagnosticos, antecedentes, notas ni laboratorios). Una nota en borrador se marca como BORRADOR.

**Adjuntos**: PDF, PNG o JPG de hasta 5 MB. El tipo se verifica por el contenido del archivo (no por la
extension ni por la cabecera), el nombre lo asigna el sistema y la descarga se sirve siempre como
archivo adjunto (`Content-Disposition: attachment`, `nosniff`, `no-store`). Ningun documento se edita
ni se borra desde la aplicacion.

Endpoints: `GET /api/patients/:id/documents`, `POST /api/patients/:id/reports`
(`{ type, audience, noteId? }`), `POST /api/patients/:id/documents` (archivo en bruto + cabecera
`X-Document-Description`), `GET /api/patients/:id/documents/:docId/file`.

Tambien en esta etapa: el limite del cuerpo JSON subio de 10 KB a 100 KB, porque una nota SOAP
completa (hasta 40 000 caracteres) no cabia.

## Etapa 6: seguridad, privacidad y trazabilidad

### Cifrado en la aplicacion

AES-256-GCM (`backend/src/utils/crypto.js`), adicional al cifrado en reposo de Atlas. Cada valor
lleva IV propio, etiqueta de autenticacion (detecta alteraciones), identificador de llave (`kid`) y un
contexto que lo ata a su campo.

| Dato | Donde |
| --- | --- |
| Telefono e identificacion ampliada (correo, domicilio, motivo de consulta, contacto de emergencia) | `patients` |
| Notas SOAP, sus versiones y adendas | `notasClinicas`, `notasVersiones` |
| Reportes PDF y adjuntos (la huella SHA-256 es del contenido original) | GridFS `archivos` |

La llave es `DATA_ENCRYPTION_KEY` (32 bytes en base64) en `backend/.env`. **Guarda una copia de la llave
fuera del servidor**: sin ella no se pueden leer los datos cifrados ni los respaldos. Para cifrar datos
guardados antes de esta etapa: `npm run migrate:stage6` (simulacion) y `npm run migrate:stage6 -- --apply`.

### Sesiones

Cada inicio de sesion crea una sesion en el servidor (`sesiones`) y el JWT lleva su identificador.
Cerrar sesion la revoca (el token deja de servir aunque no haya caducado), se cierra tras
`SESSION_IDLE_MINUTES` (30 por defecto) sin actividad, cambiar la contrasena cierra las demas y
desactivar una cuenta las cierra todas. En Configuracion se ven las sesiones activas y se pueden
cerrar las de otros dispositivos. Si el servidor cierra la sesion, la aplicacion vuelve al inicio.

### Respaldos y recuperacion

```bash
cd backend
npm run backup                                          # backups/<base>_<fecha>.lnbak (cifrado)
npm run restore -- --file backups/<archivo>.lnbak --target <base_nueva>
```

El respaldo incluye todas las colecciones y los archivos, comprimido y cifrado. La restauracion
descifra, valida y verifica el numero de documentos por coleccion, y **solo escribe en una base vacia**.
`backups/` esta en `.gitignore`. El plan gratuito de Atlas no incluye respaldos automaticos: programa
`npm run backup` (por ejemplo con el Programador de tareas de Windows) y guarda las copias fuera del equipo.

### Consentimiento y conservacion

- Consentimientos por paciente (Historia clinica): aviso de privacidad, datos de salud y comunicaciones;
  cada otorgamiento, revocacion o negativa es un registro nuevo con version del aviso, medio y
  documento firmado como evidencia (obligatorio salvo firma electronica en los tipos requeridos).
- Regla de alerta `consentimiento_pendiente` (activa por defecto, prioridad alta).
- Administracion > Privacidad y conservacion: plazo de conservacion de cada expediente
  (`RETENTION_YEARS`, 5 por defecto, desde su ultima actividad) y consentimientos faltantes. **La
  aplicacion nunca borra expedientes**: un plazo cumplido solo indica que debe revisarse.

### Preparacion para HL7 FHIR

`GET /api/patients/:id/fhir` (boton "Exportar FHIR" en Documentos) devuelve un Bundle FHIR R4 de tipo
`collection`: Patient, Observation (LOINC 29463-7 peso, 8302-2 estatura, 8280-0 cintura, 62409-8
cadera, 41982-0 grasa corporal, con unidades UCUM; laboratorio como texto), AllergyIntolerance,
MedicationStatement, Condition, Goal, NutritionOrder, Encounter, Consent y DocumentReference. No
incluye el texto de las notas SOAP. Es una preparacion: antes de intercambiar datos hay que validar el
Bundle con un validador FHIR y acordar perfiles y terminologias con el sistema receptor.

### Pendiente de revision legal

El plazo de 5 anos toma como referencia la NOM-004-SSA3-2012 (conservacion del expediente clinico).
Los tipos de consentimiento siguen el criterio de consentimiento expreso para datos sensibles de la
legislacion de proteccion de datos personales; la LFPDPPP vigente se publico en el DOF el 20 de marzo
de 2025. El plazo, el texto del aviso de privacidad, los tipos de consentimiento y el procedimiento de
derechos del titular (acceso, rectificacion, cancelacion y oposicion) deben confirmarse con asesoria
juridica antes de usar la plataforma con pacientes reales.

## Sugerencia de plan alimenticio con IA (skill NutriPlan)

En Planes alimenticios, "Sugerir con IA" pide a Claude (`claude-opus-5-5`, configurable con `AI_MODEL`)
una propuesta de dia tipo siguiendo la guia NutriPlan (`backend/assets/skills/nutriplan.md`).

- **Datos enviados (sin identificar):** edad, sexo, actividad, objetivo, medidas actuales, energia y
  macronutrientes estimados por el motor, alergias, enfermedades, medicamentos y suplementos vigentes,
  diagnosticos nutricionales activos y las preferencias que escriba el profesional. Nunca nombre,
  contacto, expediente ni fecha de nacimiento. La propuesta muestra exactamente lo que se envio.
- **Consentimiento obligatorio:** tipo "Uso de asistente de IA con datos sin identificar" en Historia
  clinica > Privacidad (sin el, la API responde 409).
- **Seguridad:** con condiciones de riesgo la propuesta lleva advertencias y exige confirmar la
  revision; los alimentos que coinciden con alergias registradas se quitan y se avisa; una negativa del
  modelo o una respuesta incompleta no se presentan como propuesta.
- **Nunca se guarda sola:** se carga en el editor y solo al pulsar "Guardar plan" se crea una version
  cuyo motivo indica que se baso en una propuesta de IA revisada por el profesional.
- Los macronutrientes de cada alimento son estimaciones del modelo: verificalos.
- Salida estructurada validada (`client.beta.messages.parse` + esquema zod), cache del prompt de la
  skill, respaldo automatico de modelo ante una negativa, limite de 20 sugerencias por hora por usuario
  y auditoria (`AI_MEAL_PLAN_SUGGESTED`, solo identificadores y consumo de tokens).

Para activarla agrega tu clave en `backend/.env`:

```
ANTHROPIC_API_KEY=tu_clave
```

Cada sugerencia tiene costo por uso en tu cuenta de Anthropic. Enviar datos de salud a un proveedor
externo es una transferencia de datos personales: el aviso de privacidad debe mencionarla (revision legal).

## Como ejecutar para usar la aplicacion

En Windows, el modo de desarrollo (`npm run dev`) reinicia la API cada vez que algo modifica archivos
de `node_modules`, y durante el reinicio el inicio de sesion falla con error 502. Para usar la app:

```bash
cd backend
npm start
```

y en otra terminal `npm --prefix frontend run dev`. Usa `npm run dev` solo mientras programas.

## Despliegue en Vercel

Repositorio: `losnahuales777-gif/blooome` (privado). Sitio: https://blooome.vercel.app. Cada envio a `main` despliega solo.

- `vercel.json`: instala `backend` (solo produccion) y `frontend` (con dependencias de desarrollo, por `vite`), compila el frontend y sirve `frontend/dist`; `/api/*` va a la funcion `api/index.js`.
- `api/index.js`: la misma app de Express como funcion de Vercel; abre la conexion a MongoDB una vez por instancia y la reintenta si falla.
- Configuracion del proyecto en Vercel: Root Directory vacio (raiz del repositorio) y Framework Preset *Other*.
- Variables de entorno: las mismas del `.env` con `NODE_ENV=production`, `TRUST_PROXY=1` y `CORS_ORIGIN=https://blooome.vercel.app`, sin `PORT`. Se cargan en Vercel (Settings > Environment Variables); nunca en el repositorio.
- MongoDB Atlas: Vercel no tiene IP fija, por eso Network Access incluye `0.0.0.0/0`; la base queda protegida por el usuario y la contrasena de Atlas.
- Limitacion: el boton "Crear respaldo ahora" no funciona en Vercel (no guarda archivos); los respaldos se hacen localmente con `npm run backup`.

## Estado

Las seis etapas del plan estan implementadas y cubiertas por pruebas automaticas (28 unitarias y 79
de integracion contra bases temporales que se eliminan al terminar).
