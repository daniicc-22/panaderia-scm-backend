import type { ReactNode } from 'react';
import { CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface AlertProps {
  children: ReactNode;
  variant?: 'error' | 'success' | 'info' | 'warning';
}

// Aviso dentro de una pantalla: siempre color + ícono + texto
const VARIANTES: Record<NonNullable<AlertProps['variant']>, { clases: string; icono: LucideIcon }> = {
  error: { clases: 'border-[#f0c3c0] bg-critico-fondo text-critico-texto', icono: OctagonAlert },
  success: { clases: 'border-[#c5dccb] bg-exito-fondo text-exito-texto', icono: CircleCheck },
  info: { clases: 'border-[#c6d3de] bg-info-fondo text-azul-noche', icono: Info },
  warning: { clases: 'border-[#f1d9a6] bg-atencion-fondo text-atencion-texto', icono: TriangleAlert },
};

export function Alert({ children, variant = 'info' }: AlertProps) {
  const v = VARIANTES[variant];
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`flex animate-desliza items-start gap-3 rounded-tarjeta border px-4 py-3 text-sm ${v.clases}`}
    >
      <v.icono size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
