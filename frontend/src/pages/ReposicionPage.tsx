import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Printer } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/feedback/EmptyState';
import { ErrorState } from '../components/feedback/ErrorState';
import { EsqueletoIndicadores } from '../components/feedback/Esqueleto';
import { LoadingState } from '../components/feedback/LoadingState';
import { ESTADOS, etiquetaAdvertencia, etiquetaFaltante, ORIGEN_DEMANDA } from '../features/reposicion/etiquetas';
import { diasHasta, formatoCantidad, formatoDinero, formatoFecha } from '../features/inventario/formatos';
import { BotonImprimir } from '../components/ui/BotonImprimir';
import { PageHeader } from '../components/layout/PageHeader';
import { useAuth } from '../features/auth/useAuth';
import { getMiPanaderia } from '../services/panaderiaService';
import { Indicador, Seccion } from '../features/inicio/Panel';
import { NavReposicion } from '../features/reposicion/NavReposicion';
import { getRecomendaciones } from '../services/reposicionService';
import type { EstadoReposicion, ItemRecomendacion, PedidoProveedor } from '../types/reposicion.types';

const INICIAL = 12;
const RANGO_CLASE = (c: string | null) => (c === 'A' ? 0 : c === 'B' ? 1 : c === 'C' ? 2 : 3);
const ORDEN_RESUMEN: EstadoReposicion[] = ['quiebre_probable', 'riesgo', 'pedir_hoy', 'pedir', 'datos_insuficientes', 'sobreinventario', 'ok'];

// 'AAAA-MM-DD' → '20 nov', corto para que no se parta en varias líneas
function fechaCorta(f: string): string {
  const [a, m, d] = f.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

function textoCobertura(i: ItemRecomendacion): string {
  if (i.existencia <= 0) return 'Agotado';
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

function FilaInsumo({ i, soloImpresion, variosProveedores }: { i: ItemRecomendacion; soloImpresion?: boolean; variosProveedores: boolean }) {
  const estado = ESTADOS[i.estado];
  const hayExtras = i.faltantes.length > 0 || i.advertencias.length > 0 || (i.cantidad_recomendada > 0 && variosProveedores && i.proveedor);
  return (
    <li className={`overflow-hidden rounded-tarjeta border border-linea bg-tabla ${soloImpresion ? 'hidden print:block' : ''}`}>
      <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:gap-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-azul-noche">{i.nombre}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            {i.clase_abc && <Badge color={i.clase_abc === 'A' ? 'red' : i.clase_abc === 'B' ? 'yellow' : 'gray'}>Clase {i.clase_abc}</Badge>}
            <Badge color={estado.color}>{estado.etiqueta}</Badge>
          </p>
        </div>

        <div className="min-w-0 text-xs text-gris-texto">
          <p className={`text-sm ${i.existencia <= 0 ? 'font-semibold text-critico-texto' : 'text-grafito'}`}>{i.existencia <= 0 ? 'Sin existencias' : `Hay ${formatoCantidad(i.existencia, i.unidad)}`}</p>
          {i.cobertura_dias !== null && (
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-arena" aria-hidden="true">
              <div className={`h-full rounded-full ${COLOR_BARRA[i.estado]}`} style={{ width: `${Math.min(i.cobertura_dias / DIAS_BARRA, 1) * 100}%` }} />
            </div>
          )}
          <p className="mt-1">
            {textoCobertura(i)}
            {i.fecha_agotamiento && i.existencia > 0 && ` · se acaba el ${fechaCorta(i.fecha_agotamiento)}`}
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
          {i.cantidad_recomendada > 0 && variosProveedores && i.proveedor && <p>Proveedor: {i.proveedor.nombre}</p>}
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


const MAX_PEDIDO = 6;

// Un pedido por proveedor: lo más caro primero, con la fecha límite y un botón para copiarlo (se manda por WhatsApp o se lee por teléfono)
function TarjetaPedido({ p, hoy, items, unico }: { p: PedidoProveedor; hoy: string; items: ItemRecomendacion[]; unico: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const min = p.costos.pedido_minimo;
  const avance = min.minimo ? Math.min(p.costos.total / min.minimo, 1) : null;
  const detalle = new Map(items.map((x) => [x.materia_prima_id, x]));
  const lineas = [...p.items].sort((a, b) => b.valor - a.valor);
  const dias = p.fecha_limite_pedido ? diasHasta(hoy, p.fecha_limite_pedido) : null;
  const urgencia = dias === null ? null : dias <= 0 ? 'Pedir hoy' : dias === 1 ? 'Pedir mañana' : `Pedir en ${dias} días`;
  const texto = (it: PedidoProveedor['items'][number]) => {
    const d = detalle.get(it.materia_prima_id);
    return d?.presentacion ? `${it.presentaciones.toLocaleString('es-CO', { maximumFractionDigits: 2 })} × ${d.presentacion}` : `${it.presentaciones.toLocaleString('es-CO', { maximumFractionDigits: 2 })}`;
  };

  async function copiar() {
    const cuerpo = [
      `Pedido para ${p.proveedor.nombre}`,
      p.proxima_entrega ? `Entrega esperada: ${formatoFecha(p.proxima_entrega)}` : '',
      '',
      ...lineas.map((it) => `- ${it.nombre}: ${texto(it)}`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(cuerpo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sin permiso del navegador para copiar: no se hace nada
    }
  }

  return (
    <li className={`animate-entra rounded-tarjeta border border-linea bg-tabla p-4 ${unico ? 'md:col-span-2' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-azul-noche">{p.proveedor.nombre}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gris-texto">
            {urgencia && <Badge color={dias !== null && dias <= 1 ? 'red' : 'yellow'}>{urgencia}</Badge>}
            {p.fecha_limite_pedido && <span>a más tardar el {formatoFecha(p.fecha_limite_pedido)}</span>}
            {p.proxima_entrega && <span>· llega el {formatoFecha(p.proxima_entrega)}</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="cifras font-display text-xl font-semibold text-azul-noche">{formatoDinero(p.costos.total)}</p>
          <p className="text-xs text-gris-texto">{p.items.length} {p.items.length === 1 ? 'insumo' : 'insumos'}</p>
        </div>
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

      <ul className={`mt-2 grid gap-x-8 divide-y divide-linea text-sm ${unico ? 'md:grid-cols-2' : ''}`}>
        {lineas.map((it) => {
          const oculto = !abierto && lineas.indexOf(it) >= MAX_PEDIDO;
          return (
            <li key={it.materia_prima_id} className={`flex justify-between gap-3 py-1.5 ${oculto ? 'hidden print:flex' : ''}`}>
              <span className="min-w-0 text-grafito">{it.nombre}</span>
              <span className="cifras whitespace-nowrap text-gris-texto">
                {texto(it)} · {formatoDinero(it.valor)}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-3 print:hidden">
        {lineas.length > MAX_PEDIDO && (
          <button type="button" onClick={() => setAbierto((v) => !v)} className="min-h-11 text-sm font-semibold text-pizarra hover:underline">
            {abierto ? 'Ver menos' : `Ver los ${lineas.length} insumos del pedido`}
          </button>
        )}
        <Link
          to={`/reposicion/pedido/${p.proveedor.id}`}
          className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-md border border-borde-campo bg-white px-3 text-sm font-semibold text-azul-noche hover:bg-arena"
        >
          <Printer size={16} aria-hidden="true" />
          Orden para imprimir
        </Link>
        <button
          type="button"
          onClick={copiar}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-borde-campo bg-white px-3 text-sm font-semibold text-azul-noche hover:bg-arena"
        >
          {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copiado ? 'Pedido copiado' : 'Copiar pedido'}
        </button>
      </div>
      <span className="sr-only" aria-live="polite">{copiado ? 'Pedido copiado' : ''}</span>
    </li>
  );
}

export function ReposicionPage() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['reposicion', 'recomendaciones'], queryFn: getRecomendaciones });
  const [estado, setEstado] = useState<EstadoReposicion | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const { usuario } = useAuth();
  const panaderia = useQuery({ queryKey: ['mi-panaderia', usuario?.id], queryFn: getMiPanaderia, enabled: !!usuario, staleTime: 5 * 60 * 1000 });

  // Lo más urgente primero: el orden es el mismo de los filtros
  const visibles = useMemo(
    () =>
      (data?.items ?? [])
        .filter((i) => estado === null || i.estado === estado)
        .sort(
          (a, b) =>
            ORDEN_RESUMEN.indexOf(a.estado) - ORDEN_RESUMEN.indexOf(b.estado) ||
            RANGO_CLASE(a.clase_abc) - RANGO_CLASE(b.clase_abc) ||
            (a.cobertura_dias ?? Infinity) - (b.cobertura_dias ?? Infinity) ||
            a.nombre.localeCompare(b.nombre, 'es'),
        ),
    [data, estado],
  );

  return (
    <div className="ficha-impresion flex flex-col gap-4">
      <div className="hidden print:block">
        <p className="text-xs font-semibold uppercase tracking-wider text-gris-texto">{panaderia.data?.nombre ?? ''}</p>
        <h1 className="font-display text-2xl font-semibold text-azul-noche">Reposición: qué pedir</h1>
        <p className="mt-1 text-sm text-gris-texto">{data ? `Cálculo del ${formatoFecha(data.fecha)}` : ''}</p>
      </div>
      <PageHeader
        ocultarAlImprimir
        titulo="Reposición"
        subtitulo={`Qué pedir, cuándo y cuánto${data ? ` · cálculo de hoy, ${formatoFecha(data.fecha)}` : ''}`}
        acciones={data && <BotonImprimir etiqueta="Imprimir pedidos" />}
      />
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

          <section aria-label="Resumen" className="kpis grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador
              indice={0}
              tono="azul"
              etiqueta="Para pedir"
              valor={String(data.resumen.quiebre_probable + data.resumen.pedir_hoy + data.resumen.pedir)}
              numero={data.resumen.quiebre_probable + data.resumen.pedir_hoy + data.resumen.pedir}
              detalle={data.pedidos.length > 0 ? `${data.pedidos.length} ${data.pedidos.length === 1 ? 'proveedor' : 'proveedores'} · ${formatoDinero(data.pedidos.reduce((t, p) => t + p.costos.total, 0))}` : 'insumos que hay que pedir'}
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

          {data.pedidos.length > 0 && (
            <Seccion titulo="Pedidos por proveedor">
              <ul className="grid gap-3 md:grid-cols-2">
                {[...data.pedidos]
                  .sort((x, y) => (x.fecha_limite_pedido ?? '9999').localeCompare(y.fecha_limite_pedido ?? '9999'))
                  .map((p) => (
                    <TarjetaPedido key={p.proveedor.id} p={p} hoy={data.fecha} items={data.items} unico={data.pedidos.length === 1} />
                  ))}
              </ul>
            </Seccion>
          )}

          <section className="flex flex-col gap-3" aria-label="Por insumo">
            <h2 className="font-display text-lg font-semibold text-azul-noche">Por insumo ({visibles.length})</h2>
          <div className="flex flex-wrap gap-2 print:hidden" role="group" aria-label="Filtrar por estado">
            {([null, ...ORDEN_RESUMEN.filter((e) => data.resumen[e] > 0)] as (EstadoReposicion | null)[]).map((e) => (
              <button
                key={e ?? 'todos'}
                type="button"
                aria-pressed={estado === e}
                onClick={() => { setEstado(estado === e ? null : e); setVerTodos(false); }}
                className={`inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition-colors ${estado === e ? 'border-azul-noche bg-azul-noche text-white' : 'border-borde-campo bg-white text-azul-noche hover:bg-arena'}`}
              >
                {e === null ? 'Todos' : ESTADOS[e].etiqueta}
                <span className="cifras text-xs opacity-80">{e === null ? data.items.length : data.resumen[e]}</span>
              </button>
            ))}
          </div>

            {visibles.length === 0 ? <EmptyState titulo="Sin insumos" mensaje="Ningún insumo tiene ese estado." /> : (
              <ul className="flex flex-col gap-2">
                {visibles.map((i, n) => (
                  <FilaInsumo key={i.materia_prima_id} i={i} soloImpresion={!verTodos && n >= INICIAL} variosProveedores={data.pedidos.length > 1} />
                ))}
              </ul>
            )}
            {visibles.length > INICIAL && (
              <button type="button" onClick={() => setVerTodos((v) => !v)} className="min-h-11 w-fit text-sm font-semibold text-pizarra hover:underline print:hidden">
                {verTodos ? 'Ver menos' : `Ver los ${visibles.length} insumos`}
              </button>
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
