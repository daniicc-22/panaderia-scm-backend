import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PackageOpen, ShoppingCart } from 'lucide-react';
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
const COLOR_CLASE: Record<ClaseAbc, string> = {
  A: 'bg-azul-noche text-white',
  B: 'bg-trigo text-grafito',
  C: 'bg-clase-c text-grafito',
};
const MAX = 6;

function Clase({ c }: { c: ClaseAbc | null | undefined }) {
  if (!c) return null;
  return <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-xs text-[11px] font-bold ${COLOR_CLASE[c]}`}>{c}</span>;
}

const venceTexto = (d: number) => (d <= 0 ? 'vence hoy' : d === 1 ? 'vence mañana' : `vence en ${d} días`);

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

  const usar = (alertas.data?.items ?? [])
    .filter((i) => i.estado === 'por_vencer')
    .sort((a, b) => a.dias - b.dias || (b.valor ?? 0) - (a.valor ?? 0));
  const totalUsar = usar.reduce((s, i) => s + (i.valor ?? 0), 0);

  return (
    <section aria-label="Decisiones de hoy" className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-azul-noche">Decisiones de hoy</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {/* ---- Qué comprar */}
        <div className="animate-entra overflow-hidden rounded-tarjeta border border-linea bg-tabla">
          <div className="flex items-center gap-3 bg-verde-bosque px-4 py-3 text-white">
            <ShoppingCart size={20} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-semibold">Qué comprar</h3>
              <p className="text-xs text-white/80">Lo más urgente primero; dentro de cada urgencia, los clase A</p>
            </div>
            {totalCompras > 0 && <span className="cifras text-sm font-semibold">{pesos.format(totalCompras)}</span>}
          </div>
          <div className="p-4">
            {rec.isError ? (
              <p className="text-sm text-critico-texto">No se pudieron cargar las compras sugeridas.</p>
            ) : !rec.data ? (
              <p className="text-sm text-gris-texto">Cargando…</p>
            ) : compras.length === 0 ? (
              <p className="text-sm text-gris-texto">No hay que comprar nada por ahora: lo que hay alcanza hasta la próxima entrega.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-linea">
                {compras.slice(0, MAX).map((i) => {
                  const e = ESTADOS[i.estado];
                  const cuanto =
                    i.presentaciones_a_pedir && i.presentacion
                      ? `${i.presentaciones_a_pedir} × ${i.presentacion}`
                      : `${cantidad(i.cantidad_recomendada)} ${i.unidad}`;
                  return (
                    <li key={i.materia_prima_id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm">
                          <Clase c={i.clase_abc} />
                          <span className="font-semibold text-grafito">{i.nombre}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CHIP[e.color]}`}>{e.etiqueta}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-gris-texto">
                          Pedir {cuanto}
                          {i.proveedor && <> a <span className="font-medium text-grafito">{i.proveedor.nombre}</span></>}
                          {i.fecha_limite_pedido && <> · a más tardar el {fechaCorta(i.fecha_limite_pedido)}</>}
                          {i.proxima_entrega && <> · llega el {fechaCorta(i.proxima_entrega)}</>}
                          {i.cobertura_dias != null && <> · lo que hay alcanza {cantidad(i.cobertura_dias)} días</>}
                        </p>
                      </div>
                      {i.costos && <span className="cifras text-sm font-semibold text-grafito">{pesos.format(i.costos.valor_pedido)}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-gris-texto">{compras.length > MAX ? `y ${compras.length - MAX} insumos más` : ''}</span>
              <Link to="/reposicion" className="font-semibold text-pizarra hover:underline">
                Ver pedidos por proveedor →
              </Link>
            </div>
          </div>
        </div>

        {/* ---- Qué usar primero */}
        <div className="animate-entra overflow-hidden rounded-tarjeta border border-linea bg-tabla" style={{ animationDelay: '70ms' }}>
          <div className="flex items-center gap-3 bg-trigo px-4 py-3 text-grafito">
            <PackageOpen size={20} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-semibold">Qué usar primero</h3>
              <p className="text-xs text-[#4a3509]">Lotes que vencen pronto: gástalos antes en la producción (PEPS)</p>
            </div>
            {totalUsar > 0 && <span className="cifras text-sm font-semibold">{pesos.format(totalUsar)}</span>}
          </div>
          <div className="p-4">
            {alertas.isError ? (
              <p className="text-sm text-critico-texto">No se pudieron cargar los vencimientos.</p>
            ) : !alertas.data ? (
              <p className="text-sm text-gris-texto">Cargando…</p>
            ) : usar.length === 0 ? (
              <p className="text-sm text-gris-texto">
                Ningún lote vence en los próximos {alertas.data.dias_alerta} días.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-linea">
                {usar.slice(0, MAX).map((i) => (
                  <li key={i.lote_id} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm">
                        <Clase c={claseDe.get(i.materia_prima_id)} />
                        <span className="font-semibold text-grafito">{i.nombre}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${i.dias <= 2 ? CHIP.red : CHIP.yellow}`}>
                          {venceTexto(i.dias)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-gris-texto">
                        {cantidad(i.cantidad_disponible)} {i.unidad}
                        {i.codigo_lote && <> · lote {i.codigo_lote}</>} · {fechaCorta(i.fecha_vencimiento)}
                      </p>
                    </div>
                    {i.valor != null && <span className="cifras text-sm font-semibold text-grafito">{pesos.format(i.valor)}</span>}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-gris-texto">{usar.length > MAX ? `y ${usar.length - MAX} lotes más` : ''}</span>
              <Link to="/inventario" className="font-semibold text-pizarra hover:underline">
                Ver inventario →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
