import { describe, expect, test } from 'vitest';
import { aGramos, calcularBalance, type EntradaBalance } from '../src/utils/balance';

const base = (extra: Partial<EntradaBalance> = {}): EntradaBalance => ({
  insumos: [],
  mermas: [],
  producida: null,
  planificada: null,
  ...extra,
});

describe('aGramos', () => {
  test('gramos y kilos se convierten; otras unidades no', () => {
    expect(aGramos(250, 'g')).toBe(250);
    expect(aGramos(1.5, 'kg')).toBe(1500);
    expect(aGramos(3, 'und')).toBeNull();
    expect(aGramos(3, 'l')).toBeNull();
    expect(aGramos(3, null)).toBeNull();
  });
});

describe('calcularBalance: insumos', () => {
  test('suma gramos y kilos, calcula porcentajes y ordena de mayor a menor', () => {
    const b = calcularBalance(
      base({
        insumos: [
          { materia_prima_id: 'a', nombre: 'Azúcar', unidad: 'g', peso_real: 100 },
          { materia_prima_id: 'h', nombre: 'Harina', unidad: 'kg', peso_real: 0.7 },
          { materia_prima_id: 'w', nombre: 'Agua', unidad: 'g', peso_real: 200 },
        ],
      }),
    );
    expect(b.insumos_g).toBe(1000);
    expect(b.insumos.map((i) => [i.nombre, i.gramos, i.porcentaje])).toEqual([
      ['Harina', 700, 70],
      ['Agua', 200, 20],
      ['Azúcar', 100, 10],
    ]);
    expect(b.sin_masa).toEqual([]);
  });

  test('un insumo en unidades queda aparte y no entra a la suma', () => {
    const b = calcularBalance(
      base({
        insumos: [
          { materia_prima_id: 'h', nombre: 'Harina', unidad: 'g', peso_real: 500 },
          { materia_prima_id: 'e', nombre: 'Huevos', unidad: 'und', peso_real: 12 },
          { materia_prima_id: 'x', nombre: 'Anís', unidad: null, peso_real: 5 },
        ],
      }),
    );
    expect(b.insumos_g).toBe(500);
    expect(b.sin_masa).toEqual(['Anís', 'Huevos']);
    expect(b.insumos).toHaveLength(1);
  });

  test('sin insumos todo queda en cero y sin porcentaje de merma', () => {
    const b = calcularBalance(base());
    expect(b).toMatchObject({ insumos_g: 0, merma_total_g: 0, merma_pct: null, rendimiento_pct: null });
    expect(b.insumos).toEqual([]);
    expect(b.por_causa).toEqual([]);
  });

  test('desempata por nombre cuando pesan lo mismo', () => {
    const b = calcularBalance(
      base({
        insumos: [
          { materia_prima_id: 'b', nombre: 'Sal', unidad: 'g', peso_real: 10 },
          { materia_prima_id: 'a', nombre: 'Anís', unidad: 'g', peso_real: 10 },
        ],
      }),
    );
    expect(b.insumos.map((i) => i.nombre)).toEqual(['Anís', 'Sal']);
  });
});

describe('calcularBalance: mermas', () => {
  const insumos = [{ materia_prima_id: 'h', nombre: 'Harina', unidad: 'g', peso_real: 1000 }];

  test('merma de masa: porcentaje sobre lo usado', () => {
    const b = calcularBalance(base({ insumos, mermas: [{ cantidad: 50, unidad: null, con_lote: false, causa: 'Quemado' }] }));
    expect(b.merma_masa_g).toBe(50);
    expect(b.merma_insumo_g).toBe(0);
    expect(b.merma_total_g).toBe(50);
    expect(b.merma_pct).toBe(5);
  });

  test('merma de insumo de un lote: entra a la base y al total', () => {
    const b = calcularBalance(base({ insumos, mermas: [{ cantidad: 0.25, unidad: 'kg', con_lote: true, causa: 'Derrame' }] }));
    expect(b.merma_insumo_g).toBe(250);
    expect(b.merma_total_g).toBe(250);
    // 250 / (1000 + 250) = 20 %
    expect(b.merma_pct).toBe(20);
  });

  test('mezcla de las dos y desglose por causa ordenado', () => {
    const b = calcularBalance(
      base({
        insumos,
        mermas: [
          { cantidad: 30, unidad: null, con_lote: false, causa: 'Quemado' },
          { cantidad: 20, unidad: null, con_lote: false, causa: 'Masa pasada' },
          { cantidad: 50, unidad: 'g', con_lote: true, causa: 'Quemado' },
        ],
      }),
    );
    expect(b.merma_masa_g).toBe(50);
    expect(b.merma_insumo_g).toBe(50);
    expect(b.merma_total_g).toBe(100);
    expect(b.merma_pct).toBe(9.52); // 100 / 1050
    expect(b.por_causa).toEqual([
      { causa: 'Quemado', gramos: 80 },
      { causa: 'Masa pasada', gramos: 20 },
    ]);
  });

  test('una merma en unidad que no es masa se ignora', () => {
    const b = calcularBalance(base({ insumos, mermas: [{ cantidad: 3, unidad: 'und', con_lote: true, causa: 'Rotura' }] }));
    expect(b.merma_total_g).toBe(0);
    expect(b.merma_pct).toBe(0);
    expect(b.por_causa).toEqual([]);
  });

  test('sin insumos pero con merma de insumo la base es lo perdido (100 %)', () => {
    const b = calcularBalance(base({ mermas: [{ cantidad: 40, unidad: 'g', con_lote: true, causa: 'Vencimiento' }] }));
    expect(b.merma_pct).toBe(100);
  });

  test('sin insumos y con merma de masa no hay base: el porcentaje es nulo', () => {
    const b = calcularBalance(base({ mermas: [{ cantidad: 40, unidad: null, con_lote: false, causa: 'Quemado' }] }));
    expect(b.merma_total_g).toBe(40);
    expect(b.merma_pct).toBeNull();
  });

  test('redondea sin arrastrar errores de coma flotante', () => {
    const b = calcularBalance(
      base({
        insumos: [{ materia_prima_id: 'a', nombre: 'A', unidad: 'g', peso_real: 0.1 }, { materia_prima_id: 'b', nombre: 'B', unidad: 'g', peso_real: 0.2 }],
      }),
    );
    expect(b.insumos_g).toBe(0.3);
  });
});

describe('calcularBalance: rendimiento', () => {
  test('producido frente a planificado con un decimal', () => {
    expect(calcularBalance(base({ producida: 6, planificada: 10 })).rendimiento_pct).toBe(60);
    expect(calcularBalance(base({ producida: 1, planificada: 3 })).rendimiento_pct).toBe(33.3);
    expect(calcularBalance(base({ producida: 12, planificada: 10 })).rendimiento_pct).toBe(120);
  });
  test('sin producido o sin plan es nulo', () => {
    expect(calcularBalance(base({ producida: null, planificada: 10 })).rendimiento_pct).toBeNull();
    expect(calcularBalance(base({ producida: 5, planificada: null })).rendimiento_pct).toBeNull();
    expect(calcularBalance(base({ producida: 5, planificada: 0 })).rendimiento_pct).toBeNull();
  });
});
