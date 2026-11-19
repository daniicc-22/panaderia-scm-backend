import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, TrendingDown, TrendingUp } from 'lucide-react';
import { Esqueleto } from '../../components/feedback/Esqueleto';
import { getHistorialCostos } from '../../services/preciosService';
import type { HistorialInsumo } from '../../types/precios.types';
import { formatoPesos } from '../precios/numeros';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const etiquetaMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const pct = (n: number) => `${n.toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
const porKilo = (unidad: string, v: number) => (unidad === 'g' ? v * 1000 : v);
const sufijo = (unidad: string) => (unidad === 'g' ? 'kg' : unidad);

function Linea({ valores, ancho, alto, grueso = 2 }: { valores: number[]; ancho: number; alto: number; grueso?: number }) {
  if (valores.length < 2) return <span className="text-xs text-gris-texto">Un solo mes</span>;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min || 1;
  const pad = 4;
  const pts = valores.map((v, i) => [pad + (i / (valores.length - 1)) * (ancho - pad * 2), alto - pad - ((v - min) / rango) * (alto - pad * 2)]);
  return (
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Tendencia del costo" className="overflow-visible">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--color-azul-noche)" strokeWidth={grueso} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3.5} fill="var(--color-azul-noche)" stroke="var(--color-tabla)" strokeWidth={2} />
    </svg>
  );
}

function Detalle({ ins }: { ins: HistorialInsumo }) {
  const [activo, setActivo] = useState<number | null>(null);
  const v = ins.puntos.map((p) => porKilo(ins.unidad, p.costo_por_unidad_base));
  const min = Math.min(...v);
  const max = Math.max(...v);
  const rango = max - min || 1;
  const W = 560, H = 160, L = 8, R = 8, T = 14, B = 26;
  const x = (i: number) => (v.length === 1 ? W / 2 : L + (i / (v.length - 1)) * (W - L - R));
  const y = (val: number) => H - B - ((val - min) / rango) * (H - B - T);
  return (
    <div className="mt-3 border-t border-linea pt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Costo mensual de ${ins.materia}`}>
        {[min, max].map((g) => (
          <g key={g}>
            <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="var(--color-linea)" strokeDasharray="3 4" />
          </g>
        ))}
        <polyline points={v.map((val, i) => `${x(i)},${y(val)}`).join(' ')} fill="none" stroke="var(--color-azul-noche)" strokeWidth={2} strokeLinejoin="round" />
        {v.map((val, i) => (
          <g key={ins.puntos[i].mes} onMouseEnter={() => setActivo(i)} onMouseLeave={() => setActivo(null)} onFocus={() => setActivo(i)} onBlur={() => setActivo(null)} tabIndex={0}>
            <circle cx={x(i)} cy={y(val)} r={16} fill="transparent" />
            <circle cx={x(i)} cy={y(val)} r={activo === i ? 5 : 3.5} fill="var(--color-azul-noche)" stroke="var(--color-tabla)" strokeWidth={2} />
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--color-gris-texto)">{etiquetaMes(ins.puntos[i].mes)}</text>
            {activo === i && (
              <text x={Math.min(Math.max(x(i), 50), W - 50)} y={y(val) - 10} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--color-grafito)">
                {formatoPesos.format(val)}
              </text>
            )}
          </g>
        ))}
      </svg>
      <table className="mt-2 w-full text-sm">
        <thead className="text-left text-xs text-gris-texto">
          <tr><th className="py-1 font-semibold">Mes</th><th className="py-1 text-right font-semibold">Costo / {sufijo(ins.unidad)}</th><th className="py-1 text-right font-semibold">Comprado</th></tr>
        </thead>
        <tbody>
          {ins.puntos.map((p) => (
            <tr key={p.mes} className="border-t border-linea">
              <td className="py-1">{etiquetaMes(p.mes)}</td>
              <td className="cifras py-1 text-right">{formatoPesos.format(porKilo(ins.unidad, p.costo_por_unidad_base))}</td>
              <td className="cifras py-1 text-right text-gris-texto">{(ins.unidad === 'g' ? p.cantidad / 1000 : p.cantidad).toLocaleString('es-CO', { maximumFractionDigits: 1 })} {sufijo(ins.unidad)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Costo real de compra por mes (promedio ponderado de los lotes recibidos)
export function HistorialCostos() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['precios', 'historial'], queryFn: () => getHistorialCostos(12) });
  const [abierto, setAbierto] = useState<string | null>(null);

  if (isLoading) return <Esqueleto className="h-48 w-full" />;
  if (isError || !data) return <p className="rounded-lg bg-critico-fondo p-3 text-sm text-critico-texto">No se pudo cargar el historial de costos.</p>;
  if (data.items.length === 0)
    return <p className="rounded-tarjeta border border-linea bg-tabla p-6 text-center text-sm text-gris-texto">Aún no hay compras registradas en los últimos {data.meses} meses. El historial se arma solo con cada entrada de mercancía.</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gris-texto">Costo real pagado por unidad, promedio de cada mes según las entradas de mercancía desde {etiquetaMes(data.desde)}. Toca un insumo para ver el detalle.</p>
      <ul className="flex flex-col gap-2">
        {data.items.map((ins) => {
          const ultimo = porKilo(ins.unidad, ins.puntos[ins.puntos.length - 1].costo_por_unidad_base);
          const sube = (ins.variacion_pct ?? 0) > 0;
          const abre = abierto === ins.materia_prima_id;
          return (
            <li key={ins.materia_prima_id} className="rounded-tarjeta border border-linea bg-tabla px-4 py-3">
              <button type="button" aria-expanded={abre} onClick={() => setAbierto(abre ? null : ins.materia_prima_id)} className="flex min-h-11 w-full items-center gap-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-grafito">{ins.materia}</span>
                  <span className="cifras text-xs text-gris-texto">{formatoPesos.format(ultimo)} / {sufijo(ins.unidad)} el último mes</span>
                </span>
                <Linea valores={ins.puntos.map((p) => p.costo_por_unidad_base)} ancho={96} alto={32} />
                <span className={`cifras inline-flex w-20 items-center justify-end gap-1 text-sm font-bold ${ins.variacion_pct === null ? 'text-gris-texto' : sube ? 'text-critico-texto' : 'text-exito-texto'}`}>
                  {ins.variacion_pct === null ? '—' : (<>{sube ? <TrendingUp size={14} aria-hidden="true" /> : <TrendingDown size={14} aria-hidden="true" />}{sube ? '+' : ''}{pct(ins.variacion_pct)}</>)}
                </span>
                <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-gris-texto transition-transform ${abre ? 'rotate-180' : ''}`} />
              </button>
              {abre && <Detalle ins={ins} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
