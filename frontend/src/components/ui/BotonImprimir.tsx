import { Printer } from 'lucide-react';

// Abre el diálogo de impresión del navegador; desde ahí también se guarda como PDF.
// La hoja de impresión (index.css) oculta el menú y los botones y deja solo el informe.
export function BotonImprimir({ etiqueta = 'Imprimir / PDF' }: { etiqueta?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-grafico-neutro px-4 text-sm font-semibold text-white transition-colors hover:bg-azul-noche print:hidden"
    >
      <Printer size={16} aria-hidden="true" />
      {etiqueta}
    </button>
  );
}
