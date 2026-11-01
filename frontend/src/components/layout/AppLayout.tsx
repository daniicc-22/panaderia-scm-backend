import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export function AppLayout() {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    // reducedMotion="user": si el equipo pide reducir movimiento, Motion no anima
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen bg-hueso">
        <Sidebar abierto={menuAbierto} onCerrar={() => setMenuAbierto(false)} />

        <div className="flex min-w-0 flex-1 flex-col">
          <Header onAbrirMenu={() => setMenuAbierto(true)} />
          <main className="flex-1 p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
