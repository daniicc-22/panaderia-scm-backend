import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleCheck, Info, OctagonAlert, X } from 'lucide-react';
import { AvisosContext, type TipoAviso } from './avisosContext';

interface Aviso {
  id: number;
  tipo: TipoAviso;
  texto: string;
}

const ESTILO = {
  exito: { icono: CircleCheck, borde: 'border-l-verde-bosque' },
  info: { icono: Info, borde: 'border-l-trigo' },
  error: { icono: OctagonAlert, borde: 'border-l-terracota' },
} as const;

const DURACION_MS = 5000;

// Avisos breves abajo de la pantalla. Siempre color + ícono + texto, y se anuncian a lectores de pantalla.
export function AvisosProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const contador = useRef(0);

  const cerrar = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), []);
  const avisar = useCallback(
    (texto: string, tipo: TipoAviso = 'exito') => {
      const id = ++contador.current;
      setAvisos((a) => [...a.slice(-2), { id, tipo, texto }]);
      window.setTimeout(() => cerrar(id), DURACION_MS);
    },
    [cerrar],
  );
  const valor = useMemo(() => ({ avisar }), [avisar]);

  return (
    <AvisosContext.Provider value={valor}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 print:hidden"
        role="status"
        aria-live="polite"
      >
        {avisos.map((a) => {
          const e = ESTILO[a.tipo];
          return (
            <div
              key={a.id}
              className={`pointer-events-auto flex w-full max-w-md animate-entra items-start gap-3 rounded-tarjeta border-l-4 bg-azul-noche px-4 py-3 text-sm text-white shadow-elevada ${e.borde}`}
            >
              <e.icono size={18} className="mt-0.5 shrink-0 text-trigo" aria-hidden="true" />
              <p className="min-w-0 flex-1">{a.texto}</p>
              <button type="button" onClick={() => cerrar(a.id)} aria-label="Cerrar aviso" className="-m-2 rounded-md p-2 text-niebla hover:text-white">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </AvisosContext.Provider>
  );
}
