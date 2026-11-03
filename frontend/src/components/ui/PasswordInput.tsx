import { forwardRef, useState, type InputHTMLAttributes } from 'react';

interface PasswordInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label, error, id, className = '', ...rest }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-grafito">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            id={id}
            ref={ref}
            type={visible ? 'text' : 'password'}
            className={`w-full rounded-lg border bg-white px-3 py-2 pr-16 text-sm text-grafito placeholder:text-gris-texto transition-colors focus:outline-hidden focus:ring-2 focus:ring-trigo ${
              error ? 'border-critico-texto' : 'border-borde-campo'
            } ${className}`}
            {...rest}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-pizarra hover:underline"
          >
            {visible ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
        {error && <span className="text-xs text-critico-texto">{error}</span>}
      </div>
    );
  },
);

PasswordInput.displayName = 'PasswordInput';