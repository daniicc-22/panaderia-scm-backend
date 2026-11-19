import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarClock, CircleCheck, PackageOpen, ShoppingCart, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Esqueleto } from '../../components/feedback/Esqueleto';
import { getAlertasVencimiento } from '../../services/inventarioService';
import { getRecomendaciones } from '../../services/reposicionService';
import { ESTADOS } from '../reposicion/etiquetas';
import type { ClaseAbc, EstadoReposicion } from '../../types/reposicion.types';
import { cantidad, fechaCorta, pesos } from './periodos';

// Qué tan pronto hay que actuar con cada estado de reposición
const URGENCIA: Partial<Record<EstadoReposicion, number>> = { pedir_hoy: 0, quiebre_probable: 1, riesgo: 2, pedir: 3 };
const RANGO_CLASE: Record<ClaseAbc, number> = { A: 0, B: 1, C: 2 };
const rc = (c: ClaseAbc | null | undefined) => (c ? RANGO_CLASE[c] : 3);

const CHIP: Record<string, string> = {
  red: 'bg-critico-fondo text-critico-texto',
  yellow: 'bg-atencion-fondo text-atencion-texto',
  blue: 'bg-info-fondo text-azul-noche',
  green: 'bg-exito-fondo text-exito-texto',
  gray: 'bg-arena text-grafito',
};
// Color de la barra de cobertura según el estado
const BARRA: Record<string, string> = {
  red: 'bg-critico',
  yellow: 'bg-trigo',
  blue: 'bg-pizarra',
  green: 'bg-verde-bosque',
  gray: 'bg-grafico-neutro',
};
const COLOR_CLASE: Record<ClaseAbc, string> = {
  A: 'bg-azul-noche text-white',
  B: 'bg-trigo text-grafito',
  C: 'bg-clase-c text-grafito',
};
const MAX = 5;
// Días de cobertura que llenan la barra completa
const DIAS_BARRA = 7;

const venceTexto = (d: number) => (d <= 0 ? 'vence hoy' : d === 1 ? 'vence mañana' : `vence en ${d} días`);

function Clase({ c, grande = false }: { c: ClaseAbc | null | undefined; grande?: boolean }) {
  if (!c) return <span aria-hidden="true" className={grande ? 'size-9 shrink-0' : 'size-5 shrink-0'} />;
  const medida = grande ? 'size-9 text-base' : 'size-5 text-[11px]';
  return (
    <span title={`Clase ${c}`} className={`grid shrink-0 place-items-center rounded-lg font-bold ${medida} ${COLOR_CLASE[c]}`}>
      <span className="sr-only">Clase </span>
      {c}
    </span>
  );
}

function Cobertura({ dias, color }: { dias: number; color: string }) {
  const pct = Math.max(4, Math.min(100, (dias / DIAS_BARRA) * 100));
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-gris-texto">
      <div aria-hidden="true" className="h-1.5 w-28 overflow-hidden rounded-full bg-arena">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span>{dias <= 0 ? 'Sin cobertura' : `Alcanza ${cantidad(dias)} días`}</span>
    </div>
  );
}

interface TarjetaProps {
  acento: string;
  tinte: string;
  icono: LucideIcon;
  titulo: string;
  subtitulo: string;
  cifra?: string;
  cifraEtiqueta?: string;
  retraso?: number;
  children: ReactNode;
}

// Marco común de las dos decisiones: filete de color, ícono, título y la cifra que importa
function Tarjeta({ acento, tinte, icono: Icono, titulo, subtitulo, cifra, cifraEtiqueta, retraso = 0, children }: TarjetaProps) {
  return (
    <div style={{ animationDelay: `${retraso}ms` }} className="flex animate-entra flex-col overflow-hidden rounded-tarjeta border border-linea bg-tabla">
      <div aria-hidden="true" className={`h-1 ${acento}`} />
      <div className="flex flex-wrap items-center gap-3 px-4 pt-4 sm:px-5">
        <span aria-hidden="true" className={`grid size-11 shrink-0 place-items-center rounded-lg ${tinte}`}>
          <Icono size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-semibold leading-tight text-azul-noche">{titulo}</h3>
          <p className="text-xs text-gris-texto sm:text-sm">{subtitulo}</p>
        </div>
        {cifra && (
          <div className="text-right">
            <p className="cifras font-display text-2xl font-semibold leading-none text-azul-noche">{cifra}</p>
            {cifraEtiqueta && <p className="mt-1 text-xs text-gris-texto">{cifraEtiqueta}</p>}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3 sm:px-5">{children}</div>
    </div>
  );
}

function Pie({ resto, enlace, accion }: { resto: string; enlace: string; accion: string }) {
  return (
    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-linea pt-3">
      <span className="text-sm text-gris-texto">{resto}</span>
      <Link
        to={enlace}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-azul-noche/25 px-4 text-sm font-semibold text-azul-noche transition-colors hover:bg-azul-noche hover:text-white"
      >
        {accion}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  );
}

function Vacio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
      <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-exito-fondo text-exito-texto">
        <CircleCheck size={26} />
      </span>
      <p className="font-semibold text-azul-noche">{titulo}</p>
      <p className="max-w-xs text-sm text-gris-texto">{texto}</p>
    </div>
  );
}

function Cargando() {
  return (
    <div className="flex flex-col gap-3 py-1" role="status" aria-label="Cargando">
      <Esqueleto className="h-14" />
      <Esqueleto className="h-14" />
      <Esqueleto className="h-14" />
    </div>
  );
}

// Las dos decisiones del día para el administrador: qué comprar y qué lotes gastar primero
export function DecisionesHoy() {
  const rec = useQuery({ queryKey: ['reposicion', 'recomendaciones'], queryFn: getRecomendaciones });
  const alertas = useQuery({ queryKey: ['inventario', 'alertas'], queryFn: getAlertasVencimiento });

  const claseDe = new Map<string, ClaseAbc | null>();
  for (const i of rec.data?.items ?? []) claseDe.set(i.materia_prima_id, i.clase_abc);
  for (const i of rec.data?.al_uso ?? []) claseDe.set(i.materia_prima_id, i.clase_abc);

  const compras = (rec.data?.items ?? [])
    .filter((i) => URGENCIA[i.estado] !== undefined && i.cantidad_recomendada > 0)
    .sort(
      (a, b) =>
        (URGENCIA[a.estado] ?? 9) - (URGENCIA[b.estado] ?? 9) ||
        rc(a.clase_abc) - rc(b.clase_abc) ||
        (b.costos?.valor_pedido ?? 0) - (a.costos?.valor_pedido ?? 0),
    );
  const totalCompras = compras.reduce((s, i) => s + (i.costos?.valor_pedido ?? 0), 0);
  // Cuántos insumos hay en cada estado (la lista solo muestra los primeros)
  const porEstado = new Map<EstadoReposicion, number>();
  for (const i of compras) porEstado.set(i.estado, (porEstado.get(i.estado) ?? 0) + 1);

  const usar = (alertas.data?.items ?? [])
    .filter((i) => i.estado === 'por_vencer')
    .sort((a, b) => a.dias - b.dias || (b.valor ?? 0) - (a.valor ?? 0));
  const totalUsar = usar.reduce((s, i) => s + (i.valor ?? 0), 0);

  return (
    <section aria-label="Decisiones de hoy" className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-azul-noche">Decisiones de hoy</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- Qué comprar */}
        <Tarjeta
          acento="bg-verde-bosque"
          tinte="bg-verde-suave text-verde-bosque"
          icono={ShoppingCart}
          titulo="Qué comprar"
          subtitulo="Lo más urgente primero; a igual urgencia, los clase A"
          cifra={totalCompras > 0 ? pesos.format(totalCompras) : undefined}
          cifraEtiqueta={compras.length > 0 ? `en ${compras.length} insumos` : undefined}
        >
          {rec.isError ? (
            <p className="text-sm text-critico-texto">No se pudieron cargar las compras sugeridas.</p>
          ) : !rec.data ? (
            <Cargando />
          ) : compras.length === 0 ? (
            <>
              <Vacio titulo="Nada que comprar por ahora" texto="Lo que hay en bodega alcanza hasta la próxima entrega de tus proveedores." />
              <Pie resto="" enlace="/reposicion" accion="Ver reposición" />
            </>
          ) : (
            <>
              <div className="mb-1 flex flex-wrap gap-1.5">
                {[...porEstado.entries()].map(([estado, n]) => (
                  <span key={estado} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${CHIP[ESTADOS[estado].color]}`}>
                    {ESTADOS[estado].etiqueta} · {n}
                  </span>
                ))}
              </div>
              <ul className="flex flex-col divide-y divide-linea">
                {compras.slice(0, MAX).map((i) => {
                  const e = ESTADOS[i.estado];
                  const cuanto =
                    i.presentaciones_a_pedir && i.presentacion
                      ? `${i.presentaciones_a_pedir} × ${i.presentacion}`
                      : `${cantidad(i.cantidad_recomendada)} ${i.unidad}`;
                  return (
                    <li key={i.materia_prima_id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 py-3">
                      <Clase c={i.clase_abc} grande />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-semibold text-grafito">{i.nombre}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP[e.color]}`}>{e.etiqueta}</span>
                        </p>
                        <p className="mt-0.5 text-sm text-grafito">
                          Pedir <strong className="font-semibold">{cuanto}</strong>
                          {i.proveedor && <span className="text-gris-texto"> · {i.proveedor.nombre}</span>}
                        </p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gris-texto">
                          {i.fecha_limite_pedido && (
                            <span className="inline-flex items-center gap-1">
                              <CalendarClock size={14} aria-hidden="true" />
                              Pedir antes del {fechaCorta(i.fecha_limite_pedido)}
                            </span>
                          )}
                          {i.proxima_entrega && (
                            <span className="inline-flex items-center gap-1">
                              <Truck size={14} aria-hidden="true" />
                              Llega el {fechaCorta(i.proxima_entrega)}
                            </span>
                          )}
                        </p>
                        {i.cobertura_dias != null && <Cobertura dias={i.cobertura_dias} color={BARRA[e.color]} />}
                      </div>
                      {i.costos && <span className="cifras text-base font-semibold text-grafito">{pesos.format(i.costos.valor_pedido)}</span>}
                    </li>
                  );
                })}
              </ul>
              <Pie resto={compras.length > MAX ? `y ${compras.length - MAX} insumos más` : ''} enlace="/reposicion" accion="Ver pedidos por proveedor" />
            </>
          )}
        </Tarjeta>

        {/* ---- Qué usar primero */}
        <Tarjeta
          acento="bg-trigo"
          tinte="bg-trigo-suave text-atencion-texto"
          icono={PackageOpen}
          titulo="Qué usar primero"
          subtitulo="Lotes que vencen pronto: gástalos antes en la producción (PEPS)"
          cifra={totalUsar > 0 ? pesos.format(totalUsar) : undefined}
          cifraEtiqueta={usar.length > 0 ? `en ${usar.length} ${usar.length === 1 ? 'lote' : 'lotes'}` : undefined}
          retraso={70}
        >
          {alertas.isError ? (
            <p className="text-sm text-critico-texto">No se pudieron cargar los vencimientos.</p>
          ) : !alertas.data ? (
            <Cargando />
          ) : usar.length === 0 ? (
            <>
              <Vacio titulo={`Ningún lote vence en ${alertas.data.dias_alerta} días`} texto="No hay nada que gastar con prisa: la rotación de lotes va al día." />
              <Pie resto="" enlace="/inventario" accion="Ver inventario" />
            </>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-linea">
                {usar.slice(0, MAX).map((i) => {
                  const urgente = i.dias <= 2;
                  return (
                    <li key={i.lote_id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
                      <div
                        aria-hidden="true"
                        className={`flex size-14 shrink-0 flex-col items-center justify-center rounded-lg ${urgente ? 'bg-critico text-white' : 'bg-trigo text-azul-noche'}`}
                      >
                        <span className="cifras text-xl font-bold leading-none">{i.dias <= 0 ? 'Hoy' : i.dias}</span>
                        {i.dias > 0 && <span className="text-[11px] font-semibold">{i.dias === 1 ? 'día' : 'días'}</span>}
                      </div>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Clase c={claseDe.get(i.materia_prima_id)} />
                          <span className="font-semibold text-grafito">{i.nombre}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${urgente ? CHIP.red : CHIP.yellow}`}>{venceTexto(i.dias)}</span>
                        </p>
                        <p className="mt-0.5 text-sm text-grafito">
                          <strong className="font-semibold">
                            {cantidad(i.cantidad_disponible)} {i.unidad}
                          </strong>
                          {i.codigo_lote && <span className="text-gris-texto"> · lote {i.codigo_lote}</span>}
                        </p>
                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-gris-texto">
                          <CalendarClock size={14} aria-hidden="true" />
                          Vence el {fechaCorta(i.fecha_vencimiento)}
                        </p>
                      </div>
                      {i.valor != null && <span className="cifras text-base font-semibold text-grafito">{pesos.format(i.valor)}</span>}
                    </li>
                  );
                })}
              </ul>
              <Pie resto={usar.length > MAX ? `y ${usar.length - MAX} lotes más` : ''} enlace="/inventario" accion="Ver inventario" />
            </>
          )}
        </Tarjeta>
      </div>
    </section>
  );
}
