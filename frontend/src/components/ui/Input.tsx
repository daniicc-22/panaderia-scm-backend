import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = '', ...rest }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-grafito">
            {label}
          </label>
        )}
        <input
          id={id}
          ref={ref}
          className={`rounded-lg border bg-white px-3 py-2 text-sm text-grafito transition-colors placeholder:text-gris-texto focus:outline-hidden focus:ring-2 focus:ring-trigo ${
            error ? 'border-critico-texto' : 'border-borde-campo'
          } ${className}`}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
        {error && <span className="text-xs font-medium text-critico-texto">{error}</span>}
      </div>
    );
  },
);

Input.displayName = 'Input';
