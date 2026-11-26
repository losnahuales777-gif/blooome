import { useState } from 'react';
import { Outlet } from 'react-router';
import { useSystemConfig } from '../../business/system/useSystemConfig.js';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { maintenanceMessage } = useSystemConfig();

  return (
    <div className="min-h-screen">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64 print:pl-0">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        {maintenanceMessage && (
          <p role="status" className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-sm text-warning">
            {maintenanceMessage}
          </p>
        )}
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
