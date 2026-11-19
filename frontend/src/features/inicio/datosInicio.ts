import { useQuery } from '@tanstack/react-query';
import { getMermas } from '../../services/mermasService';
import { getProducciones } from '../../services/produccionService';
import { getClasificacionAbc } from '../../services/abcService';
import type { MermaResumen } from '../../types/merma.types';
import type { ProduccionResumen } from '../../types/produccion.types';
import type { RespuestaAbc } from '../../types/abc.types';
import { DIAS_LABORABLES_ANIO, diasLaborables, enRango, type Rango } from './periodos';

// Consultas del Inicio con claves compartidas: cada dato se pide una sola vez
export const useMermasInicio = () => useQuery({ queryKey: ['inicio', 'mermas'], queryFn: () => getMermas() });
export const useProduccionesInicio = () => useQuery({ queryKey: ['inicio', 'producciones'], queryFn: () => getProducciones() });
export const useAbcInicio = (enabled = true) =>
  useQuery({ queryKey: ['clasificacion-abc'], queryFn: () => getClasificacionAbc(), enabled });

// Kilos de una merma; null si la unidad no es de peso (por ejemplo, unidades de huevo)
export function kilosMerma(m: MermaResumen): number | null {
  const u = m.unidad.trim().toLowerCase();
  if (u === 'kg') return m.cantidad;
  if (u === 'g') return m.cantidad / 1000;
  return null;
}

export interface ResumenMerma {
  registros: number;
  kg: number;
  costo: number;
  // Registros en unidades que no son de peso: no entran en los kg
  sinPeso: number;
  // Consumo de materia prima del rango, estimado con la demanda anual del ABC
  consumoKg: number | null;
  pct: number | null;
  porCausa: { causa: string; costo: number; kg: number; veces: number }[];
}

export function resumirMerma(mermas: MermaResumen[], abc: RespuestaAbc | undefined, r: Rango): ResumenMerma {
  const enEl = mermas.filter((m) => enRango(m.fecha, r));
  let kg = 0;
  let costo = 0;
  let sinPeso = 0;
  const causas = new Map<string, { causa: string; costo: number; kg: number; veces: number }>();
  for (const m of enEl) {
    const k = kilosMerma(m);
    if (k === null) sinPeso += 1;
    else kg += k;
    costo += m.costo_estimado ?? 0;
    const c = causas.get(m.causa) ?? { causa: m.causa, costo: 0, kg: 0, veces: 0 };
    c.costo += m.costo_estimado ?? 0;
    c.kg += k ?? 0;
    c.veces += 1;
    causas.set(m.causa, c);
  }
  const totalKgAnio = abc ? abc.items.reduce((s, i) => s + i.demanda_anual_kg, 0) : 0;
  const consumoKg = totalKgAnio > 0 ? (totalKgAnio / DIAS_LABORABLES_ANIO) * diasLaborables(r) : null;
  return {
    registros: enEl.length,
    kg,
    costo,
    sinPeso,
    consumoKg,
    pct: consumoKg ? (kg / consumoKg) * 100 : null,
    porCausa: [...causas.values()].sort((a, b) => b.costo - a.costo || b.kg - a.kg),
  };
}

export interface ResumenProduccion {
  finalizadas: number;
  unidades: number;
  rendimiento: number | null;
}

export function resumirProduccion(lista: ProduccionResumen[], r: Rango): ResumenProduccion {
  const fin = lista.filter((p) => p.estado === 'finalizada' && enRango(p.fecha, r));
  const conR = fin.filter((p) => p.rendimiento_pct != null);
  return {
    finalizadas: fin.length,
    unidades: fin.reduce((s, p) => s + (p.cantidad_producida ?? 0), 0),
    rendimiento: conR.length ? conR.reduce((s, p) => s + (p.rendimiento_pct ?? 0), 0) / conR.length : null,
  };
}
