import type { EstadoStock } from '../../types/inventario.types';

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 });
const dinero = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const costo = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 4 });

export const formatoDinero = (v: number) => dinero.format(v);
export const formatoCosto = (v: number) => costo.format(v);

// Instante ISO (UTC) → fecha local del navegador, para no correr un día en la noche de Colombia
export const formatoFechaIso = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

// Los gramos grandes se leen mejor en kilos
export function formatoCantidad(valor: number, unidad: string): string {
  if (unidad === 'g' && Math.abs(valor) >= 1000) return `${numero.format(valor / 1000)} kg`;
  return `${numero.format(valor)} ${unidad}`;
}

// Para pantallas de planeación (Reposición, EOQ): cifras redondeadas que se leen de un vistazo.
// Con tres decimales «316,935 kg» parece 316 mil kilos; aquí sería «317 kg». Inventario y conteos
// siguen usando formatoCantidad (exacto).
const f0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const f1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const f2 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
export function formatoCantidadPlan(valor: number, unidad: string): string {
  const enKg = unidad === 'g' && Math.abs(valor) >= 1000;
  const v = enKg ? valor / 1000 : valor;
  const a = Math.abs(v);
  const n = a >= 100 ? f0 : a >= 10 ? f1 : f2;
  return `${n.format(v)} ${enKg ? 'kg' : unidad}`;
}

// 'AAAA-MM-DD' → '24 oct 2026' sin pasar por zonas horarias
export function formatoFecha(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function diasHasta(hoy: string, fecha: string): number {
  const dia = (f: string) => {
    const [a, m, d] = f.split('-').map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((dia(fecha) - dia(hoy)) / 86_400_000);
}

export function textoVencimiento(hoy: string, fecha: string | null): string {
  if (fecha === null) return 'Sin vencimiento';
  const d = diasHasta(hoy, fecha);
  if (d < 0) return d === -1 ? 'Venció ayer' : `Venció hace ${-d} días`;
  if (d === 0) return 'Vence hoy';
  if (d === 1) return 'Vence mañana';
  return `Vence en ${d} días`;
}

export const ETIQUETA_ESTADO: Record<EstadoStock, string> = {
  ok: 'Al día',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  sin_stock: 'Sin existencias',
};

export const COLOR_ESTADO: Record<EstadoStock, 'green' | 'yellow' | 'red' | 'gray'> = {
  ok: 'green',
  por_vencer: 'yellow',
  vencido: 'red',
  sin_stock: 'gray',
};
