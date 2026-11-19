import type { FormulacionDetalle, IngredienteFormulacion } from '../../types/formulacion.types';

export type EstadoCambio = 'agregado' | 'quitado' | 'cambiado' | 'igual';

export interface CambioIngrediente {
  clave: string;
  nombre: string;
  unidad: string;
  estado: EstadoCambio;
  antes: number | null;
  despues: number | null;
  // Variación de la cantidad en %; null si el ingrediente no está en una de las dos versiones
  variacion_pct: number | null;
  tolerancia_antes: number | null;
  tolerancia_despues: number | null;
  costo_antes: number | null;
  costo_despues: number | null;
  // Cuánto cambia el costo del lote por este ingrediente (null si falta algún costo)
  efecto_costo: number | null;
}

export interface CambioFicha {
  campo: 'procedimiento' | 'tiempo_preparacion_min' | 'tiempo_horneado_min' | 'temperatura_horneado_c' | 'merma_horneado_pct';
  etiqueta: string;
  antes: string | number | null;
  despues: string | number | null;
}

export interface Comparacion {
  ingredientes: CambioIngrediente[];
  conteo: Record<EstadoCambio, number>;
  rendimiento: { antes: number | null; despues: number | null };
  peso_lote: { antes: number; despues: number };
  costo_lote: { antes: number | null; despues: number | null };
  costo_unidad: { antes: number | null; despues: number | null };
  ficha: CambioFicha[];
  hay_cambios: boolean;
}

const clave = (i: IngredienteFormulacion) => `${i.tipo}:${i.materia_prima_id ?? i.producto_intermedio_id ?? i.nombre}`;
const casiIgual = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-9);
const texto = (t: string | null) => (t ?? '').replace(/\r\n?/g, '\n').trim();

const CAMPOS_FICHA: { campo: CambioFicha['campo']; etiqueta: string }[] = [
  { campo: 'procedimiento', etiqueta: 'Procedimiento' },
  { campo: 'tiempo_preparacion_min', etiqueta: 'Tiempo de preparación (min)' },
  { campo: 'tiempo_horneado_min', etiqueta: 'Tiempo de horneado (min)' },
  { campo: 'temperatura_horneado_c', etiqueta: 'Temperatura de horneado (°C)' },
  { campo: 'merma_horneado_pct', etiqueta: 'Merma al hornear (%)' },
];

// Qué cambió de una versión a otra. Los costos de las dos versiones se calculan con los precios de hoy,
// así que la diferencia de costo se debe solo a la receta, no a que los precios hayan variado.
export function compararVersiones(antes: FormulacionDetalle, despues: FormulacionDetalle): Comparacion {
  const previas = new Map(antes.ingredientes.map((i) => [clave(i), i]));
  const nuevas = new Map(despues.ingredientes.map((i) => [clave(i), i]));
  const claves = [...new Set([...previas.keys(), ...nuevas.keys()])];

  const ingredientes: CambioIngrediente[] = claves.map((k) => {
    const a = previas.get(k) ?? null;
    const d = nuevas.get(k) ?? null;
    const base = (d ?? a) as IngredienteFormulacion;
    const estado: EstadoCambio = !a ? 'agregado' : !d ? 'quitado' : casiIgual(a.cantidad, d.cantidad) && casiIgual(a.tolerancia_porcentaje, d.tolerancia_porcentaje) ? 'igual' : 'cambiado';
    const costoAntes = a ? a.costo : 0;
    const costoDespues = d ? d.costo : 0;
    return {
      clave: k,
      nombre: base.nombre,
      unidad: base.unidad,
      estado,
      antes: a ? a.cantidad : null,
      despues: d ? d.cantidad : null,
      variacion_pct: a && d && a.cantidad > 0 ? ((d.cantidad - a.cantidad) / a.cantidad) * 100 : null,
      tolerancia_antes: a ? a.tolerancia_porcentaje : null,
      tolerancia_despues: d ? d.tolerancia_porcentaje : null,
      costo_antes: a ? a.costo : null,
      costo_despues: d ? d.costo : null,
      efecto_costo: costoAntes === null || costoDespues === null ? null : costoDespues - costoAntes,
    };
  });

  const peso = { agregado: 0, quitado: 1, cambiado: 2, igual: 3 } as const;
  ingredientes.sort((x, y) => peso[x.estado] - peso[y.estado] || Math.abs(y.efecto_costo ?? 0) - Math.abs(x.efecto_costo ?? 0) || x.nombre.localeCompare(y.nombre, 'es'));

  const conteo: Record<EstadoCambio, number> = { agregado: 0, quitado: 0, cambiado: 0, igual: 0 };
  ingredientes.forEach((i) => (conteo[i.estado] += 1));

  const ficha: CambioFicha[] = [];
  for (const { campo, etiqueta } of CAMPOS_FICHA) {
    const a = campo === 'procedimiento' ? texto(antes.procedimiento) || null : antes[campo];
    const d = campo === 'procedimiento' ? texto(despues.procedimiento) || null : despues[campo];
    if (a !== d) ficha.push({ campo, etiqueta, antes: a, despues: d });
  }

  const rendimiento = { antes: antes.rendimiento, despues: despues.rendimiento };
  return {
    ingredientes,
    conteo,
    rendimiento,
    peso_lote: { antes: antes.peso_lote_g, despues: despues.peso_lote_g },
    costo_lote: { antes: antes.costo_lote, despues: despues.costo_lote },
    costo_unidad: { antes: antes.costo_unidad, despues: despues.costo_unidad },
    ficha,
    hay_cambios: conteo.agregado + conteo.quitado + conteo.cambiado > 0 || !casiIgual(rendimiento.antes, rendimiento.despues) || ficha.length > 0,
  };
}
