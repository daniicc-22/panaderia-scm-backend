import { useQuery } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import { useEffect } from 'react';
import { getPanaderias } from '../../services/panaderiasService';
import { getPanaderiaActivaId, setPanaderiaActivaId } from '../../services/panaderiaActiva';

// Solo para el superadministrador: elegir qué panadería piloto está viendo. Al cambiar se recarga la pantalla
// para que ningún dato de la panadería anterior quede en pantalla ni en caché.
export function SelectorPanaderia({ nombreActual }: { nombreActual?: string }) {
  const lista = useQuery({ queryKey: ['panaderias', 'selector'], queryFn: getPanaderias, staleTime: 60 * 1000 });
  const activas = (lista.data ?? []).filter((p) => p.activa);
  const guardada = getPanaderiaActivaId();
  const guardadaValida = guardada !== null && activas.some((p) => p.id === guardada);

  // Si la panadería guardada se desactivó o ya no existe, se vuelve a la primera activa
  useEffect(() => {
    if (lista.data && guardada && !guardadaValida) {
      setPanaderiaActivaId(null);
      window.location.assign('/');
    }
  }, [lista.data, guardada, guardadaValida]);

  const elegir = (id: string) => {
    setPanaderiaActivaId(id);
    window.location.assign('/');
  };

  if (activas.length < 2) {
    return nombreActual ? (
      <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-noche-tarjeta px-3 py-2 text-sm text-trigo">
        <Store size={16} aria-hidden="true" />
        <span className="truncate">{nombreActual}</span>
      </div>
    ) : null;
  }

  const valor = guardadaValida ? guardada : (activas.find((p) => p.nombre === nombreActual)?.id ?? '');

  return (
    <div className="mx-4 mb-2 flex items-center gap-2 rounded-lg bg-noche-tarjeta px-3 py-2 text-sm text-trigo">
      <Store size={16} aria-hidden="true" className="shrink-0" />
      <label className="sr-only" htmlFor="selector-panaderia">
        Panadería que estás viendo
      </label>
      <select
        id="selector-panaderia"
        value={valor}
        onChange={(e) => elegir(e.target.value)}
        className="min-w-0 flex-1 cursor-pointer truncate bg-transparent font-medium text-trigo focus:outline-none"
      >
        {activas.map((p) => (
          <option key={p.id} value={p.id} className="bg-azul-noche text-white">
            {p.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
