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

// ---- Alertas de vencimiento (HU-15) ----
export const DIAS_ALERTA_MAX = 60;

/** Días de aviso pedidos por el usuario: entero de 1 a 60; sin valor se usa el predeterminado. */
export function validarDiasAlerta(valor: unknown): { ok: true; dias: number } | { ok: false; error: string } {
  if (valor === undefined) return { ok: true, dias: DIAS_ALERTA };
  const texto = typeof valor === 'string' ? valor.trim() : '';
  if (!/^\d{1,3}$/.test(texto) || Number(texto) < 1 || Number(texto) > DIAS_ALERTA_MAX) {
    return { ok: false, error: `Los días de aviso deben ser un número entero entre 1 y ${DIAS_ALERTA_MAX}.` };
  }
  return { ok: true, dias: Number(texto) };
}

export interface AlertaLote {
  lote_id: string;
  materia_prima_id: string;
  codigo_lote: string | null;
  cantidad_disponible: number;
  fecha_vencimiento: string;
  dias: number; // negativo si ya venció
  estado: 'vencido' | 'por_vencer';
  valor: number;
}

/** Lotes con existencias que ya vencieron o vencen pronto, del que vence antes al que vence después. */
export function alertasDeLotes(
  lotes: readonly (LoteVista & { materia_prima_id: string })[],
  hoy: string,
  diasAlerta = DIAS_ALERTA,
): AlertaLote[] {
  const alertas: AlertaLote[] = [];
  for (const l of lotes) {
    if (l.cantidad_disponible <= 0 || l.fecha_vencimiento === null) continue;
    const estado = estadoLote(l.fecha_vencimiento, hoy, diasAlerta);
    if (estado === 'ok') continue;
    alertas.push({
      lote_id: l.id,
      materia_prima_id: l.materia_prima_id,
      codigo_lote: l.codigo_lote,
      cantidad_disponible: l.cantidad_disponible,
      fecha_vencimiento: l.fecha_vencimiento,
      dias: diasHasta(hoy, l.fecha_vencimiento),
      estado,
      valor: redondear(l.cantidad_disponible * l.costo_unitario, 2),
    });
  }
  return alertas.sort((a, b) =>
    a.fecha_vencimiento !== b.fecha_vencimiento
      ? a.fecha_vencimiento < b.fecha_vencimiento ? -1 : 1
      : a.lote_id < b.lote_id ? -1 : a.lote_id > b.lote_id ? 1 : 0,
  );
}
