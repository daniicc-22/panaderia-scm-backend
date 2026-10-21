// Cálculo del costo de una formulación. Funciones puras: no consultan la base de datos,
// por eso se pueden probar solas.

export interface LineaCosto {
  cantidad: number; // cantidad estándar del ingrediente en el lote (g)
  costo_por_unidad: number | null; // costo por gramo; null si no hay precio (o es un producto intermedio)
}

// Costo por unidad base (g) de una presentación: precio / contenido.
// Sin precio o sin contenido válido no hay costo (null), nunca 0 ni infinito.
export function costoUnitario(precio: number, contenido: number): number | null {
  return contenido > 0 && precio > 0 ? precio / contenido : null;
}

// Peso, costo del lote y bandera de costo incompleto.
// Si algún ingrediente no tiene costo, el costo queda incompleto: no se inventa un valor.
export function calcularCostoFormulacion(lineas: LineaCosto[]) {
  let costo = 0;
  let peso = 0;
  let incompleto = false;
  for (const l of lineas) {
    peso += l.cantidad;
    if (l.costo_por_unidad == null) incompleto = true;
    else costo += l.costo_por_unidad * l.cantidad;
  }
  return { peso, costo, incompleto };
}
