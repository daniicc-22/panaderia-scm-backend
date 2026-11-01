import type { ReactNode } from 'react';

interface PageHeaderProps {
  titulo: string;
  subtitulo?: ReactNode;
  /** Botones o controles a la derecha (por ejemplo, Actualizar o Registrar entrada). */
  acciones?: ReactNode;
}

// Franja de color de cada página: pizarra con el título en Fraunces.
// Ocupa todo el ancho (anula el relleno de <main>) para que se vea como una banda.
export function PageHeader({ titulo, subtitulo, acciones }: PageHeaderProps) {
  return (
    <header className="-mx-4 -mt-4 mb-6 bg-pizarra px-4 py-5 text-white sm:-mx-6 sm:-mt-6 sm:px-7 sm:py-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold sm:text-[28px]">{titulo}</h1>
          {subtitulo && <p className="mt-1 text-sm text-niebla">{subtitulo}</p>}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
    </header>
  );
}
