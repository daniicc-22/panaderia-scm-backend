import { forwardRef, type SelectHTMLAttributes, type ReactNode } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, id, className = '', children, ...rest }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-grafito">
            {label}
          </label>
        )}
        <select
          id={id}
          ref={ref}
          className={`rounded-lg border bg-white px-3 py-2 text-sm text-grafito transition-colors focus:outline-hidden focus:ring-2 focus:ring-trigo ${
            error ? 'border-critico-texto' : 'border-borde-campo'
          } ${className}`}
          aria-invalid={error ? true : undefined}
          {...rest}
        >
          {children}
        </select>
        {error && <span className="text-xs font-medium text-critico-texto">{error}</span>}
      </div>
    );
  },
);

Select.displayName = 'Select';
