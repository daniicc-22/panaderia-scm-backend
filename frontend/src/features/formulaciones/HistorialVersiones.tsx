import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Esqueleto } from '../../components/feedback/Esqueleto';
import { Panel } from '../inicio/Panel';
import { getVersiones } from '../../services/formulacionesService';

const pesos0 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
const pesos2 = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });

// "2026-10-21" -> "21/10/2026" sin pasar por Date (evita el desfase de zona horaria)
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

// Línea de tiempo de versiones: la más reciente arriba, con cuánto cambió el costo frente a la anterior
export function HistorialVersiones({ formulacionId }: { formulacionId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['formulacion-versiones', formulacionId],
    queryFn: () => getVersiones(formulacionId),
  });

  const versiones = [...(data?.versiones ?? [])].sort((a, b) => b.version - a.version);

  return (
    <Panel titulo="Historial de versiones" subtitulo="Las versiones anteriores no se modifican. El costo de cada una usa los precios de hoy.">
      {isLoading && <Esqueleto className="h-28" />}
      {isError && (
        <p className="text-sm text-critico-texto">
          No se pudo cargar el historial.{' '}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>
            Reintentar
          </button>
        </p>
      )}
      {data && versiones.length === 0 && <p className="text-sm text-gris-texto">Este producto solo tiene una versión.</p>}
      {versiones.length > 0 && (
        <ol className="relative flex flex-col gap-3 border-l-2 border-linea pl-5">
          {versiones.map((v, i) => {
            const anterior = versiones[i + 1];
            const delta = anterior && anterior.costo_lote > 0 ? ((v.costo_lote - anterior.costo_lote) / anterior.costo_lote) * 100 : null;
            const aqui = v.id === formulacionId;
            return (
              <li key={v.id} className="relative">
                <span
                  aria-hidden="true"
                  className={`absolute -left-[27px] top-3 size-3 rounded-full border-2 border-tabla ${v.activa ? 'bg-verde-bosque' : 'bg-grafico-neutro'}`}
                />
                <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-3 py-2.5 ${aqui ? 'border-azul-noche bg-azul-suave/50' : 'border-linea bg-white'}`}>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-grafito">
                      Versión {v.version}
                      {v.activa ? (
                        <span className="rounded-full bg-exito-fondo px-2 py-0.5 text-xs text-exito-texto">Vigente</span>
                      ) : (
                        <span className="rounded-full bg-arena px-2 py-0.5 text-xs text-gris-texto">Anterior</span>
                      )}
                      {aqui && <span className="rounded-full bg-azul-noche px-2 py-0.5 text-xs text-white">Estás aquí</span>}
                    </p>
                    <p className="text-xs text-gris-texto">
                      {fechaCorta(v.vigente_desde)} → {v.vigente_hasta ? fechaCorta(v.vigente_hasta) : 'hoy'} · rinde {v.rendimiento ?? '—'} · {v.ingredientes} ingredientes
                      {v.aprobado_por ? ` · aprobó ${v.aprobado_por}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="cifras text-sm font-semibold text-grafito">{pesos0.format(v.costo_lote)} <span className="font-normal text-gris-texto">/ lote</span></p>
                      <p className="cifras text-xs text-gris-texto">
                        {v.costo_unidad == null ? '—' : `${pesos2.format(v.costo_unidad)} / unidad`}
                        {v.costo_incompleto && <span className="ml-1 font-semibold text-atencion-texto">· incompleto</span>}
                      </p>
                    </div>
                    {delta !== null && Math.abs(delta) >= 0.05 && (
                      <span className={`cifras text-xs font-bold ${delta > 0 ? 'text-critico-texto' : 'text-exito-texto'}`} title="Frente a la versión anterior">
                        {delta > 0 ? '▲ +' : '▼ '}
                        {delta.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %
                      </span>
                    )}
                    {!aqui && (
                      <Link to={`/formulaciones/${v.id}`} className="min-h-11 content-center text-sm font-semibold text-pizarra hover:underline print:hidden">
                        Ver
                      </Link>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
