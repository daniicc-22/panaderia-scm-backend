import type { ReactNode } from 'react';

interface AlertProps {
  children: ReactNode;
  variant?: 'error' | 'success' | 'info' | 'warning';
}

const VARIANT_CLASSES: Record<string, string> = {
  error: 'bg-red-50 text-red-700 border-red-200',
  success: 'bg-green-50 text-green-700 border-green-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};

export function Alert({ children, variant = 'info' }: AlertProps) {
  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${VARIANT_CLASSES[variant]}`}>
      {children}
    </div>
  );
}