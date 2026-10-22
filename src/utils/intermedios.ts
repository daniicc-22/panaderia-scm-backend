// Productos intermedios (masa base, galleta): un ingrediente que a su vez tiene receta propia.
// Funciones puras: no consultan la base de datos, por eso se prueban solas.
//
// Regla: una línea de intermedio trae gramos del intermedio. Esos gramos se reparten en las materias
// primas de su receta vigente en proporción a su peso (cantidad de la línea / peso de la receta).

export interface LineaReceta {
  materia_prima_id: string | null;
  producto_intermedio_id: string | null;
  cantidad: number; // gramos
}

// Receta vigente de cada producto (clave: id del producto)
export type Recetas = ReadonlyMap<string, readonly LineaReceta[]>;

export interface Expansion {
  // Gramos de cada materia prima, ya repartidos desde los intermedios
  materias: Map<string, number>;
  // Intermedios que no tienen receta vigente (o con peso cero): su costo y su demanda no se pueden calcular
  sin_receta: Set<string>;
  // Intermedios que se contienen a sí mismos (A usa B y B usa A)
  ciclos: Set<string>;
}

export const pesoReceta = (lineas: readonly LineaReceta[]) => lineas.reduce((s, l) => s + l.cantidad, 0);

// Líneas tal como salen de la base (la cantidad llega como Decimal) a gramos como número
export function aLineasReceta(
  detalle: readonly { materia_prima_id: string | null; producto_intermedio_id: string | null; cantidad_estandar: unknown }[],
): LineaReceta[] {
  return detalle.map((d) => ({
    materia_prima_id: d.materia_prima_id,
    producto_intermedio_id: d.producto_intermedio_id,
    cantidad: Number(d.cantidad_estandar),
  }));
}

function recorrer(
  lineas: readonly LineaReceta[],
  factor: number,
  ruta: readonly string[],
  recetas: Recetas,
  res: Expansion,
) {
  for (const l of lineas) {
    const gramos = l.cantidad * factor;
    if (l.materia_prima_id) {
      res.materias.set(l.materia_prima_id, (res.materias.get(l.materia_prima_id) ?? 0) + gramos);
      continue;
    }
    const id = l.producto_intermedio_id;
    if (!id) continue;
    if (ruta.includes(id)) {
      res.ciclos.add(id);
      continue;
    }
    const receta = recetas.get(id);
    const peso = receta ? pesoReceta(receta) : 0;
    if (!receta || peso <= 0) {
      res.sin_receta.add(id);
      continue;
    }
    recorrer(receta, gramos / peso, [...ruta, id], recetas, res);
  }
}

// Materias primas que hay detrás de unas líneas. `raiz` es el producto dueño de las líneas
// (sirve para detectar que un intermedio se use a sí mismo); `factor` escala todas las cantidades.
export function expandirLineas(
  lineas: readonly LineaReceta[],
  recetas: Recetas,
  raiz: string | null = null,
  factor = 1,
): Expansion {
  const res: Expansion = { materias: new Map(), sin_receta: new Set(), ciclos: new Set() };
  recorrer(lineas, factor, raiz ? [raiz] : [], recetas, res);
  return res;
}

// Costo de una expansión con el costo por gramo de cada materia prima (null = sin precio).
// Si falta un precio, una receta o hay un ciclo, el costo queda incompleto: no se inventa un valor.
export function costoDeExpansion(exp: Expansion, costosPorGramo: ReadonlyMap<string, number | null>) {
  let costo = 0;
  let incompleto = exp.sin_receta.size > 0 || exp.ciclos.size > 0;
  for (const [id, gramos] of exp.materias) {
    const c = costosPorGramo.get(id);
    if (c == null) incompleto = true;
    else costo += c * gramos;
  }
  return { costo, incompleto };
}

// Peso, costo e indicador de costo incompleto de unas líneas, con los intermedios ya repartidos.
// `raiz` es el producto dueño de las líneas.
export function costearLineas(
  lineas: readonly LineaReceta[],
  recetas: Recetas,
  raiz: string | null,
  costosPorGramo: ReadonlyMap<string, number | null>,
) {
  const { costo, incompleto } = costoDeExpansion(expandirLineas(lineas, recetas, raiz), costosPorGramo);
  return { peso: pesoReceta(lineas), costo, incompleto };
}

export interface FormulacionDemanda {
  producto_id: string;
  es_intermedio: boolean;
  lotes_por_semana: number;
  lineas: readonly LineaReceta[];
}

// Ids de los intermedios que usa alguna de las formulaciones recibidas
export function intermediosUsados(formulaciones: readonly { lineas: readonly LineaReceta[] }[]): Set<string> {
  const usados = new Set<string>();
  for (const f of formulaciones) {
    for (const l of f.lineas) if (l.producto_intermedio_id) usados.add(l.producto_intermedio_id);
  }
  return usados;
}

// Demanda anual (g) por materia prima. Un intermedio que alguien usa cuenta solo por ese camino
// (según cuánto lleva cada lote del producto que lo usa) y no también como producción aparte;
// uno que nadie usa se cuenta por su cuenta, como cualquier producto.
// `sin_receta` junta los intermedios usados que no tienen receta vigente: su demanda no se puede
// repartir, y la demanda de las materias primas que llevan queda por debajo de la real.
export function demandaAnualPorMateria(
  formulaciones: readonly FormulacionDemanda[],
  recetas: Recetas,
  semanasAlAnio: number,
) {
  const usados = intermediosUsados(formulaciones);
  const demanda = new Map<string, number>();
  const sin_receta = new Set<string>();
  const ciclos = new Set<string>();
  for (const f of formulaciones) {
    if (f.es_intermedio && usados.has(f.producto_id)) continue;
    const e = expandirLineas(f.lineas, recetas, f.producto_id, f.lotes_por_semana * semanasAlAnio);
    for (const [id, g] of e.materias) demanda.set(id, (demanda.get(id) ?? 0) + g);
    e.sin_receta.forEach((id) => sin_receta.add(id));
    e.ciclos.forEach((id) => ciclos.add(id));
  }
  return { demanda, sin_receta, ciclos };
}
