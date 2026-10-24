// Resumen y orden de lotes de inventario, sin acceso a base de datos (se prueban solos).
import type { CriterioRotacion } from './materiaPrima';

export const DIAS_ALERTA = 7;

export interface LoteVista {
  id: string;
  codigo_lote: string | null;
  cantidad_inicial: number;
  cantidad_disponible: number;
  costo_unitario: number;
  fecha_vencimiento: string | null; // AAAA-MM-DD
  created_at: string; // ISO
}

export type EstadoLote = 'ok' | 'por_vencer' | 'vencido';
export type EstadoStock = EstadoLote | 'sin_stock';

const redondear = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const dia = (f: string) => Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)));

/** Días desde hoy hasta la fecha (negativo si ya pasó). */
export const diasHasta = (hoy: string, fecha: string): number => Math.round((dia(fecha) - dia(hoy)) / 86_400_000);

export function estadoLote(fecha: string | null, hoy: string, diasAlerta = DIAS_ALERTA): EstadoLote {
  if (fecha === null) return 'ok';
  const d = diasHasta(hoy, fecha);
  if (d < 0) return 'vencido';
  if (d <= diasAlerta) return 'por_vencer';
  return 'ok';
}

/** Orden en que se debe consumir: FEFO por vencimiento (sin fecha al final); FIFO o sin criterio por llegada. */
export function ordenarLotes<T extends LoteVista>(lotes: T[], criterio: CriterioRotacion | null): T[] {
  const porLlegada = (a: T, b: T) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return [...lotes].sort((a, b) => {
    if (criterio === 'FEFO') {
      const fa = a.fecha_vencimiento;
      const fb = b.fecha_vencimiento;
      if (fa !== fb) {
        if (fa === null) return 1;
        if (fb === null) return -1;
        return fa < fb ? -1 : 1;
      }
    }
    return porLlegada(a, b);
  });
}

const GRAVEDAD: Record<EstadoLote, number> = { ok: 0, por_vencer: 1, vencido: 2 };

export interface ResumenStock {
  stock: number;
  lotes_activos: number;
  proximo_vencimiento: string | null;
  estado: EstadoStock;
  valor: number;
}

/** Resumen de un insumo a partir de sus lotes: solo cuentan los que aún tienen existencias. */
export function resumirStock(lotes: LoteVista[], hoy: string, diasAlerta = DIAS_ALERTA): ResumenStock {
  const activos = lotes.filter((l) => l.cantidad_disponible > 0);
  if (activos.length === 0) return { stock: 0, lotes_activos: 0, proximo_vencimiento: null, estado: 'sin_stock', valor: 0 };

  let estado: EstadoLote = 'ok';
  let proximo: string | null = null;
  for (const l of activos) {
    const e = estadoLote(l.fecha_vencimiento, hoy, diasAlerta);
    if (GRAVEDAD[e] > GRAVEDAD[estado]) estado = e;
    if (l.fecha_vencimiento !== null && (proximo === null || l.fecha_vencimiento < proximo)) proximo = l.fecha_vencimiento;
  }
  return {
    stock: redondear(activos.reduce((s, l) => s + l.cantidad_disponible, 0), 3),
    lotes_activos: activos.length,
    proximo_vencimiento: proximo,
    estado,
    valor: redondear(activos.reduce((s, l) => s + l.cantidad_disponible * l.costo_unitario, 0), 2),
  };
}
