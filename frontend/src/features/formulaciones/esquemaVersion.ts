import { leerNumero } from '../precios/numeros';
import type { DatosVersion, FormulacionDetalle, LineaReceta } from '../../types/formulacion.types';

// Mismos límites que valida el servidor (utils/formulacion.ts del backend)
export const CANTIDAD_MAX = 999_999_999;
export const TOLERANCIA_MAX = 100;
export const INGREDIENTES_MIN = 1;
export const INGREDIENTES_MAX = 100;
export const NOMBRE_PRODUCTO_MIN = 2;
export const NOMBRE_PRODUCTO_MAX = 100;
export const MOTIVO_MAX = 300;
export const PROCEDIMIENTO_MAX = 3000;
export const TIEMPO_MAX_MIN = 1440;
export const TEMPERATURA_MAX_C = 400;
export const MERMA_HORNEADO_MAX = 60;
export const PRECIO_VENTA_MAX = 99_999_999;

export interface FilaEditor {
  clave: string; // identifica la fila en pantalla; no viaja al servidor
  materia_prima_id: string | null;
  producto_intermedio_id: string | null;
  nombre: string; // para filas que no se pueden elegir de la lista (intermedios o insumos inactivos)
  unidad: string;
  cantidad: string;
  tolerancia: string;
}

// Ficha técnica tal como se escribe en el formulario (todo texto; vacío = sin dato)
export interface FichaEditor {
  motivo: string;
  procedimiento: string;
  tiempoPreparacion: string;
  tiempoHorneado: string;
  temperatura: string;
  merma: string;
}

export const fichaVacia = (): FichaEditor => ({ motivo: '', procedimiento: '', tiempoPreparacion: '', tiempoHorneado: '', temperatura: '', merma: '' });

export interface ValoresEditor {
  rendimiento: string;
  filas: FilaEditor[];
  ficha: FichaEditor;
}

export interface ErroresFila {
  materia?: string;
  cantidad?: string;
  tolerancia?: string;
}

export interface ErroresEditor {
  rendimiento?: string;
  general?: string;
  ficha?: Partial<Record<keyof FichaEditor, string>>;
  filas: Record<string, ErroresFila>;
}

export type ResultadoEditor = { ok: true; datos: DatosVersion } | { ok: false; errores: ErroresEditor };

let contador = 0;
export function nuevaClave(): string {
  contador += 1;
  return `fila-${contador}`;
}

export function filaVacia(): FilaEditor {
  return {
    clave: nuevaClave(),
    materia_prima_id: '',
    producto_intermedio_id: null,
    nombre: '',
    unidad: '',
    cantidad: '',
    tolerancia: '',
  };
}

// Valor del selector de ingredientes: "m:<id>" (insumo), "i:<id>" (producto intermedio) o "" (sin elegir)
export function valorSelector(fila: Pick<FilaEditor, 'materia_prima_id' | 'producto_intermedio_id'>): string {
  if (fila.producto_intermedio_id) return `i:${fila.producto_intermedio_id}`;
  return fila.materia_prima_id ? `m:${fila.materia_prima_id}` : '';
}

// La fila con lo que se eligió en el selector. La cantidad de un intermedio se mide en gramos.
export function filaConSeleccion(fila: FilaEditor, valor: string, nombreDe: (idIntermedio: string) => string): FilaEditor {
  if (valor.startsWith('i:')) {
    const id = valor.slice(2);
    return { ...fila, materia_prima_id: null, producto_intermedio_id: id, nombre: nombreDe(id), unidad: 'g' };
  }
  if (valor.startsWith('m:')) {
    return { ...fila, materia_prima_id: valor.slice(2), producto_intermedio_id: null, nombre: '', unidad: '' };
  }
  return { ...fila, materia_prima_id: '', producto_intermedio_id: null, nombre: '', unidad: '' };
}

// Número como lo escribe una persona en Colombia: coma decimal
const aTexto = (n: number) => String(n).replace('.', ',');

export function valoresDesdeDetalle(d: FormulacionDetalle): ValoresEditor {
  return {
    ficha: {
      // El motivo describe un cambio concreto: no se hereda de la versión que se toma como base
      motivo: '',
      procedimiento: d.procedimiento ?? '',
      tiempoPreparacion: d.tiempo_preparacion_min == null ? '' : aTexto(d.tiempo_preparacion_min),
      tiempoHorneado: d.tiempo_horneado_min == null ? '' : aTexto(d.tiempo_horneado_min),
      temperatura: d.temperatura_horneado_c == null ? '' : aTexto(d.temperatura_horneado_c),
      merma: d.merma_horneado_pct == null ? '' : aTexto(d.merma_horneado_pct),
    },
    rendimiento: d.rendimiento == null ? '' : aTexto(d.rendimiento),
    filas: d.ingredientes.map((i) => ({
      clave: nuevaClave(),
      materia_prima_id: i.materia_prima_id,
      producto_intermedio_id: i.producto_intermedio_id,
      nombre: i.nombre,
      unidad: i.unidad,
      cantidad: aTexto(i.cantidad),
      tolerancia: i.tolerancia_porcentaje == null ? '' : aTexto(i.tolerancia_porcentaje),
    })),
  };
}

const redondear3 = (n: number) => Math.round(n * 1000) / 1000;

// Comprueba lo que escribió la persona y arma el cuerpo que espera el servidor.
// `materiasActivas` son los ids de las materias primas que se pueden usar hoy.
export function validarEditor(valores: ValoresEditor, materiasActivas: ReadonlySet<string>): ResultadoEditor {
  const errores: ErroresEditor = { filas: {} };
  const marcar = (clave: string, campo: keyof ErroresFila, texto: string) => {
    errores.filas[clave] = { ...errores.filas[clave], [campo]: texto };
  };

  const rend = leerNumero(valores.rendimiento);
  if (rend === null || rend <= 0 || rend > CANTIDAD_MAX || redondear3(rend) <= 0) {
    errores.rendimiento = `Escribe cuántas unidades rinde el lote (mayor que 0 y hasta ${CANTIDAD_MAX.toLocaleString('es-CO')}).`;
  }

  if (valores.filas.length < INGREDIENTES_MIN || valores.filas.length > INGREDIENTES_MAX) {
    errores.general = `La formulación debe tener entre ${INGREDIENTES_MIN} y ${INGREDIENTES_MAX} ingredientes.`;
  }

  const ingredientes: LineaReceta[] = [];
  const vistos = new Set<string>();

  for (const fila of valores.filas) {
    const esIntermedio = !!fila.producto_intermedio_id;
    const idMateria = fila.materia_prima_id ?? '';

    if (!esIntermedio) {
      if (!idMateria) marcar(fila.clave, 'materia', 'Elige un ingrediente.');
      else if (!materiasActivas.has(idMateria)) marcar(fila.clave, 'materia', 'Este insumo está inactivo: cámbialo o quítalo.');
    }
    const clave = esIntermedio ? `i:${fila.producto_intermedio_id}` : `m:${idMateria}`;
    if (!errores.filas[fila.clave]?.materia) {
      if (vistos.has(clave)) marcar(fila.clave, 'materia', 'Este ingrediente está repetido.');
      vistos.add(clave);
    }

    const cant = leerNumero(fila.cantidad);
    if (cant === null || cant <= 0 || cant > CANTIDAD_MAX || redondear3(cant) <= 0) {
      marcar(fila.clave, 'cantidad', 'Cantidad mayor que 0.');
    }

    let tolerancia: number | null = null;
    if (fila.tolerancia.trim() !== '') {
      const t = leerNumero(fila.tolerancia);
      if (t === null || t > TOLERANCIA_MAX) marcar(fila.clave, 'tolerancia', `Entre 0 y ${TOLERANCIA_MAX}.`);
      else tolerancia = Math.round(t * 100) / 100;
    }

    if (!errores.filas[fila.clave] && cant !== null) {
      ingredientes.push({
        materia_prima_id: esIntermedio ? null : idMateria,
        producto_intermedio_id: esIntermedio ? fila.producto_intermedio_id : null,
        cantidad: redondear3(cant),
        tolerancia_porcentaje: tolerancia,
      });
    }
  }

  const f = valores.ficha;
  const erroresFicha: NonNullable<ErroresEditor['ficha']> = {};
  const entero = (texto: string, campo: keyof FichaEditor, max: number, etiqueta: string): number | null => {
    if (texto.trim() === '') return null;
    const n = leerNumero(texto);
    if (n === null || !Number.isInteger(n) || n > max) {
      erroresFicha[campo] = `${etiqueta}: un número entero entre 0 y ${max.toLocaleString('es-CO')}.`;
      return null;
    }
    return n;
  };
  const motivo = f.motivo.replace(/\s+/g, ' ').trim();
  if (motivo.length > MOTIVO_MAX) erroresFicha.motivo = `Máximo ${MOTIVO_MAX} caracteres.`;
  const procedimiento = f.procedimiento.replace(/\r\n?/g, '\n').trim();
  if (procedimiento.length > PROCEDIMIENTO_MAX) erroresFicha.procedimiento = `Máximo ${PROCEDIMIENTO_MAX.toLocaleString('es-CO')} caracteres (van ${procedimiento.length.toLocaleString('es-CO')}).`;
  const tiempoPreparacion = entero(f.tiempoPreparacion, 'tiempoPreparacion', TIEMPO_MAX_MIN, 'Minutos');
  const tiempoHorneado = entero(f.tiempoHorneado, 'tiempoHorneado', TIEMPO_MAX_MIN, 'Minutos');
  const temperatura = entero(f.temperatura, 'temperatura', TEMPERATURA_MAX_C, 'Grados');
  let merma: number | null = null;
  if (f.merma.trim() !== '') {
    const m = leerNumero(f.merma);
    if (m === null || m > MERMA_HORNEADO_MAX) erroresFicha.merma = `Un porcentaje entre 0 y ${MERMA_HORNEADO_MAX}.`;
    else merma = Math.round(m * 100) / 100;
  }
  if (Object.keys(erroresFicha).length > 0) errores.ficha = erroresFicha;

  if (errores.rendimiento || errores.general || errores.ficha || Object.keys(errores.filas).length > 0 || rend === null) {
    return { ok: false, errores };
  }
  return {
    ok: true,
    datos: {
      rendimiento: redondear3(rend),
      ingredientes,
      // Siempre se envían: lo que se deja vacío se borra en la versión nueva
      motivo_cambio: motivo === '' ? null : motivo,
      procedimiento: procedimiento === '' ? null : procedimiento,
      tiempo_preparacion_min: tiempoPreparacion,
      tiempo_horneado_min: tiempoHorneado,
      temperatura_horneado_c: temperatura,
      merma_horneado_pct: merma,
    },
  };
}

// Nombre del producto nuevo: sin espacios sobrantes (igual que el servidor)
export function validarNombreProducto(texto: string): { ok: true; nombre: string } | { ok: false; error: string } {
  const nombre = texto.trim().replace(/\s+/g, ' ');
  if (nombre.length < NOMBRE_PRODUCTO_MIN || nombre.length > NOMBRE_PRODUCTO_MAX) {
    return { ok: false, error: `El nombre debe tener entre ${NOMBRE_PRODUCTO_MIN} y ${NOMBRE_PRODUCTO_MAX} caracteres.` };
  }
  return { ok: true, nombre };
}

// Precio de venta: vacío = sin precio (null); si no, un número entre 0 y el máximo
export function validarPrecioVenta(texto: string): { ok: true; valor: number | null } | { ok: false; error: string } {
  if (texto.trim() === '') return { ok: true, valor: null };
  const n = leerNumero(texto);
  if (n === null || n > PRECIO_VENTA_MAX) {
    return { ok: false, error: `Escribe un precio entre 0 y ${PRECIO_VENTA_MAX.toLocaleString('es-CO')} (sin separador de miles; coma o punto para decimales).` };
  }
  return { ok: true, valor: Math.round(n * 100) / 100 };
}
