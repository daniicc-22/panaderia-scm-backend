import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Panel } from '../inicio/Panel';
import type { ClaseAbc, ItemAbc, RespuestaAbc } from '../../types/abc.types';

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

// Mismos colores de clase que el Inicio: difieren en claridad, no solo en tono
const RELLENO: Record<ClaseAbc, string> = { A: 'var(--color-azul-noche)', B: 'var(--color-trigo)', C: 'var(--color-clase-c)' };
const FICHA: Record<ClaseAbc, string> = { A: 'bg-azul-noche', B: 'bg-trigo', C: 'bg-clase-c' };

const H = 260;
const M = { izq: 44, der: 12, arr: 16, abajo: 12 };
const PH = H - M.arr - M.abajo;
const y = (pct: number) => M.arr + PH - (Math.min(Math.max(pct, 0), 100) / 100) * PH;

// Diagrama de Pareto: cada barra es el % del valor de un insumo (de mayor a menor) y la línea es el
// acumulado. Las líneas punteadas son los límites de las clases A y B. Una sola escala (0–100 %).
export function ParetoAbc({ datos }: { datos: Pick<RespuestaAbc, 'items' | 'resumen' | 'supuestos'> }) {
  const [activo, setActivo] = useState<number | null>(null);
  const [ancho, setAncho] = useState(720);
  const caja = useRef<HTMLDivElement>(null);

  // Mide el ancho disponible: el dibujo se hace a tamaño real (1 px = 1 px) y el texto no se estira
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setAncho(Math.max(Math.floor(el.clientWidth), 320));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const items: ItemAbc[] = datos.items;
  if (items.length === 0) return null;
  const W = ancho;
  const PW = W - M.izq - M.der;

  const n = items.length;
  const paso = PW / n;
  const anchoBarra = Math.max(Math.min(paso * 0.7, 26), 2);
  const cx = (i: number) => M.izq + paso * i + paso / 2;
  const linea = items.map((it, i) => `${i === 0 ? 'M' : 'L'}${cx(i).toFixed(1)},${y(it.porcentaje_acumulado).toFixed(1)}`).join(' ');
  const { A: limA, B: limB } = datos.supuestos.limites;
  const sel = activo !== null ? items[activo] : null;
  const resumen = datos.resumen.map((r) => `clase ${r.clase}: ${r.insumos} insumos`).join(', ');

  return (
    <Panel
      titulo="Diagrama de Pareto"
      subtitulo="Pocos insumos concentran la mayor parte del valor. Pasa el cursor por una barra para ver el detalle."
    >
      <div ref={caja} className="w-full">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block max-w-full"
        role="img"
        aria-label={`Diagrama de Pareto de ${n} insumos, de mayor a menor valor anual. ${resumen}.`}
      >
        {/* Escala 0, 50 y 100 % */}
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={M.izq} x2={W - M.der} y1={y(v)} y2={y(v)} stroke="var(--color-linea)" strokeWidth={v === 0 ? 1.5 : 1} />
            <text x={M.izq - 6} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--color-gris-texto)">
              {v} %
            </text>
          </g>
        ))}
        {/* Límites de clase */}
        {[
          { v: limA, t: `Límite A · ${limA} %`, dy: 14 },
          { v: limB, t: `Límite B · ${limB} %`, dy: 14 },
        ].map((l) => (
          <g key={l.t}>
            <line x1={M.izq} x2={W - M.der} y1={y(l.v)} y2={y(l.v)} stroke="var(--color-grafico-neutro)" strokeWidth={1} strokeDasharray="4 4" />
            <text x={W - M.der - 2} y={y(l.v) + l.dy} textAnchor="end" fontSize={12} fill="var(--color-gris-texto)">
              {l.t}
            </text>
          </g>
        ))}
        {/* Barras: % del valor de cada insumo */}
        {items.map((it, i) => {
          const alto = Math.max(y(0) - y(it.porcentaje), it.porcentaje > 0 ? 2 : 0);
          return (
            <motion.rect
              key={it.codigo}
              x={cx(i) - anchoBarra / 2}
              width={anchoBarra}
              rx={2}
              fill={RELLENO[it.clase]}
              opacity={activo === null || activo === i ? 1 : 0.45}
              initial={{ height: 0, y: y(0) }}
              animate={{ height: alto, y: y(0) - alto }}
              transition={{ duration: 0.7, delay: Math.min(i * 0.02, 0.6), ease: [0.16, 1, 0.3, 1] }}
            />
          );
        })}
        {/* Línea del acumulado */}
        <motion.path
          d={linea}
          fill="none"
          stroke="var(--color-terracota)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
        {activo !== null && sel && <circle cx={cx(activo)} cy={y(sel.porcentaje_acumulado)} r={5} fill="var(--color-terracota)" stroke="white" strokeWidth={2} />}
        {/* Zonas de contacto: tocan toda la altura para que sea fácil apuntar y enfocar con el teclado */}
        {items.map((it, i) => (
          <rect
            key={`z-${it.codigo}`}
            x={M.izq + paso * i}
            y={M.arr}
            width={paso}
            height={PH}
            fill="transparent"
            tabIndex={0}
            aria-label={`${it.nombre}: ${numero.format(it.porcentaje)} % del valor, acumulado ${numero.format(it.porcentaje_acumulado)} %, clase ${it.clase}`}
            onMouseEnter={() => setActivo(i)}
            onMouseLeave={() => setActivo(null)}
            onFocus={() => setActivo(i)}
            onBlur={() => setActivo(null)}
            className="outline-hidden"
          />
        ))}
      </svg>
      </div>

      {/* Línea de lectura: siempre ocupa su espacio para que el gráfico no salte */}
      <p className="mt-1 min-h-10 text-sm text-grafito" aria-live="polite">
        {sel ? (
          <>
            <span className="font-semibold">{sel.nombre}</span> · clase {sel.clase} · {numero.format(sel.porcentaje)} % del valor · acumulado{' '}
            {numero.format(sel.porcentaje_acumulado)} %
          </>
        ) : (
          <span className="text-gris-texto">Barras: % del valor de cada insumo. Línea: porcentaje acumulado.</span>
        )}
      </p>

      <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gris-texto">
        {datos.resumen.map((r) => (
          <li key={r.clase} className="flex items-center gap-2">
            <span className={`h-3 w-3 rounded-xs ${FICHA[r.clase]}`} aria-hidden="true" />
            Clase {r.clase} · {r.insumos} insumos
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="h-0.5 w-4 bg-terracota" aria-hidden="true" />
          Acumulado
        </li>
      </ul>
    </Panel>
  );
}
