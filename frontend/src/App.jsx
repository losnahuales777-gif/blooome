import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router';
import FullScreenLoader from './components/FullScreenLoader.jsx';
import MainLayout from './components/layout/MainLayout.jsx';
import ProtectedRoute from './components/routing/ProtectedRoute.jsx';
import PublicOnlyRoute from './components/routing/PublicOnlyRoute.jsx';
import RequirePermission from './components/routing/RequirePermission.jsx';
import { PERMISSIONS } from './models/access.model.js';
import { NAV_ITEMS } from './models/navigation.model.js';
import AccessPage from './pages/AccessPage.jsx';
import ActivatePage from './pages/ActivatePage.jsx';
import ActivityPage from './pages/ActivityPage.jsx';
import PatientDirectoryPage from './pages/PatientDirectoryPage.jsx';
import PortalPage from './pages/PortalPage.jsx';
import RolesPage from './pages/RolesPage.jsx';
import SystemPage from './pages/SystemPage.jsx';
import AccountsPage from './pages/AccountsPage.jsx';
import AlertRulesPage from './pages/AlertRulesPage.jsx';
import AuditPage from './pages/AuditPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import MealPlanPage from './pages/MealPlanPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import PatientsPage from './pages/PatientsPage.jsx';
import PrivacyPage from './pages/PrivacyPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import {
  AgendaPage,
  ConsultationsPage,
  EvaluationsPage,
  FollowUpPage,
  LabsPage,
  RecordsPage,
  ReportsPage,
} from './pages/WorklistPages.jsx';

const PatientChartPage = lazy(() => import('./pages/PatientChartPage.jsx'));
const PatientAnalysisPage = lazy(() => import('./pages/PatientAnalysisPage.jsx'));

const PAGES = {
  '/': DashboardPage,
  '/pacientes': PatientsPage,
  '/expedientes': RecordsPage,
  '/consultas': ConsultationsPage,
  '/evaluaciones': EvaluationsPage,
  '/plan-alimenticio': MealPlanPage,
  '/seguimiento': FollowUpPage,
  '/laboratorios': LabsPage,
  '/agenda': AgendaPage,
  '/reportes': ReportsPage,
  '/cuentas': AccountsPage,
  '/accesos': AccessPage,
  '/alertas/reglas': AlertRulesPage,
  '/portal': PortalPage,
  '/admin/pacientes': PatientDirectoryPage,
  '/actividad': ActivityPage,
  '/roles': RolesPage,
  '/sistema': SystemPage,
  '/privacidad': PrivacyPage,
  '/auditoria': AuditPage,
};

// Enlaces antiguos (/usuarios) siguen funcionando.
function LegacyPatientRedirect() {
  const { id } = useParams();
  return <Navigate to={`/pacientes/${id}?tab=evolucion`} replace />;
}

const withPatientsPermission = (node) => (
  <RequirePermission permission={PERMISSIONS.PATIENTS_VIEW}>
    <Suspense fallback={<FullScreenLoader />}>{node}</Suspense>
  </RequirePermission>
);

export default function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/activar" element={<ActivatePage />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          {NAV_ITEMS.map(({ to, permission, anyOf }) => {
            const Page = PAGES[to];
            // Inicio: el paciente entra a "/" y su panel lo envia al portal.
            const guard = to === '/' ? { anyOf: [PERMISSIONS.DASHBOARD_VIEW, PERMISSIONS.PORTAL_SELF] } : { permission, anyOf };
            const element = (
              <RequirePermission {...guard}>
                <Page />
              </RequirePermission>
            );
            return to === '/' ? <Route key={to} index element={element} /> : <Route key={to} path={to} element={element} />;
          })}
          {/* Cualquier usuario con sesion puede ver su propia configuracion. */}
          <Route path="/configuracion" element={<SettingsPage />} />
          {/* Ficha del paciente: centro del expediente clinico. */}
          <Route path="/pacientes/:id" element={withPatientsPermission(<PatientChartPage />)} />
          <Route path="/pacientes/:id/analisis" element={withPatientsPermission(<PatientAnalysisPage />)} />
          <Route path="/usuarios" element={<Navigate to="/pacientes" replace />} />
          <Route path="/usuarios/:id" element={<LegacyPatientRedirect />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
