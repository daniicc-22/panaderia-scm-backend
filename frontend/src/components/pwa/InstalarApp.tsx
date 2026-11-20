import { Download } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { leerEstadoInstalacion, olvidarEvento, suscribirInstalacion } from './eventoInstalacion';

// iPhone y iPad no lanzan el aviso de instalación: ahí se instala a mano desde el menú Compartir de Safari
const esIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

interface Props {
  className?: string;
  // En espacios pequeños se muestra solo el icono
  soloIcono?: boolean;
}

export function InstalarApp({ className, soloIcono = false }: Props) {
  const { evento, instalada } = useSyncExternalStore(suscribirInstalacion, leerEstadoInstalacion);
  const [verAyudaIos, setVerAyudaIos] = useState(false);

  if (instalada) return null;
  // Sin aviso de instalación y sin ser iPhone/iPad (por ejemplo, Firefox de escritorio) no hay nada que ofrecer
  if (!evento && !esIos()) return null;

  const instalar = async () => {
    if (evento) {
      await evento.prompt();
      await evento.userChoice;
      olvidarEvento();
    } else {
      setVerAyudaIos(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void instalar()}
        className={className ?? 'inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-niebla hover:text-white'}
        aria-label="Instalar la app en este equipo"
        title="Instalar la app"
      >
        <Download size={soloIcono ? 22 : 18} aria-hidden="true" />
        {!soloIcono && <span>Instalar app</span>}
      </button>

      {verAyudaIos && (
        <div
          role="dialog"
          aria-label="Cómo instalar Levain en iPhone"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl border border-noche-borde bg-azul-noche p-4 text-sm text-white shadow-lg print:hidden"
        >
          <p className="font-semibold">Instalar Levain en tu iPhone</p>
          <p className="mt-1 text-niebla">
            Abre esta página en Safari, toca el botón <strong>Compartir</strong> y elige{' '}
            <strong>«Agregar a pantalla de inicio»</strong>. Después ábrela desde ese icono.
          </p>
          <button
            type="button"
            onClick={() => setVerAyudaIos(false)}
            className="mt-3 min-h-10 rounded-lg bg-trigo px-4 font-semibold text-azul-noche hover:opacity-90"
          >
            Entendido
          </button>
        </div>
      )}
    </>
  );
}
