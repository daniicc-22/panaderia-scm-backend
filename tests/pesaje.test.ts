import { describe, expect, test } from 'vitest';
import {
  PESO_MAX,
  aplicarPesos,
  avisoRendimiento,
  desviacionPct,
  rendimientoPct,
  validarFinalizacion,
  validarPesos,
} from '../src/utils/pesaje';

const H = '22222222-2222-4222-8222-222222222221';
const A = '22222222-2222-4222-8222-222222222222';
const L = '22222222-2222-4222-8222-222222222223';

const ok = (r: ReturnType<typeof validarPesos>) => {
  if (!r.ok) throw new Error(`se esperaba ok: ${r.errores.join(' ')}`);
  return r.datos;
};

describe('validarPesos', () => {
  test('sin lista (ausente o nula) nada se pesó', () => {
    expect(ok(validarPesos(undefined)).size).toBe(0);
    expect(ok(validarPesos(null)).size).toBe(0);
    expect(ok(validarPesos([])).size).toBe(0);
  });

  test('acepta pesos válidos y redondea a 3 decimales', () => {
    const m = ok(validarPesos([{ materia_prima_id: H, peso_real: 330.12345 }, { materia_prima_id: A, peso_real: PESO_MAX }]));
    expect(m.get(H)).toBe(330.123);
    expect(m.get(A)).toBe(PESO_MAX);
  });

  test('un peso nulo o ausente es «al ojo»: el insumo no entra al mapa', () => {
    const m = ok(validarPesos([{ materia_prima_id: H, peso_real: null }, { materia_prima_id: A }, { materia_prima_id: L, peso_real: 5 }]));
    expect([...m.keys()]).toEqual([L]);
  });

  test('rechaza lo que no es una lista, ni elementos con otro formato', () => {
    expect(validarPesos({}).ok).toBe(false);
    expect(validarPesos('x').ok).toBe(false);
    expect(validarPesos([1]).ok).toBe(false);
    expect(validarPesos([null]).ok).toBe(false);
    expect(validarPesos([[H, 5]]).ok).toBe(false);
  });

  test('rechaza ids inválidos y repetidos (aunque uno de ellos sea al ojo)', () => {
    expect(validarPesos([{ materia_prima_id: 'x', peso_real: 5 }]).ok).toBe(false);
    expect(validarPesos([{ materia_prima_id: 5, peso_real: 5 }]).ok).toBe(false);
    expect(validarPesos([{ materia_prima_id: H, peso_real: 5 }, { materia_prima_id: H, peso_real: 6 }]).ok).toBe(false);
    expect(validarPesos([{ materia_prima_id: H, peso_real: null }, { materia_prima_id: H, peso_real: 6 }]).ok).toBe(false);
  });

  test('rechaza pesos no positivos, no numéricos, demasiado grandes o demasiado pequeños', () => {
    for (const v of [0, -1, '5', true, NaN, Infinity, PESO_MAX + 1, 0.0004]) {
      expect(validarPesos([{ materia_prima_id: H, peso_real: v }]).ok).toBe(false);
    }
  });

  test('limita la cantidad de elementos', () => {
    const lista = Array.from({ length: 201 }, () => ({ materia_prima_id: H, peso_real: 1 }));
    expect(validarPesos(lista).ok).toBe(false);
    expect(validarPesos(lista.slice(0, 200).map((x, i) => ({ ...x, materia_prima_id: `22222222-2222-4222-8222-${String(i).padStart(12, '0')}` }))).ok).toBe(true);
  });
});

describe('aplicarPesos', () => {
  const estandar = new Map([[H, 300], [A, 200]]);

  test('usa el peso real si se pesó y el estándar si no', () => {
    const r = aplicarPesos(estandar, new Map([[H, 330]]));
    expect(r.efectivas.get(H)).toBe(330);
    expect(r.efectivas.get(A)).toBe(200);
    expect(r.lineas).toEqual([
      { materia_prima_id: H, peso_estandar: 300, peso_real: 330, pesado: true },
      { materia_prima_id: A, peso_estandar: 200, peso_real: 200, pesado: false },
    ]);
    expect(r.ajenos).toEqual([]);
  });

  test('un peso igual al estándar sigue contando como pesado', () => {
    expect(aplicarPesos(estandar, new Map([[A, 200]])).lineas[1].pesado).toBe(true);
  });

  test('detecta pesos de insumos que no están en la receta y no los usa', () => {
    const r = aplicarPesos(estandar, new Map([[L, 5]]));
    expect(r.ajenos).toEqual([L]);
    expect(r.efectivas.has(L)).toBe(false);
    expect(r.lineas.length).toBe(2);
  });

  test('sin pesos todo queda como estándar', () => {
    const r = aplicarPesos(estandar, new Map());
    expect(r.lineas.every((l) => !l.pesado && l.peso_real === l.peso_estandar)).toBe(true);
  });
});

describe('desviacionPct y rendimientoPct', () => {
  test('desviación = (real − estándar) / estándar × 100, con dos decimales', () => {
    expect(desviacionPct(330, 300)).toBe(10);
    expect(desviacionPct(270, 300)).toBe(-10);
    expect(desviacionPct(300, 300)).toBe(0);
    expect(desviacionPct(301, 300)).toBe(0.33);
    expect(desviacionPct(5, 0)).toBe(null);
  });

  test('rendimiento = producido / planificado × 100, con un decimal', () => {
    expect(rendimientoPct(38, 40)).toBe(95);
    expect(rendimientoPct(5, 40)).toBe(12.5);
    expect(rendimientoPct(41, 40)).toBe(102.5);
    expect(rendimientoPct(null, 40)).toBe(null);
    expect(rendimientoPct(38, null)).toBe(null);
    expect(rendimientoPct(38, 0)).toBe(null);
  });
});

describe('validarFinalizacion y avisoRendimiento', () => {
  test('acepta una cantidad positiva y la redondea', () => {
    const r = validarFinalizacion({ cantidad_producida: 38.12345 });
    expect(r.ok && r.datos.cantidad_producida).toBe(38.123);
  });

  test('rechaza cuerpos y cantidades inválidos', () => {
    for (const v of [null, [], 'x', {}, { cantidad_producida: 0 }, { cantidad_producida: -1 }, { cantidad_producida: '3' }, { cantidad_producida: NaN }, { cantidad_producida: 10_000_001 }, { cantidad_producida: 0.0001 }]) {
      expect(validarFinalizacion(v).ok).toBe(false);
    }
    expect(validarFinalizacion({ cantidad_producida: 10_000_000 }).ok).toBe(true);
  });

  test('avisa por debajo del 50 % o por encima del 150 %, no en los límites', () => {
    expect(avisoRendimiento(19, 40)).toMatch(/47,5 %/);
    expect(avisoRendimiento(61, 40)).toMatch(/152,5 %/);
    expect(avisoRendimiento(20, 40)).toBe(null);
    expect(avisoRendimiento(60, 40)).toBe(null);
    expect(avisoRendimiento(38, 40)).toBe(null);
    expect(avisoRendimiento(5, null)).toBe(null);
  });
});
