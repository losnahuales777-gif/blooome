import { useAuth } from '../../business/auth/useAuth.js';
import ForbiddenPage from '../../pages/ForbiddenPage.jsx';

// Protege una ruta por permiso (o por uno de varios). Es solo UX: la API valida el mismo permiso en cada endpoint.
export default function RequirePermission({ permission, anyOf, children }) {
  const { hasPermission } = useAuth();
  const allowed = anyOf ? anyOf.some((p) => hasPermission(p)) : hasPermission(permission);
  return allowed ? children : <ForbiddenPage />;
}
