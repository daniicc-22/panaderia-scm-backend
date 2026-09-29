import { createContext, useContext, useState, type ReactNode } from 'react';

// NOTA: Esto es un mock de "panadería activa" para efectos de UI.
// No representa ningún campo real de la base de datos (no existe aún
// un modelo de tenant/panadería confirmado en el backend).
// Cuando el backend defina el modelo real, este contexto debe
// reemplazarse por datos reales obtenidos del servidor.

interface PanaderiaDemo {
  id: string;
  nombre: string;
}

const PANADERIA_DEMO: PanaderiaDemo = {
  id: 'demo-panaderia-1',
  nombre: 'Panadería Demo',
};

interface TenantContextValue {
  panaderiaActiva: PanaderiaDemo;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [panaderiaActiva] = useState<PanaderiaDemo>(PANADERIA_DEMO);

  return (
    <TenantContext.Provider value={{ panaderiaActiva }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantContextValue {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant debe usarse dentro de un <TenantProvider>');
  }
  return context;
}