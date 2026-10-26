import { describe, expect, test } from 'vitest';
import { ETAPAS, MERMA_MAX, costoMerma, validarMerma } from '../src/utils/mermas';

const C = '33333333-3333-4333-8333-333333333331';
const L = '44444444-4444-4444-8444-444444444441';
const P = '55555555-5555-4555-8555-555555555551';
const base = { causa_id: C, etapa: 'almacenamiento', cantidad: 300, lote_id: L };

describe('validarMerma', () => {
  test('acepta una merma de lote, de producción o de ambos', () => {
    const a = validarMerma(base);
    expect(a.ok && a.datos).toEqual({ causa_id: C, etapa: 'almacenamiento', cantidad: 300, lote_id: L, produccion_id: null });
    const b = validarMerma({ causa_id: C, etapa: 'produccion', cantidad: 1500.5, produccion_id: P });
    expect(b.ok && b.datos).toEqual({ causa_id: C, etapa: 'produccion', cantidad: 1500.5, lote_id: null, produccion_id: P });
    const c = validarMerma({ ...base, etapa: 'produccion', produccion_id: P });
    expect(c.ok && c.datos.lote_id).toBe(L);
    expect(c.ok && c.datos.produccion_id).toBe(P);
  });

  test('acepta las tres etapas y rechaza otras', () => {
    for (const e of ETAPAS) expect(validarMerma({ ...base, etapa: e }).ok).toBe(true);
    for (const e of ['otra', '', 5, null, undefined]) expect(validarMerma({ ...base, etapa: e }).ok).toBe(false);
  });

  test('redondea la cantidad a 3 decimales y respeta el máximo', () => {
    const r = validarMerma({ ...base, cantidad: 12.34567 });
    expect(r.ok && r.datos.cantidad).toBe(12.346);
    expect(validarMerma({ ...base, cantidad: MERMA_MAX }).ok).toBe(true);
  });

  test('rechaza cantidades no positivas, no numéricas, muy grandes o muy pequeñas', () => {
    for (const v of [0, -1, '300', true, null, undefined, NaN, Infinity, MERMA_MAX + 1, 0.0004]) {
      expect(validarMerma({ ...base, cantidad: v }).ok).toBe(false);
    }
  });

  test('rechaza una causa o ids inválidos', () => {
    expect(validarMerma({ ...base, causa_id: 'x' }).ok).toBe(false);
    expect(validarMerma({ ...base, causa_id: undefined }).ok).toBe(false);
    expect(validarMerma({ ...base, lote_id: 'x' }).ok).toBe(false);
    expect(validarMerma({ ...base, lote_id: 5 }).ok).toBe(false);
    expect(validarMerma({ ...base, lote_id: null, produccion_id: 'x' }).ok).toBe(false);
  });

  test('exige un lote o una producción', () => {
    const r = validarMerma({ causa_id: C, etapa: 'produccion', cantidad: 5 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errores.join(' ')).toMatch(/lote o de qué producción/);
    expect(validarMerma({ causa_id: C, etapa: 'produccion', cantidad: 5, lote_id: null, produccion_id: null }).ok).toBe(false);
  });

  test('rechaza cuerpos que no son objetos', () => {
    for (const v of [null, undefined, 'x', 5, []]) expect(validarMerma(v).ok).toBe(false);
  });
});

describe('costoMerma', () => {
  test('cantidad × costo unitario, con dos decimales', () => {
    expect(costoMerma(2, 300)).toBe(600);
    expect(costoMerma(1.743, 1000)).toBe(1743);
    expect(costoMerma(1.743, 7)).toBe(12.2);
    expect(costoMerma(0, 500)).toBe(0);
    expect(costoMerma(0.0033, 1)).toBe(0);
  });
});
