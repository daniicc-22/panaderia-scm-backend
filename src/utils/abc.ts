// Clasificación ABC (Pareto). Función pura: no consulta la base de datos ni lee archivos,
// por eso se puede probar sola.

export const LIMITE_A = 80;
export const LIMITE_B = 95;

export type ClaseAbc = 'A' | 'B' | 'C';

export interface FilaAbc {
  codigo: string;
  nombre: string;
  demanda_anual_g: number;
  costo_por_g: number;
  valor_anual: number;
}

export const redondear = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function clasificarAbc(filasEntrada: FilaAbc[]) {
  // Se ordena una copia: la lista recibida no se modifica
  const filas = [...filasEntrada].sort((a, b) => b.valor_anual - a.valor_anual);
  const total = filas.reduce((s, f) => s + f.valor_anual, 0);

  // Clase según el acumulado ANTES de sumar el insumo:
  // el que cruza el 80 % sigue siendo A.
  let acumulado = 0;
  const items = filas.map((f) => {
    const clase: ClaseAbc = acumulado < LIMITE_A ? 'A' : acumulado < LIMITE_B ? 'B' : 'C';
    const porcentaje = total > 0 ? (f.valor_anual / total) * 100 : 0;
    acumulado += porcentaje;
    return {
      codigo: f.codigo,
      nombre: f.nombre,
      demanda_anual_kg: redondear(f.demanda_anual_g / 1000),
      costo_por_kg: redondear(f.costo_por_g * 1000),
      valor_anual: redondear(f.valor_anual),
      porcentaje: redondear(porcentaje),
      porcentaje_acumulado: redondear(acumulado),
      clase,
    };
  });

  const resumen = (['A', 'B', 'C'] as const).map((clase) => {
    const grupo = items.filter((i) => i.clase === clase);
    const valor = grupo.reduce((s, i) => s + i.valor_anual, 0);
    return {
      clase,
      insumos: grupo.length,
      valor_anual: redondear(valor),
      porcentaje: total > 0 ? redondear((valor / total) * 100) : 0,
    };
  });

  return { total, items, resumen };
}
