import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/feedback/EmptyState';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { ESTADOS, etiquetaAdvertencia, etiquetaFaltante, ORIGEN_DEMANDA } from '../features/reposicion/etiquetas';
import { formatoCantidad, formatoDinero, formatoFecha } from '../features/inventario/formatos';
import { NavReposicion } from '../features/reposicion/NavReposicion';
import { getRecomendaciones } from '../services/reposicionService';
import type { EstadoReposicion, ItemRecomendacion } from '../types/reposicion.types';

const ORDEN_RESUMEN: EstadoReposicion[] = ['quiebre_probable', 'riesgo', 'pedir_hoy', 'pedir', 'datos_insuficientes', 'sobreinventario', 'ok'];

function textoCobertura(i: ItemRecomendacion): string {
  if (i.cobertura_dias === null) return 'sin dato de consumo';
  return `${i.cobertura_dias.toLocaleString('es-CO', { maximumFractionDigits: 1 })} días de cobertura`;
}

function FilaInsumo({ i }: { i: ItemRecomendacion }) {
  const estado = ESTADOS[i.estado];
  return (
    <li className="rounded-lg border border-linea bg-tabla p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-grafito">
            {i.nombre}
            {i.clase_abc && <Badge color={i.clase_abc === 'A' ? 'red' : i.clase_abc === 'B' ? 'yellow' : 'gray'}>Clase {i.clase_abc}</Badge>}
            <Badge color={estado.color}>{estado.etiqueta}</Badge>
          </p>
          <p className="text-xs text-gris-texto">
            Hay {formatoCantidad(i.existencia, i.unidad)} · {textoCobertura(i)}
            {i.fecha_agotamiento && ` · se acaba el ${formatoFecha(i.fecha_agotamiento)}`}
          </p>
        </div>
        {i.cantidad_recomendada > 0 && (
          <div className="text-right text-sm">
            <p className="font-medium text-grafito">
              Pedir {i.presentaciones_a_pedir?.toLocaleString('es-CO', { maximumFractionDigits: 2 })} × {i.presentacion}
            </p>
            <p className="text-xs text-gris-texto">
              {formatoCantidad(i.cantidad_recomendada, i.unidad)}
              {i.costos && ` · ${formatoDinero(i.costos.valor_pedido)}`}
            </p>
          </div>
        )}
      </div>

      {i.cantidad_recomendada > 0 && (i.proveedor || i.fecha_limite_pedido) && (
        <p className="mt-1 text-xs text-gris-texto">
          {i.proveedor && `Proveedor: ${i.proveedor.nombre}`}
          {i.fecha_limite_pedido && ` · pedir a más tardar el ${formatoFecha(i.fecha_limite_pedido)}`}
          {i.proxima_entrega && ` · llega el ${formatoFecha(i.proxima_entrega)}`}
        </p>
      )}

      {i.faltantes.length > 0 && <p className="mt-1 text-xs text-gris-texto">Falta: {i.faltantes.map(etiquetaFaltante).join(', ')}.</p>}
      {i.advertencias.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-xs text-atencion-texto">
          {i.advertencias.map((a) => (
            <li key={a}>{etiquetaAdvertencia(a)}</li>
          ))}
        </ul>
      )}

      <details className="mt-1 text-xs text-gris-texto">
        <summary className="cursor-pointer">Ver cómo se calculó</summary>
        <ul className="mt-1 grid gap-x-4 sm:grid-cols-2">
          <li>
            Consumo semanal: {i.demanda_semanal === null ? 'sin dato' : formatoCantidad(i.demanda_semanal, i.unidad)}
            {i.demanda_origen && ` (${ORIGEN_DEMANDA[i.demanda_origen]})`}
          </li>
          <li>Stock de seguridad: {i.stock_seguridad === null ? 'sin definir' : formatoCantidad(i.stock_seguridad, i.unidad)}</li>
          <li>Proyección al llegar el pedido: {i.proyeccion_a_la_entrega === null ? '—' : formatoCantidad(i.proyeccion_a_la_entrega, i.unidad)}</li>
          <li>Punto de reorden: {i.punto_reorden_calendario === null ? '—' : formatoCantidad(i.punto_reorden_calendario, i.unidad)}</li>
          <li>Nivel objetivo: {i.nivel_objetivo === null ? '—' : formatoCantidad(i.nivel_objetivo, i.unidad)}</li>
          <li>EOQ (cantidad económica): {i.eoq === null ? 'no se calcula' : formatoCantidad(i.eoq, i.unidad)}</li>
          <li>Entregas que cubre el pedido: {i.ciclos_elegidos ?? '—'}</li>
          <li>{estado.detalle}</li>
        </ul>
      </details>
    </li>
  );
}

export function ReposicionPage() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['reposicion', 'recomendaciones'], queryFn: getRecomendaciones });
  const [estado, setEstado] = useState<EstadoReposicion | null>(null);

  const visibles = useMemo(() => (data?.items ?? []).filter((i) => estado === null || i.estado === estado), [data, estado]);

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 -mt-4 bg-pizarra px-4 py-5 text-white sm:-mx-6 sm:-mt-6 sm:px-7 sm:py-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white sm:text-[28px]">Reposición</h1>
          <p className="mt-1 text-sm text-niebla">
            Qué pedir, cuándo y cuánto{data ? ` · cálculo de hoy, ${formatoFecha(data.fecha)}` : ''}
          </p>
        </div>
      </div>
      <NavReposicion />

      {isLoading && <LoadingState mensaje="Calculando..." />}
      {isError && <ErrorState onReintentar={() => refetch()} />}

      {data && (
        <>
          {data.resumen.datos_insuficientes > 0 && (
            <Alert variant="warning">
              {data.resumen.datos_insuficientes === 1 ? '1 insumo no se puede calcular' : `${data.resumen.datos_insuficientes} insumos no se pueden calcular`} porque
              faltan datos. El sistema no inventa valores: complétalos en{' '}
              <Link to="/reposicion/parametros" className="font-medium underline">
                Parámetros
              </Link>{' '}
              y en Proveedores (días de entrega).
            </Alert>
          )}

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
            <button
              type="button"
              onClick={() => setEstado(null)}
              className={`min-h-11 rounded-full border px-3 text-sm ${estado === null ? 'border-azul-noche bg-info-fondo text-pizarra' : 'border-borde-campo text-grafito'}`}
            >
              Todos ({data.items.length})
            </button>
            {ORDEN_RESUMEN.filter((e) => data.resumen[e] > 0).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEstado(estado === e ? null : e)}
                className={`min-h-11 rounded-full border px-3 text-sm ${estado === e ? 'border-azul-noche bg-info-fondo text-pizarra' : 'border-borde-campo text-grafito'}`}
              >
                {ESTADOS[e].etiqueta} ({data.resumen[e]})
              </button>
            ))}
          </div>

          {data.pedidos.length > 0 && (
            <section className="flex flex-col gap-2" aria-label="Pedidos por proveedor">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gris-texto">Pedidos por proveedor</h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {data.pedidos.map((p) => {
                  const min = p.costos.pedido_minimo;
                  return (
                    <li key={p.proveedor.id} className="rounded-xl border border-linea bg-tabla p-4 shadow-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-base font-semibold text-grafito">{p.proveedor.nombre}</p>
                          <p className="text-xs text-gris-texto">
                            {p.fecha_limite_pedido && `Pedir a más tardar el ${formatoFecha(p.fecha_limite_pedido)}`}
                            {p.proxima_entrega && ` · llega el ${formatoFecha(p.proxima_entrega)}`}
                          </p>
                        </div>
                        <p className="text-base font-semibold text-grafito">{formatoDinero(p.costos.total)}</p>
                      </div>
                      {min.cumple === false && (
                        <p className="mt-2 rounded-md bg-atencion-fondo px-2 py-1 text-xs text-atencion-texto">
                          No llega al pedido mínimo de {formatoDinero(min.minimo ?? 0)}: faltan {formatoDinero(min.faltante)}.
                        </p>
                      )}
                      {min.cumple === true && <p className="mt-2 text-xs text-exito-texto">Cumple el pedido mínimo de {formatoDinero(min.minimo ?? 0)}.</p>}
                      {min.cumple === null && <p className="mt-2 text-xs text-gris-texto">Sin pedido mínimo definido para este proveedor.</p>}
                      <ul className="mt-2 divide-y divide-linea text-sm">
                        {p.items.map((it) => (
                          <li key={it.materia_prima_id} className="flex justify-between gap-2 py-1">
                            <span className="text-grafito">{it.nombre}</span>
                            <span className="whitespace-nowrap text-gris-texto">
                              {it.presentaciones.toLocaleString('es-CO', { maximumFractionDigits: 2 })} · {formatoDinero(it.valor)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-2" aria-label="Por insumo">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gris-texto">Por insumo ({visibles.length})</h2>
            {visibles.length === 0 ? <EmptyState titulo="Sin insumos" mensaje="Ningún insumo tiene ese estado." /> : (
              <ul className="flex flex-col gap-2">
                {visibles.map((i) => (
                  <FilaInsumo key={i.materia_prima_id} i={i} />
                ))}
              </ul>
            )}
          </section>

          {data.al_uso.length > 0 && (
            <section className="flex flex-col gap-2" aria-label="Se compran según la producción">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gris-texto">Se compran según la producción</h2>
              <p className="text-xs text-gris-texto">Perecederos que no se guardan: no se calcula cuándo pedirlos, se compran para lo que se va a producir.</p>
              <ul className="grid gap-2 md:grid-cols-2">
                {data.al_uso.map((i) => (
                  <li key={i.materia_prima_id} className="rounded-lg border border-linea bg-tabla p-3 text-sm">
                    <p className="font-medium text-grafito">{i.nombre}</p>
                    <p className="text-xs text-gris-texto">
                      Hay {formatoCantidad(i.existencia, i.unidad)}
                      {i.demanda_semanal !== null && ` · consumo por semana: ${formatoCantidad(i.demanda_semanal, i.unidad)}`}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
