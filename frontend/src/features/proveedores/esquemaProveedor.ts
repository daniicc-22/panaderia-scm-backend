import { z } from 'zod';
import type { DatosProveedor, Proveedor } from '../../types/proveedor.types';

// Mismos límites que el servidor (src/utils/proveedor.ts del backend)
export const NOMBRE_MIN = 2;
export const NOMBRE_MAX = 100;
export const CONTACTO_MAX = 100;
export const TELEFONO_MAX = 30;
export const DIRECCION_MAX = 200;

const limpiar = (v: string) => v.trim().replace(/\s+/g, ' ');

export const esquemaProveedor = z.object({
  nombre: z
    .string()
    .transform(limpiar)
    .pipe(
      z
        .string()
        .min(NOMBRE_MIN, `El nombre debe tener al menos ${NOMBRE_MIN} caracteres.`)
        .max(NOMBRE_MAX, `El nombre no puede superar los ${NOMBRE_MAX} caracteres.`),
    ),
  contacto: z.string().transform(limpiar).pipe(z.string().max(CONTACTO_MAX, `Máximo ${CONTACTO_MAX} caracteres.`)),
  telefono: z
    .string()
    .transform(limpiar)
    .pipe(
      z
        .string()
        .max(TELEFONO_MAX, `Máximo ${TELEFONO_MAX} caracteres.`)
        .refine((v) => v === '' || /^[0-9+()\-\s.]+$/.test(v), 'Solo números, espacios y los signos + - ( ) .'),
    ),
  direccion: z.string().transform(limpiar).pipe(z.string().max(DIRECCION_MAX, `Máximo ${DIRECCION_MAX} caracteres.`)),
});

export type ValoresProveedor = z.input<typeof esquemaProveedor>;

export const valoresVacios: ValoresProveedor = { nombre: '', contacto: '', telefono: '', direccion: '' };

export function valoresDesdeProveedor(p: Proveedor): ValoresProveedor {
  return { nombre: p.nombre, contacto: p.contacto ?? '', telefono: p.telefono ?? '', direccion: p.direccion ?? '' };
}

// Los campos vacíos se envían como null
export function aDatosProveedor(v: z.output<typeof esquemaProveedor>): DatosProveedor {
  return {
    nombre: v.nombre,
    contacto: v.contacto === '' ? null : v.contacto,
    telefono: v.telefono === '' ? null : v.telefono,
    direccion: v.direccion === '' ? null : v.direccion,
  };
}
