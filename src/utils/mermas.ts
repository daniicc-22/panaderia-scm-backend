// Reglas de las mermas (HU-17), sin acceso a base de datos (se prueban solas).
import { UUID } from './materiaPrima';

export const ETAPAS = ['recepcion', 'almacenamiento', 'produccion'] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ETIQUETA_ETAPA: Record<Etapa, string> = {
  recepcion: 'Recepción',
  almacenamiento: 'Almacenamiento',
  produccion: 'Producción',
};

export const MERMA_MAX = 1_000_000; // en la unidad base (gramos)

export type Resultado<T> = { ok: true; datos: T } | { ok: false; errores: string[] };

export interface DatosMerma {
  causa_id: string;
  etapa: Etapa;
  cantidad: number;
  lote_id: string | null;
  produccion_id: string | null;
}

const redondear = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

function idOpcional(valor: unknown, etiqueta: string, errores: string[]): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string' || !UUID.test(valor)) {
    errores.push(`${etiqueta} no es válido.`);
    return null;
  }
  return valor;
}

/** Datos de una merma: debe venir de un lote, de una producción o de ambos. */
export function validarMerma(body: unknown): Resultado<DatosMerma> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, errores: ['El cuerpo de la solicitud no es válido.'] };
  }
  const b = body as Record<string, unknown>;
  const errores: string[] = [];

  if (typeof b.causa_id !== 'string' || !UUID.test(b.causa_id)) errores.push('Elige la causa.');
  if (typeof b.etapa !== 'string' || !(ETAPAS as readonly string[]).includes(b.etapa)) errores.push('Elige la etapa.');

  let cantidad = 0;
  if (typeof b.cantidad !== 'number' || !Number.isFinite(b.cantidad) || b.cantidad <= 0 || b.cantidad > MERMA_MAX) {
    errores.push(`La cantidad debe ser un número mayor que 0 y no superar ${MERMA_MAX.toLocaleString('es-CO')}.`);
  } else {
    cantidad = redondear(b.cantidad);
    if (cantidad <= 0) errores.push('La cantidad es demasiado pequeña.');
  }

  const lote_id = idOpcional(b.lote_id, 'El lote', errores);
  const produccion_id = idOpcional(b.produccion_id, 'La producción', errores);
  if (errores.length === 0 && lote_id === null && produccion_id === null) {
    errores.push('Indica de qué lote o de qué producción es la merma.');
  }

  if (errores.length > 0) return { ok: false, errores };
  return { ok: true, datos: { causa_id: b.causa_id as string, etapa: b.etapa as Etapa, cantidad, lote_id, produccion_id } };
}

/** Costo de lo perdido: cantidad × costo unitario del lote, con dos decimales. */
export function costoMerma(costoUnitario: number, cantidad: number): number {
  return Math.round(costoUnitario * cantidad * 100) / 100;
}
