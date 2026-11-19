import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatoCantidadPlan, formatoDinero } from '../../inventario/formatos';
import { costoEoq, costoPolitica, costosEn, marcas, puntosCurva, rangoCurva, techoNice, type ItemConEoq } from './eoqCalculos';

const W_ANCHO = 960;
const M = { l: 64, r: 16, t: 14, b: 40 };
// Colores de la paleta categórica del Inicio (ranuras 1 a 3); cada curva también se rotula, no depende solo del color
export const COLOR_TOTAL = '#22374A';
export const COLOR_PEDIR = '#A85C3E';
export const COLOR_GUARDAR = '#4A7A5A';
const TINTA = '#2A2D30';
const TEXTO = '#5A6066';
const REJILLA = '#E3DCCF';

const compacto = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', notation: 'compact', maximumFractionDigits: 1 });

// Curva en U del EOQ: el costo de pedir baja y el de guardar sube a medida que el pedido crece; el total tiene un mínimo.
export function CurvaCostos({ item }: { item: ItemConEoq }) {
  const idClip = useId();
  const [hoverQ, setHoverQ] = useState<number | null>(null);
  // El gráfico se dibuja al ancho real de la pantalla: así los textos conservan su tamaño en el celular
  const caja = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(W_ANCHO);
  useEffect(() => {
    const el = caja.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const medir = () => setW(Math.round(Math.min(Math.max(el.clientWidth || W_ANCHO, 300), W_ANCHO)));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const H = W < 480 ? 280 : W < 720 ? 320 : 360;

  const puntos = useMemo(() => puntosCurva(item), [item]);
  const { lo, hi } = rangoCurva(item);
  const minimo = costoEoq(item);
  const yMax = techoNice(minimo * 2.4);
  const qp = item.modelo.cantidad_politica;
  const costoPol = costoPolitica(item);
  const u = item.unidad;

  const x = (q: number) => M.l + ((q - lo) / (hi - lo)) * (W - M.l - M.r);
  const y = (c: number) => H - M.b - (Math.min(c, yMax * 1.3) / yMax) * (H - M.t - M.b);
  const trazo = (campo: 'total' | 'pedir' | 'mantener') =>
    puntos.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.q).toFixed(1)},${y(p[campo]).toFixed(1)}`).join(' ');

  const marcasX = marcas(hi, 4).filter((v) => v >= lo);
  const marcasY = marcas(yMax, 4);

  const hover = hoverQ === null ? null : costosEn(item.modelo, hoverQ);

  function alMover(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (px < M.l || px > W - M.r) return setHoverQ(null);
    setHoverQ(lo + ((px - M.l) / (W - M.l - M.r)) * (hi - lo));
  }

  // Si las dos cantidades quedan casi juntas, la segunda etiqueta va debajo para que no se pisen
  const juntas = qp !== null && Math.abs(x(qp) - x(item.eoq)) < 120;
  // Cada etiqueta se abre hacia su lado: la del EOQ hacia afuera de la otra marca
  const eoqADerecha = qp === null || x(item.eoq) >= x(qp);

  return (
    <div className="relative">
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-grafito" aria-label="Leyenda">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5" style={{ background: COLOR_TOTAL, height: 3 }} aria-hidden="true" />
          Costo total
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block w-5" style={{ background: COLOR_PEDIR, height: 2 }} aria-hidden="true" />
          Costo de hacer pedidos
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block w-5" style={{ background: COLOR_GUARDAR, height: 2 }} aria-hidden="true" />
          Costo de guardar
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR_TOTAL, boxShadow: '0 0 0 2px #fff' }} aria-hidden="true" />
          EOQ (mínimo teórico)
        </li>
        {qp !== null && (
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rotate-45 border-2 bg-tabla" style={{ borderColor: TINTA }} aria-hidden="true" />
            Con el calendario del proveedor
          </li>
        )}
      </ul>

      <div ref={caja}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={`Curva de costo anual de pedir y guardar ${item.nombre} según el tamaño del pedido. El mínimo es ${formatoDinero(minimo)} al año pidiendo ${formatoCantidadPlan(item.eoq, u)}.`}
        onPointerMove={alMover}
        onPointerDown={alMover}
        onPointerLeave={() => setHoverQ(null)}
      >
        <defs>
          <clipPath id={idClip}>
            <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} />
          </clipPath>
        </defs>

        {marcasY.map((v) => (
          <g key={`y${v}`}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke={REJILLA} strokeWidth={1} />
            <text x={M.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill={TEXTO}>
              {v === 0 ? '$0' : compacto.format(v)}
            </text>
          </g>
        ))}
        {marcasX.map((v) => (
          <text key={`x${v}`} x={x(v)} y={H - M.b + 16} textAnchor="middle" fontSize={11} fill={TEXTO}>
            {formatoCantidadPlan(v, u)}
          </text>
        ))}
        <text x={(M.l + W - M.r) / 2} y={H - 6} textAnchor="middle" fontSize={11} fill={TEXTO}>
          Cantidad de cada pedido
        </text>
        <text transform={`translate(12 ${(M.t + H - M.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill={TEXTO}>
          Costo al año
        </text>

        {/* Franja entre el EOQ y la cantidad con calendario: lo que cuesta ajustarse al proveedor */}
        {qp !== null && costoPol !== null && Math.abs(x(qp) - x(item.eoq)) > 2 && (
          <rect
            x={Math.min(x(qp), x(item.eoq))}
            y={M.t}
            width={Math.abs(x(qp) - x(item.eoq))}
            height={H - M.t - M.b}
            fill="#E2AE45"
            opacity={0.16}
            aria-hidden="true"
          />
        )}

        <g clipPath={`url(#${idClip})`}>
          <path d={trazo('pedir')} fill="none" stroke={COLOR_PEDIR} strokeWidth={2} strokeLinecap="round" />
          <path d={trazo('mantener')} fill="none" stroke={COLOR_GUARDAR} strokeWidth={2} strokeLinecap="round" />
          <path d={trazo('total')} fill="none" stroke={COLOR_TOTAL} strokeWidth={3} strokeLinecap="round" />
        </g>

        {/* EOQ: punto más bajo de la curva total */}
        <line x1={x(item.eoq)} x2={x(item.eoq)} y1={juntas ? M.t : y(minimo)} y2={H - M.b} stroke={COLOR_TOTAL} strokeWidth={1} strokeDasharray="3 3" />
        <circle cx={x(item.eoq)} cy={y(minimo)} r={5.5} fill={COLOR_TOTAL} stroke="#fff" strokeWidth={2} />
        <text
          x={juntas ? x(item.eoq) + (eoqADerecha ? 8 : -8) : x(item.eoq)}
          y={juntas ? M.t + 16 : y(minimo) - 12}
          textAnchor={juntas ? (eoqADerecha ? 'start' : 'end') : 'middle'}
          fontSize={12}
          fontWeight={600}
          fill={TINTA}
          stroke="#F7F4EE"
          strokeWidth={4}
          paintOrder="stroke"
        >
          EOQ
        </text>

        {/* Lo que recomienda el sistema con el calendario del proveedor */}
        {qp !== null && costoPol !== null && (
          <g>
            <line x1={x(qp)} x2={x(qp)} y1={juntas ? M.t : y(costoPol)} y2={H - M.b} stroke={TINTA} strokeWidth={1} strokeDasharray="3 3" />
            <rect x={x(qp) - 5} y={y(costoPol) - 5} width={10} height={10} transform={`rotate(45 ${x(qp)} ${y(costoPol)})`} fill="#fff" stroke={TINTA} strokeWidth={2} />
            <text
              x={juntas ? x(qp) + (eoqADerecha ? -8 : 8) : x(qp)}
              y={juntas ? M.t + 16 : y(costoPol) - 12}
              textAnchor={juntas ? (eoqADerecha ? 'end' : 'start') : 'middle'}
              fontSize={12}
              fontWeight={600}
              fill={TINTA}
              stroke="#F7F4EE"
              strokeWidth={4}
              paintOrder="stroke"
            >
              Con calendario
            </text>
          </g>
        )}

        {hover && (
          <g pointerEvents="none">
            <line x1={x(hover.q)} x2={x(hover.q)} y1={M.t} y2={H - M.b} stroke={TEXTO} strokeWidth={1} />
            {(
              [
                ['total', COLOR_TOTAL],
                ['pedir', COLOR_PEDIR],
                ['mantener', COLOR_GUARDAR],
              ] as const
            ).map(([campo, color]) =>
              hover[campo] <= yMax * 1.05 ? <circle key={campo} cx={x(hover.q)} cy={y(hover[campo])} r={4} fill={color} stroke="#fff" strokeWidth={1.5} /> : null,
            )}
          </g>
        )}
      </svg>
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute top-8 z-10 w-52 rounded-md border border-linea bg-tabla p-2 text-xs shadow-md"
          style={{ left: `${Math.min(Math.max(((x(hover.q) - 0) / W) * 100, 24), 76)}%`, transform: 'translateX(-50%)' }}
          role="status"
        >
          <p className="font-medium text-grafito">Pedidos de {formatoCantidadPlan(hover.q, u)}</p>
          <p className="text-grafito">Total: {formatoDinero(hover.total)} al año</p>
          <p className="text-gris-texto">Hacer pedidos: {formatoDinero(hover.pedir)}</p>
          <p className="text-gris-texto">Guardar: {formatoDinero(hover.mantener)}</p>
        </div>
      )}
    </div>
  );
}
