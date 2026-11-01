import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  color?: 'gray' | 'green' | 'red' | 'yellow' | 'blue';
}

// Etiqueta de estado del sistema de diseño (píldora). Los nombres de color se conservan
// para no cambiar las pantallas: green = bien, yellow = atención, red = crítico, blue = información.
const COLOR_CLASSES: Record<NonNullable<BadgeProps['color']>, string> = {
  gray: 'bg-arena text-grafito',
  green: 'bg-exito-fondo text-exito-texto',
  red: 'bg-critico-fondo text-critico-texto',
  yellow: 'bg-atencion-fondo text-atencion-texto',
  blue: 'bg-info-fondo text-azul-noche',
};

export function Badge({ children, color = 'gray' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLOR_CLASSES[color]}`}
    >
      {children}
    </span>
  );
}
