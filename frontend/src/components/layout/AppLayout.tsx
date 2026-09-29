import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function AppLayout() {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar abierto={menuAbierto} onCerrar={() => setMenuAbierto(false)} />

      <div className="flex flex-1 flex-col">
        <Header onAbrirMenu={() => setMenuAbierto(true)} />
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}