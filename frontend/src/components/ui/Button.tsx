import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'trigo';
  isLoading?: boolean;
  children: ReactNode;
}

// primary = acción principal (terracota) · secondary = acción secundaria
// trigo = acción principal del operario · danger = acción destructiva
const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-terracota text-white hover:bg-[#93502f]',
  secondary: 'border border-borde-campo bg-tabla text-azul-noche hover:bg-arena',
  danger: 'bg-critico-texto text-white hover:bg-[#86231f]',
  trigo: 'bg-trigo text-grafito hover:bg-[#d69b2e]',
};

export function Button({
  variant = 'primary',
  isLoading = false,
  disabled,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {isLoading ? (
        <>
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          Cargando…
        </>
      ) : (
        children
      )}
    </button>
  );
}
