import { describe, expect, test } from 'vitest';
import { clasificarAbc, FilaAbc, redondear } from '../src/utils/abc';

// Crea insumos cuyo valor anual es el indicado (demanda 1000 g; el costo por gramo se deduce)
const insumos = (valores: number[]): FilaAbc[] =>
  valores.map((v, i) => ({
    codigo: `MP-${i + 1}`,
    nombre: `Insumo ${i + 1}`,
    demanda_anual_g: 1000,
    costo_por_g: v / 1000,
    valor_anual: v,
  }));

const clases = (valores: number[]) => clasificarAbc(insumos(valores)).items.map((i) => i.clase).join('');

describe('clasificarAbc: reglas de clasificación', () => {
  test('el insumo que cruza el 80 % sigue siendo A (decide el acumulado previo)', () => {
    // 79,99 % + 10,01 % + 10 %: el segundo cruza el 80 % pero entra con 79,99 % acumulado
    expect(clases([79.99, 10, 10.01])).toBe('AAB');
  });

  test('con exactamente 80 % acumulado antes del insumo, este ya es B', () => {
    expect(clases([80, 15, 5])).toBe('ABC');
  });

  test('con 95 % acumulado antes del insumo, este ya es C', () => {
    expect(clases([60, 25, 10, 3, 2])).toBe('AABCC');
  });

  test('un solo insumo es A y pesa el 100 %', () => {
    const r = clasificarAbc(insumos([500]));
    expect(r.items).toHaveLength(1);
    expect(r.items[0].clase).toBe('A');
    expect(r.items[0].porcentaje).toBe(100);
  });
});

describe('clasificarAbc: orden y totales', () => {
  test('ordena de mayor a menor valor anual', () => {
    const r = clasificarAbc(insumos([5, 50, 20, 1]));
    expect(r.items.map((i) => i.valor_anual)).toEqual([50, 20, 5, 1]);
  });

  test('el porcentaje acumulado termina en 100 y los porcentajes suman 100', () => {
    const r = clasificarAbc(insumos([13.7, 42.1, 8.25, 30.4, 5.55]));
    const suma = r.items.reduce((s, i) => s + i.porcentaje, 0);
    expect(Math.abs(suma - 100)).toBeLessThan(0.05);
    expect(r.items[r.items.length - 1].porcentaje_acumulado).toBe(100);
  });

  test('el total es la suma de los valores anuales', () => {
    expect(clasificarAbc(insumos([10, 20, 30])).total).toBe(60);
  });

  test('el resumen cuenta todos los insumos y reparte todo el valor', () => {
    const r = clasificarAbc(insumos([60, 25, 10, 3, 2]));
    expect(r.resumen.map((x) => x.clase)).toEqual(['A', 'B', 'C']);
    expect(r.resumen.map((x) => x.insumos)).toEqual([2, 1, 2]);
    expect(r.resumen.reduce((s, x) => s + x.valor_anual, 0)).toBe(100);
    expect(r.resumen.reduce((s, x) => s + x.porcentaje, 0)).toBe(100);
  });
});

describe('clasificarAbc: conversiones y casos límite', () => {
  test('convierte la demanda a kg y el costo a pesos por kg', () => {
    const r = clasificarAbc([
      { codigo: 'MP-1', nombre: 'Harina', demanda_anual_g: 2_500_000, costo_por_g: 3.2, valor_anual: 2_500_000 * 3.2 },
    ]);
    expect(r.items[0].demanda_anual_kg).toBe(2500);
    expect(r.items[0].costo_por_kg).toBe(3200);
    expect(r.items[0].valor_anual).toBe(8_000_000);
  });

  test('lista vacía: total 0, sin items y resumen en cero', () => {
    const r = clasificarAbc([]);
    expect(r.total).toBe(0);
    expect(r.items).toEqual([]);
    expect(r.resumen).toEqual([
      { clase: 'A', insumos: 0, valor_anual: 0, porcentaje: 0 },
      { clase: 'B', insumos: 0, valor_anual: 0, porcentaje: 0 },
      { clase: 'C', insumos: 0, valor_anual: 0, porcentaje: 0 },
    ]);
  });

  test('si todos valen 0 no divide por cero: los porcentajes quedan en 0', () => {
    const r = clasificarAbc(insumos([0, 0]));
    expect(r.total).toBe(0);
    expect(r.items.every((i) => i.porcentaje === 0 && Number.isFinite(i.porcentaje_acumulado))).toBe(true);
  });

  test('no modifica la lista recibida', () => {
    const entrada = insumos([5, 50, 20]);
    const copia = entrada.map((f) => ({ ...f }));
    clasificarAbc(entrada);
    expect(entrada).toEqual(copia);
  });
});

describe('redondear', () => {
  test('redondea a 2 decimales por defecto y acepta otra cantidad', () => {
    expect(redondear(1.005 + 0.0049)).toBe(1.01);
    expect(redondear(2.34567, 3)).toBe(2.346);
    expect(redondear(7)).toBe(7);
  });
});
