import { z } from 'zod';
import type { CambiosMateriaPrima, DatosNuevaMateriaPrima, MateriaPrima } from '../../types/materiaPrima.types';

// Mismos límites que el servidor (src/utils/materiaPrima.ts del backend)
export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 100;
export const LEAD_TIME_MAX = 365;

const aNumero = (v: string) => Number(v.trim().replace(',', '.'));
const esLeadTimeValido = (v: string) => {
  if (v.trim() === '') return true;
  const n = aNumero(v);
  return Number.isFinite(n) && n >= 0 && n <= LEAD_TIME_MAX;
};

// Todos los campos del formulario son texto; se convierten al enviar
export function crearEsquema(modoEdicion: boolean) {
  return z.object({
    nombre: z
      .string()
      .transform((v) => v.trim().replace(/\s+/g, ' '))
      .pipe(
        z
          .string()
          .min(NOMBRE_MIN, `El nombre debe tener al menos ${NOMBRE_MIN} caracteres.`)
          .max(NOMBRE_MAX, `El nombre no puede superar los ${NOMBRE_MAX} caracteres.`),
      ),
    unidad_base_id: modoEdicion ? z.string() : z.string().min(1, 'Elige la unidad base.'),
    categoria_id: z.string(),
    criterio_rotacion: z.enum(['', 'FIFO', 'FEFO', 'ninguno']),
    lead_time_dias: z
      .string()
      .refine(esLeadTimeValido, `Escribe un número de días entre 0 y ${LEAD_TIME_MAX}, o déjalo vacío.`),
    variabilidad_peso_unitario: z.enum(['', 'si', 'no']),
  });
}

export type ValoresFormulario = z.input<ReturnType<typeof crearEsquema>>;

export const valoresVacios: ValoresFormulario = {
  nombre: '',
  unidad_base_id: '',
  categoria_id: '',
  criterio_rotacion: '',
  lead_time_dias: '',
  variabilidad_peso_unitario: '',
};

export function valoresDesdeMateria(m: MateriaPrima): ValoresFormulario {
  return {
    nombre: m.nombre,
    unidad_base_id: m.unidad_base_id,
    categoria_id: m.categoria_id ?? '',
    criterio_rotacion: m.criterio_rotacion ?? '',
    lead_time_dias: m.lead_time_dias === null ? '' : String(m.lead_time_dias),
    variabilidad_peso_unitario: m.variabilidad_peso_unitario === null ? '' : m.variabilidad_peso_unitario ? 'si' : 'no',
  };
}

type Validados = z.output<ReturnType<typeof crearEsquema>>;

export function aCambios(v: Validados): CambiosMateriaPrima {
  return {
    nombre: v.nombre,
    categoria_id: v.categoria_id === '' ? null : v.categoria_id,
    criterio_rotacion: v.criterio_rotacion === '' ? null : v.criterio_rotacion,
    lead_time_dias: v.lead_time_dias.trim() === '' ? null : aNumero(v.lead_time_dias),
    variabilidad_peso_unitario: v.variabilidad_peso_unitario === '' ? null : v.variabilidad_peso_unitario === 'si',
  };
}

export function aDatosNuevos(v: Validados): DatosNuevaMateriaPrima {
  return { ...aCambios(v), unidad_base_id: v.unidad_base_id } as DatosNuevaMateriaPrima;
}
