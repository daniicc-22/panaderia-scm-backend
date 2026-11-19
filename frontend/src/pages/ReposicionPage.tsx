import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/feedback/EmptyState';
import { ErrorState } from '../components/feedback/ErrorState';
import { EsqueletoIndicadores } from '../components/feedback/Esqueleto';
import { LoadingState } from '../components/feedback/LoadingState';
import { ESTADOS, etiquetaAdvertencia, etiquetaFaltante, ORIGEN_DEMANDA } from '../features/reposicion/etiquetas';
import { formatoCantidad, formatoDinero, formatoFecha } from '../features/inventario/formatos';
import { BotonImprimir } from '../components/ui/BotonImprimir';
import { Indicador, Seccion } from '../features/inicio/Panel';
import { NavReposicion } from '../features/reposicion/NavReposicion';
import { getRecomendaciones } from '../services/reposicionService';
import type { EstadoReposicion, ItemRecomendacion } from '../types/reposicion.types';

const ORDEN_RESUMEN: EstadoReposicion[] = ['quiebre_probable', 'riesgo', 'pedir_hoy', 'pedir', 'datos_insuficientes', 'sobreinventario', 'ok'];

function textoCobertura(i: ItemRecomendacion): string {
  if (i.cobertura_dias === null) return 'sin dato de consumo';
  return `${i.cobertura_dias.toLocaleString('es-CO', { maximumFractionDigits: 1 })} días de cobertura`;
}

// Color de la barra de cobertura según el estado. El número siempre acompaña a la barra: el color no es la única señal.
const COLOR_BARRA: Record<EstadoReposicion, string> = {
  quiebre_probable: 'bg-terracota',
  pedir_hoy: 'bg-terracota',
  riesgo: 'bg-trigo',
  sobreinventario: 'bg-trigo',
  pedir: 'bg-azul-noche',
  ok: 'bg-verde-bosque',
  datos_insuficientes: 'bg-clase-c',
};
// Días de cobertura que llenan la barra completa
const DIAS_BARRA = 21;

function FilaInsumo({ i }: { i: ItemRecomendacion }) {
  const estado = ESTADOS[i.estado];
  const hayExtras = i.faltantes.length > 0 || i.advertencias.length > 0 || (i.cantidad_recomendada > 0 && (i.proveedor || i.fecha_limite_pedido));
  return (
    <li className="overflow-hidden rounded-tarjeta border border-linea bg-tabla">
      <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:gap-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-azul-noche">{i.nombre}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            {i.clase_abc && <Badge color={i.clase_abc === 'A' ? 'red' : i.clase_abc === 'B' ? 'yellow' : 'gray'}>Clase {i.clase_abc}</Badge>}
            <Badge color={estado.color}>{estado.etiqueta}</Badge>
          </p>
        </div>

        <div className="min-w-0 text-xs text-gris-texto">
          <p className="text-sm text-grafito">Hay {formatoCantidad(i.existencia, i.unidad)}</p>
          {i.cobertura_dias !== null && (
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-arena" aria-hidden="true">
              <div className={`h-full rounded-full ${COLOR_BARRA[i.estado]}`} style={{ width: `${Math.min(i.cobertura_dias / DIAS_BARRA, 1) * 100}%` }} />
            </div>
          )}
          <p className="mt-1">
            {textoCobertura(i)}
            {i.fecha_agotamiento && ` · se acaba el ${formatoFecha(i.fecha_agotamiento)}`}
          </p>
        </div>

        <div className="text-sm sm:text-right">
          {i.cantidad_recomendada > 0 ? (
            <>
              <p className="font-display text-base font-semibold text-azul-noche">
                Pedir {i.presentaciones_a_pedir?.toLocaleString('es-CO', { maximumFractionDigits: 2 })} × {i.presentacion}
              </p>
              <p className="text-xs text-gris-texto">
                {formatoCantidad(i.cantidad_recomendada, i.unidad)}
                {i.costos && ` · ${formatoDinero(i.costos.valor_pedido)}`}
              </p>
            </>
          ) : (
            <p className="text-xs text-gris-texto">No hace falta pedir por ahora</p>
          )}
        </div>
      </div>

      {hayExtras && (
        <div className="flex flex-col gap-1 border-t border-linea bg-hueso px-3 py-2 text-xs text-gris-texto">
          {i.cantidad_recomendada > 0 && (i.proveedor || i.fecha_limite_pedido) && (
            <p>
              {i.proveedor && `Proveedor: ${i.proveedor.nombre}`}
              {i.fecha_limite_pedido && ` · pedir a más tardar el ${formatoFecha(i.fecha_limite_pedido)}`}
              {i.proxima_entrega && ` · llega el ${formatoFecha(i.proxima_entrega)}`}
            </p>
          )}
          {i.faltantes.length > 0 && <p>Falta: {i.faltantes.map(etiquetaFaltante).join(', ')}.</p>}
          {i.advertencias.length > 0 && (
            <ul className="list-disc pl-4 text-atencion-texto">
              {i.advertencias.map((a) => (
                <li key={a}>{etiquetaAdvertencia(a)}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <details className="border-t border-linea px-3 py-2 text-xs text-gris-texto">
        <summary className="cursor-pointer font-medium text-pizarra">Ver cómo se calculó</summary>
        <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
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

  // Lo más urgente primero: el orden es el mismo de los filtros
  const visibles = useMemo(
    () =>
      (data?.items ?? [])
        .filter((i) => estado === null || i.estado === estado)
        .sort((a, b) => ORDEN_RESUMEN.indexOf(a.estado) - ORDEN_RESUMEN.indexOf(b.estado)),
    [data, estado],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 -mt-4 bg-pizarra px-4 py-5 text-white sm:-mx-6 sm:-mt-6 sm:px-7 sm:py-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white sm:text-[28px]">Reposición</h1>
          <p className="mt-1 text-sm text-niebla">
            Qué pedir, cuándo y cuánto{data ? ` · cálculo de hoy, ${formatoFecha(data.fecha)}` : ''}
          </p>
        </div>
        <BotonImprimir />
      </div>
      <NavReposicion />

      {isLoading && (
        <>
          <EsqueletoIndicadores />
          <LoadingState mensaje="Calculando..." />
        </>
      )}
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

          <section aria-label="Resumen" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador
              indice={0}
              tono="azul"
              etiqueta="Para pedir"
              valor={String(data.resumen.quiebre_probable + data.resumen.pedir_hoy + data.resumen.pedir)}
              numero={data.resumen.quiebre_probable + data.resumen.pedir_hoy + data.resumen.pedir}
              detalle="insumos que hay que pedir"
            />
            <Indicador
              indice={1}
              tono="amarillo"
              etiqueta="En riesgo o exceso"
              valor={String(data.resumen.riesgo + data.resumen.sobreinventario)}
              numero={data.resumen.riesgo + data.resumen.sobreinventario}
              detalle="conviene revisarlos"
            />
            <Indicador indice={2} tono="gris" etiqueta="Faltan datos" valor={String(data.resumen.datos_insuficientes)} numero={data.resumen.datos_insuficientes} detalle="no se pueden calcular" />
            <Indicador indice={3} tono="verde" etiqueta="Suficiente" valor={String(data.resumen.ok)} numero={data.resumen.ok} detalle="alcanzan hasta la próxima entrega" />
          </section>

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
            <Seccion titulo="Pedidos por proveedor">
              <ul className="grid gap-3 md:grid-cols-2">
                {data.pedidos.map((p) => {
                  const min = p.costos.pedido_minimo;
                  const avance = min.minimo ? Math.min(p.costos.total / min.minimo, 1) : null;
                  return (
                    <li key={p.proveedor.id} className="animate-entra rounded-tarjeta border border-linea bg-tabla p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-azul-noche">{p.proveedor.nombre}</p>
                          <p className="text-xs text-gris-texto">
                            {p.fecha_limite_pedido && `Pedir a más tardar el ${formatoFecha(p.fecha_limite_pedido)}`}
                            {p.proxima_entrega && ` · llega el ${formatoFecha(p.proxima_entrega)}`}
                          </p>
                        </div>
                        <p className="cifras font-display text-xl font-semibold text-azul-noche">{formatoDinero(p.costos.total)}</p>
                      </div>
                      {avance !== null && (
                        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-arena" aria-hidden="true">
                          <div className={`h-full rounded-full ${min.cumple ? 'bg-verde-bosque' : 'bg-trigo'}`} style={{ width: `${avance * 100}%` }} />
                        </div>
                      )}
                      {min.cumple === false && (
                        <p className="mt-2 rounded-md bg-atencion-fondo px-2 py-1 text-xs text-atencion-texto">
                          No llega al pedido mínimo de {formatoDinero(min.minimo ?? 0)}: faltan {formatoDinero(min.faltante)}.
                        </p>
                      )}
                      {min.cumple === true && <p className="mt-2 text-xs text-exito-texto">Cumple el pedido mínimo de {formatoDinero(min.minimo ?? 0)}.</p>}
                      {min.cumple === null && <p className="mt-2 text-xs text-gris-texto">Sin pedido mínimo definido para este proveedor.</p>}
                      <ul className="mt-2 divide-y divide-linea text-sm">
                        {p.items.map((it) => (
                          <li key={it.materia_prima_id} className="flex justify-between gap-2 py-1.5">
                            <span className="text-grafito">{it.nombre}</span>
                            <span className="cifras whitespace-nowrap text-gris-texto">
                              {it.presentaciones.toLocaleString('es-CO', { maximumFractionDigits: 2 })} · {formatoDinero(it.valor)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </Seccion>
          )}

          <section className="flex flex-col gap-3" aria-label="Por insumo">
            <h2 className="text-sm font-semibold text-azul-noche">Por insumo ({visibles.length})</h2>
            {visibles.length === 0 ? <EmptyState titulo="Sin insumos" mensaje="Ningún insumo tiene ese estado." /> : (
              <ul className="flex flex-col gap-2">
                {visibles.map((i) => (
                  <FilaInsumo key={i.materia_prima_id} i={i} />
                ))}
              </ul>
            )}
          </section>

          {data.al_uso.length > 0 && (
            <Seccion titulo="Se compran según la producción">
              <p className="-mt-1 text-xs text-gris-texto">Perecederos que no se guardan: no se calcula cuándo pedirlos, se compran para lo que se va a producir.</p>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.al_uso.map((i) => (
                  <li key={i.materia_prima_id} className="rounded-tarjeta border border-linea bg-tabla p-3 text-sm">
                    <p className="font-medium text-azul-noche">{i.nombre}</p>
                    <p className="text-xs text-gris-texto">
                      Hay {formatoCantidad(i.existencia, i.unidad)}
                      {i.demanda_semanal !== null && ` · consumo por semana: ${formatoCantidad(i.demanda_semanal, i.unidad)}`}
                    </p>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}
        </>
      )}
    </div>
  );
}
