import { describe, expect, test } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { calcularCostoFormulacion, costoUnitario, LineaCosto } from '../src/utils/costeo';

const redondear = (n: number) => Math.round(n * 100) / 100;

describe('costoUnitario', () => {
  test('divide el precio entre el contenido de la presentación', () => {
    expect(costoUnitario(87150, 50000)).toBeCloseTo(1.743, 10);
  });

  test('sin precio o sin contenido no hay costo (null), nunca 0 ni infinito', () => {
    expect(costoUnitario(0, 1000)).toBeNull();
    expect(costoUnitario(5000, 0)).toBeNull();
    expect(costoUnitario(-10, 100)).toBeNull();
    expect(costoUnitario(100, -5)).toBeNull();
  });
});

describe('calcularCostoFormulacion', () => {
  test('suma el peso y el costo de cada ingrediente', () => {
    const r = calcularCostoFormulacion([
      { cantidad: 1000, costo_por_unidad: 2 },
      { cantidad: 500, costo_por_unidad: 4 },
    ]);
    expect(r).toEqual({ peso: 1500, costo: 4000, incompleto: false });
  });

  test('un ingrediente sin costo marca la fórmula como incompleta y no se inventa su valor', () => {
    const r = calcularCostoFormulacion([
      { cantidad: 1000, costo_por_unidad: 2 },
      { cantidad: 705, costo_por_unidad: null },
    ]);
    expect(r.incompleto).toBe(true);
    expect(r.peso).toBe(1705);
    expect(r.costo).toBe(2000);
  });

  test('sin ingredientes: peso 0, costo 0 y completa', () => {
    expect(calcularCostoFormulacion([])).toEqual({ peso: 0, costo: 0, incompleto: false });
  });
});

// Pruebas con los datos reales del piloto (prisma/catalogo_piloto.json), sin base de datos.
// El costo por gramo de cada insumo sale de su presentación más grande, igual que la API.
type Dato = {
  materias_primas: { codigo: string; presentaciones: { gramos: number; precio: number }[] }[];
  productos: {
    nombre: string;
    rendimiento: number;
    ingredientes: { mp: string; gramos: number }[];
    extra_intermedio: { nombre: string; gramos: number } | null;
  }[];
};

const datos: Dato = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'prisma', 'catalogo_piloto.json'), 'utf-8'),
);

const costoPorGramo = new Map<string, number | null>(
  datos.materias_primas.map((m) => {
    const mayor = [...m.presentaciones].sort((a, b) => b.gramos - a.gramos)[0];
    return [m.codigo, mayor ? costoUnitario(mayor.precio, mayor.gramos) : null];
  }),
);

function lineasDe(producto: Dato['productos'][number]): LineaCosto[] {
  const lineas: LineaCosto[] = producto.ingredientes.map((i) => ({
    cantidad: i.gramos,
    costo_por_unidad: costoPorGramo.get(i.mp) ?? null,
  }));
  // El producto intermedio no tiene formulación propia: entra sin costo
  if (producto.extra_intermedio) lineas.push({ cantidad: producto.extra_intermedio.gramos, costo_por_unidad: null });
  return lineas;
}

const producto = (nombre: string) => {
  const p = datos.productos.find((x) => x.nombre === nombre);
  if (!p) throw new Error(`No existe el producto ${nombre}`);
  return p;
};

describe('costeo con los datos reales del piloto', () => {
  test('Pambaso: $17.962,86 por lote y $124,74 por unidad (coincide con el Excel)', () => {
    const p = producto('Pambaso');
    const r = calcularCostoFormulacion(lineasDe(p));
    expect(r.incompleto).toBe(false);
    expect(redondear(r.peso)).toBe(6662);
    expect(redondear(r.costo)).toBe(17962.86);
    expect(redondear(r.costo / p.rendimiento)).toBe(124.74);
  });

  test('Pan relleno de queso: costo incompleto por la masa añadida y peso de 8.402,26 g', () => {
    const r = calcularCostoFormulacion(lineasDe(producto('Pan relleno de queso')));
    expect(r.incompleto).toBe(true);
    expect(redondear(r.peso)).toBe(8402.26);
  });

  test('las 32 formulaciones tienen peso y rendimiento; solo Pan relleno de queso es incompleta', () => {
    expect(datos.productos).toHaveLength(32);
    const incompletas: string[] = [];
    for (const p of datos.productos) {
      const r = calcularCostoFormulacion(lineasDe(p));
      expect(r.peso).toBeGreaterThan(0);
      expect(p.rendimiento).toBeGreaterThan(0);
      expect(Number.isFinite(r.costo)).toBe(true);
      if (r.incompleto) incompletas.push(p.nombre);
      else expect(r.costo).toBeGreaterThan(0);
    }
    expect(incompletas).toEqual(['Pan relleno de queso']);
  });

  test('las 41 materias primas tienen costo por gramo', () => {
    expect(costoPorGramo.size).toBe(41);
    expect([...costoPorGramo.values()].every((c) => c !== null && c > 0)).toBe(true);
  });
});
