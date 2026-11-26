import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../business/auth/useAuth.js';
import FullScreenLoader from '../FullScreenLoader.jsx';

export default function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullScreenLoader />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
