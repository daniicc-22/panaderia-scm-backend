// Balance de masas de una producción (HU-18), sin acceso a base de datos.
// Todo se expresa en gramos. Solo se suman cantidades en gramos o kilogramos: lo demás (unidades, litros)
// no se puede convertir a masa y se lista aparte para que no falsee el balance.

const redondear = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/** Convierte una cantidad a gramos. Nulo si la unidad no es de masa. */
export function aGramos(cantidad: number, unidad: string | null): number | null {
  if (unidad === 'g') return cantidad;
  if (unidad === 'kg') return cantidad * 1000;
  return null;
}

export interface InsumoBalance {
  materia_prima_id: string;
  nombre: string;
  unidad: string | null;
  peso_real: number; // en la unidad del insumo
}

export interface MermaBalance {
  cantidad: number; // en la unidad del insumo si tiene lote; en gramos si es solo de la producción
  unidad: string | null;
  con_lote: boolean; // true: se perdió insumo del lote durante la producción; false: se perdió masa ya mezclada
  causa: string;
}

export interface EntradaBalance {
  insumos: InsumoBalance[];
  mermas: MermaBalance[];
  producida: number | null;
  planificada: number | null;
}

export interface Balance {
  insumos_g: number;
  insumos: { materia_prima_id: string; nombre: string; gramos: number; porcentaje: number }[];
  sin_masa: string[]; // insumos que no están en gramos ni kilos y por eso no entran al balance
  merma_masa_g: number; // masa ya mezclada que se perdió (quemado, masa pasada)
  merma_insumo_g: number; // insumo de un lote que se perdió durante esa producción
  merma_total_g: number;
  merma_pct: number | null; // merma total / (insumos usados + insumo perdido) × 100
  por_causa: { causa: string; gramos: number }[];
  rendimiento_pct: number | null;
}

/** Une insumos usados, mermas y unidades producidas en un solo balance. */
export function calcularBalance(entrada: EntradaBalance): Balance {
  const sinMasa: string[] = [];
  const lineas: { materia_prima_id: string; nombre: string; gramos: number }[] = [];
  for (const i of entrada.insumos) {
    const g = aGramos(i.peso_real, i.unidad);
    if (g === null) sinMasa.push(i.nombre);
    else lineas.push({ materia_prima_id: i.materia_prima_id, nombre: i.nombre, gramos: redondear(g) });
  }
  const insumosG = redondear(lineas.reduce((s, l) => s + l.gramos, 0));

  let masa = 0;
  let insumo = 0;
  const causas = new Map<string, number>();
  for (const m of entrada.mermas) {
    const g = aGramos(m.cantidad, m.unidad ?? 'g');
    if (g === null) continue;
    if (m.con_lote) insumo += g;
    else masa += g;
    causas.set(m.causa, (causas.get(m.causa) ?? 0) + g);
  }
  const mermaMasa = redondear(masa);
  const mermaInsumo = redondear(insumo);
  const total = redondear(mermaMasa + mermaInsumo);
  // Lo que salió del almacén para esta producción: lo usado más lo que se perdió antes de usarse
  const base = insumosG + mermaInsumo;

  return {
    insumos_g: insumosG,
    insumos: lineas
      .map((l) => ({ ...l, porcentaje: insumosG > 0 ? Math.round((l.gramos / insumosG) * 1000) / 10 : 0 }))
      .sort((a, b) => b.gramos - a.gramos || a.nombre.localeCompare(b.nombre, 'es')),
    sin_masa: sinMasa.sort((a, b) => a.localeCompare(b, 'es')),
    merma_masa_g: mermaMasa,
    merma_insumo_g: mermaInsumo,
    merma_total_g: total,
    merma_pct: base > 0 ? Math.round((total / base) * 10000) / 100 : null,
    por_causa: [...causas.entries()]
      .map(([causa, g]) => ({ causa, gramos: redondear(g) }))
      .sort((a, b) => b.gramos - a.gramos || a.causa.localeCompare(b.causa, 'es')),
    rendimiento_pct:
      entrada.producida !== null && entrada.planificada !== null && entrada.planificada > 0
        ? Math.round((entrada.producida / entrada.planificada) * 1000) / 10
        : null,
  };
}
