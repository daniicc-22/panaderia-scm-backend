import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Esqueleto } from '../../components/feedback/Esqueleto';
import { Panel } from '../inicio/Panel';
import { getUsadoEn } from '../../services/formulacionesService';

const num = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

// Para un producto intermedio: qué productos lo llevan como ingrediente. Es lo que se afecta si se cambia o se da de baja.
export function UsadoEn({ formulacionId }: { formulacionId: string }) {
  const { data, isLoading, isError } = useQuery({ queryKey: ['formulacion-usado-en', formulacionId], queryFn: () => getUsadoEn(formulacionId) });

  return (
    <Panel titulo="Dónde se usa" subtitulo="Productos con este intermedio como ingrediente">
      {isLoading && <Esqueleto className="h-16" />}
      {isError && <p className="text-sm text-critico-texto">No se pudo consultar dónde se usa.</p>}
      {data && data.items.length === 0 && (
        <p className="text-sm text-gris-texto">Ningún producto lo usa todavía. Se puede dar de baja sin afectar otras recetas.</p>
      )}
      {data && data.items.length > 0 && (
        <>
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.items.map((u) => (
              <li key={u.formulacion_id}>
                <Link to={`/formulaciones/${u.formulacion_id}`} className="group flex items-center justify-between gap-3 rounded-lg border border-linea bg-white px-3 py-2.5 hover:bg-arena">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-grafito">{u.producto}</span>
                    <span className="cifras text-xs text-gris-texto">{num.format(u.cantidad_g / 1000)} kg por lote{u.activo ? '' : ' · dado de baja'}</span>
                  </span>
                  <ArrowRight size={15} aria-hidden="true" className="shrink-0 text-gris-texto transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gris-texto">Si cambias la receta de este intermedio, el costo de estos {data.items.length === 1 ? 'producto cambia' : 'productos cambia'} también. No se puede dar de baja mientras alguno activo lo use.</p>
        </>
      )}
    </Panel>
  );
}
