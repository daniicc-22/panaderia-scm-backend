import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`animate-entra rounded-tarjeta border border-linea bg-tabla p-6 ${className}`}>{children}</div>;
}
