import type { ReactNode } from 'react';

interface PanelProps {
  titulo: string;
  subtitulo?: string;
  // Enlace o botón a la derecha del título
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
}

// Tarjeta común del Inicio: mismo borde, sombra, espaciado y encabezado en todas las secciones
export function Panel({ titulo, subtitulo, accion, children, className = '' }: PanelProps) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 ${className}`} aria-label={titulo}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{titulo}</h2>
          {subtitulo && <p className="text-sm text-gray-500">{subtitulo}</p>}
        </div>
        {accion && <div className="shrink-0 text-sm">{accion}</div>}
      </div>
      {children}
    </section>
  );
}

export function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{titulo}</h2>
      {children}
    </div>
  );
}

interface IndicadorProps {
  etiqueta: string;
  valor: string;
  detalle?: string;
  // Franja de color a la izquierda: da jerarquía sin pintar toda la tarjeta
  tono?: 'azul' | 'verde' | 'amarillo' | 'rojo' | 'gris';
}

const FRANJA: Record<NonNullable<IndicadorProps['tono']>, string> = {
  azul: 'bg-[#2a78d6]',
  verde: 'bg-green-600',
  amarillo: 'bg-yellow-500',
  rojo: 'bg-red-600',
  gris: 'bg-gray-300',
};

export function Indicador({ etiqueta, valor, detalle, tono = 'gris' }: IndicadorProps) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 pl-5 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1 ${FRANJA[tono]}`} aria-hidden="true" />
      <p className="text-xs font-medium text-gray-500">{etiqueta}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">{detalle}</p>}
    </div>
  );
}
