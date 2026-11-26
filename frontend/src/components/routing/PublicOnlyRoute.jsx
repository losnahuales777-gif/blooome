import { Navigate, Outlet } from 'react-router';
import { useAuth } from '../../business/auth/useAuth.js';
import FullScreenLoader from '../FullScreenLoader.jsx';

export default function PublicOnlyRoute() {
  const { status } = useAuth();

  if (status === 'loading') return <FullScreenLoader />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}
