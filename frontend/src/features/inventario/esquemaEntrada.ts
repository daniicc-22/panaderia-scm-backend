import { z } from 'zod';
import type { CriterioRotacion } from '../../types/materiaPrima.types';
import type { DatosEntrada } from '../../types/inventario.types';

// Mismos límites que el servidor (src/utils/entradas.ts del backend)
export const CANTIDAD_MAX = 1_000_000;
export const CODIGO_LOTE_MAX = 60;
export const VENCIMIENTO_ANIOS_MAX = 10;

export const aNumero = (v: string) => Number(v.trim().replace(',', '.'));

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function fechaReal(texto: string): boolean {
  if (!FECHA.test(texto)) return false;
  const [a, m, d] = texto.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

// Mensaje de error de la fecha de vencimiento según el insumo y el día (null si está bien)
export function errorVencimiento(fecha: string, hoy: string, criterio: CriterioRotacion | null): string | null {
  if (fecha === '') return criterio === 'FEFO' ? 'Este insumo se maneja por vencimiento: indica la fecha.' : null;
  if (!fechaReal(fecha)) return 'La fecha de vencimiento no es válida.';
  if (fecha < hoy) return 'No se puede recibir mercancía ya vencida.';
  const limite = `${Number(hoy.slice(0, 4)) + VENCIMIENTO_ANIOS_MAX}${hoy.slice(4)}`;
  if (fecha > limite) return `La fecha no puede superar ${VENCIMIENTO_ANIOS_MAX} años.`;
  return null;
}

const esCantidadValida = (v: string) => {
  const n = aNumero(v);
  return v.trim() !== '' && Number.isFinite(n) && n > 0 && n <= CANTIDAD_MAX;
};

export const esquemaEntrada = z.object({
  materia_prima_id: z.string().min(1, 'Elige el insumo.'),
  presentacion_id: z.string().min(1, 'Elige la presentación.'),
  proveedor_id: z.string(),
  cantidad: z
    .string()
    .refine(esCantidadValida, `Escribe una cantidad mayor que 0 y hasta ${CANTIDAD_MAX.toLocaleString('es-CO')}.`),
  fecha_vencimiento: z.string(),
  codigo_lote: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, ' '))
    .pipe(z.string().max(CODIGO_LOTE_MAX, `El código no puede superar ${CODIGO_LOTE_MAX} caracteres.`)),
});

export type ValoresEntrada = z.input<typeof esquemaEntrada>;

export const valoresVaciosEntrada: ValoresEntrada = {
  materia_prima_id: '',
  presentacion_id: '',
  proveedor_id: '',
  cantidad: '',
  fecha_vencimiento: '',
  codigo_lote: '',
};

export function aDatosEntrada(v: z.output<typeof esquemaEntrada>): DatosEntrada {
  return {
    materia_prima_id: v.materia_prima_id,
    presentacion_id: v.presentacion_id,
    cantidad: aNumero(v.cantidad),
    ...(v.proveedor_id ? { proveedor_id: v.proveedor_id } : {}),
    ...(v.fecha_vencimiento ? { fecha_vencimiento: v.fecha_vencimiento } : {}),
    ...(v.codigo_lote ? { codigo_lote: v.codigo_lote } : {}),
  };
}
