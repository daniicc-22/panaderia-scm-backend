import { describe, expect, test } from 'vitest';
import {
  META_ERI,
  diferencia,
  exactitudLinea,
  resumirConteo,
  revisarMotivo,
  validarCorreccion,
  validarLinea,
  validarNuevoConteo,
} from '../src/utils/conteo';

const LOTE = '11111111-1111-4111-8111-111111111111';

describe('validarNuevoConteo', () => {
  test('sin cuerpo o sin observaciones es válido; recorta y junta espacios', () => {
    expect(validarNuevoConteo(undefined)).toEqual({ ok: true, datos: { observaciones: null } });
    expect(validarNuevoConteo({})).toEqual({ ok: true, datos: { observaciones: null } });
    expect(validarNuevoConteo({ observaciones: '  Conteo   de   fin   de mes ' })).toEqual({ ok: true, datos: { observaciones: 'Conteo de fin de mes' } });
    expect(validarNuevoConteo({ observaciones: '   ' })).toEqual({ ok: true, datos: { observaciones: null } });
  });

  test('rechaza cuerpos que no son objeto, texto no válido o demasiado largo', () => {
    expect(validarNuevoConteo('x').ok).toBe(false);
    expect(validarNuevoConteo([]).ok).toBe(false);
    expect(validarNuevoConteo({ observaciones: 5 }).ok).toBe(false);
    expect(validarNuevoConteo({ observaciones: 'a'.repeat(301) }).ok).toBe(false);
    expect(validarNuevoConteo({ observaciones: 'a'.repeat(300) }).ok).toBe(true);
  });
});

describe('validarLinea', () => {
  test('acepta lote y cantidad (redondeada a 3 decimales); motivo y observaciones son opcionales', () => {
    expect(validarLinea({ lote_id: LOTE, cantidad_contada: 12.34567 })).toEqual({
      ok: true,
      datos: { lote_id: LOTE, cantidad_contada: 12.346, motivo: null, observaciones: null },
    });
    expect(validarLinea({ lote_id: LOTE, cantidad_contada: 0, motivo: 'perdida_dano', observaciones: ' se cayó ' })).toEqual({
      ok: true,
      datos: { lote_id: LOTE, cantidad_contada: 0, motivo: 'perdida_dano', observaciones: 'se cayó' },
    });
    expect(validarLinea({ lote_id: LOTE, cantidad_contada: 5, motivo: '' }).ok).toBe(true);
    expect(validarLinea({ lote_id: LOTE, cantidad_contada: 1_000_000 }).ok).toBe(true);
  });

  test('rechaza lote inválido, cantidades no válidas, motivos desconocidos y cuerpos raros', () => {
    for (const malo of [
      { lote_id: 'x', cantidad_contada: 1 },
      { cantidad_contada: 1 },
      { lote_id: LOTE },
      { lote_id: LOTE, cantidad_contada: '5' },
      { lote_id: LOTE, cantidad_contada: -1 },
      { lote_id: LOTE, cantidad_contada: 1_000_001 },
      { lote_id: LOTE, cantidad_contada: Number.NaN },
      { lote_id: LOTE, cantidad_contada: Infinity },
      { lote_id: LOTE, cantidad_contada: 1, motivo: 'robo' },
      { lote_id: LOTE, cantidad_contada: 1, motivo: 7 },
      { lote_id: LOTE, cantidad_contada: 1, observaciones: 'a'.repeat(301) },
      null,
      [],
      'x',
    ]) {
      expect(validarLinea(malo).ok).toBe(false);
    }
  });

  test('reúne todos los errores a la vez', () => {
    const r = validarLinea({ lote_id: 'x', cantidad_contada: -1, motivo: 'robo' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toHaveLength(3);
  });
});

describe('diferencia', () => {
  test('contada menos sistema, sin ruido de decimales', () => {
    expect(diferencia(100, 90)).toBe(-10);
    expect(diferencia(100, 100)).toBe(0);
    expect(diferencia(0.1, 0.3)).toBe(0.2);
    expect(diferencia(10, 12.5)).toBe(2.5);
  });
});

describe('revisarMotivo', () => {
  test('sin diferencia se descartan motivo y observaciones', () => {
    expect(revisarMotivo(0, 'otro', 'nada')).toEqual({ ok: true, datos: { motivo: null, observaciones: null } });
  });

  test('con diferencia el motivo es obligatorio', () => {
    expect(revisarMotivo(-5, null, null).ok).toBe(false);
    expect(revisarMotivo(5, null, null).ok).toBe(false);
    expect(revisarMotivo(-5, 'error_registro', null)).toEqual({ ok: true, datos: { motivo: 'error_registro', observaciones: null } });
    expect(revisarMotivo(5, 'error_produccion', 'x')).toEqual({ ok: true, datos: { motivo: 'error_produccion', observaciones: 'x' } });
  });

  test('"vencimiento" solo para faltantes', () => {
    expect(revisarMotivo(-1, 'vencimiento', null).ok).toBe(true);
    expect(revisarMotivo(1, 'vencimiento', null).ok).toBe(false);
  });

  test('"otro" pide observación de al menos 3 caracteres', () => {
    expect(revisarMotivo(-1, 'otro', null).ok).toBe(false);
    expect(revisarMotivo(-1, 'otro', 'ab').ok).toBe(false);
    expect(revisarMotivo(-1, 'otro', 'abc').ok).toBe(true);
    expect(revisarMotivo(2, 'otro', 'derrame').ok).toBe(true);
  });
});

describe('exactitudLinea / resumirConteo (ERI)', () => {
  test('exactitud: menor sobre mayor, 1 si ambos son 0, 0 si uno es 0 y el otro no', () => {
    expect(exactitudLinea(100, 100)).toBe(1);
    expect(exactitudLinea(100, 90)).toBe(0.9);
    expect(exactitudLinea(90, 100)).toBe(0.9);
    expect(exactitudLinea(0, 0)).toBe(1);
    expect(exactitudLinea(0, 5)).toBe(0);
    expect(exactitudLinea(5, 0)).toBe(0);
    expect(exactitudLinea(0.2, 0.1)).toBe(0.5); // cantidades menores que 1 (p. ej. unidades fraccionadas)
  });

  test('conteo sin diferencias: ERI 100 y todos exactos', () => {
    const r = resumirConteo([
      { cantidad_sistema: 500, cantidad_contada: 500 },
      { cantidad_sistema: 10, cantidad_contada: 10 },
    ]);
    expect(r).toEqual({ lotes: 2, exactos: 2, faltantes: 0, sobrantes: 0, eri: 100 });
  });

  test('promedia la exactitud por lote y cuenta faltantes y sobrantes', () => {
    const r = resumirConteo([
      { cantidad_sistema: 100, cantidad_contada: 90 }, // 0,9
      { cantidad_sistema: 200, cantidad_contada: 200 }, // 1
      { cantidad_sistema: 50, cantidad_contada: 100 }, // 0,5 (sobrante)
      { cantidad_sistema: 10, cantidad_contada: 10 }, // 1
    ]);
    expect(r).toEqual({ lotes: 4, exactos: 2, faltantes: 1, sobrantes: 1, eri: 85 });
  });

  test('un lote pequeño pesa igual que uno grande y los sobrantes no compensan los faltantes', () => {
    const r = resumirConteo([
      { cantidad_sistema: 100_000, cantidad_contada: 100_000 },
      { cantidad_sistema: 10, cantidad_contada: 0 },
    ]);
    expect(r.eri).toBe(50);
    const compensados = resumirConteo([
      { cantidad_sistema: 100, cantidad_contada: 50 },
      { cantidad_sistema: 100, cantidad_contada: 200 },
    ]);
    expect(compensados.eri).toBe(50); // (0,5 + 0,5) / 2
  });

  test('redondea a 2 decimales y sin lotes devuelve null', () => {
    expect(resumirConteo([{ cantidad_sistema: 3, cantidad_contada: 2 }]).eri).toBe(66.67);
    expect(resumirConteo([]).eri).toBeNull();
    expect(resumirConteo([]).lotes).toBe(0);
  });

  test('una diferencia menor al milésimo no cuenta como diferencia', () => {
    const r = resumirConteo([{ cantidad_sistema: 0.1 + 0.2, cantidad_contada: 0.3 }]);
    expect(r).toMatchObject({ exactos: 1, eri: 100 });
  });

  test('la meta del proyecto es 95 %', () => {
    expect(META_ERI).toBe(95);
  });
});

describe('validarCorreccion', () => {
  const ok = { cantidad_nueva: 49000, motivo: 'error_registro' };
  test('acepta una corrección válida y limpia las observaciones', () => {
    expect(validarCorreccion({ ...ok, observaciones: '  Se digitó   mal ' })).toEqual({
      ok: true,
      datos: { cantidad_nueva: 49000, motivo: 'error_registro', observaciones: 'Se digitó mal' },
    });
    expect(validarCorreccion({ ...ok, cantidad_nueva: 0 }).ok).toBe(true);
    const redondeada = validarCorreccion({ ...ok, cantidad_nueva: 1.23456 });
    expect(redondeada.ok && redondeada.datos.cantidad_nueva).toBe(1.235);
  });
  test('rechaza cantidades no válidas', () => {
    for (const c of [-1, 1_000_001, Number.NaN, '5', null, undefined]) {
      expect(validarCorreccion({ ...ok, cantidad_nueva: c }).ok).toBe(false);
    }
  });
  test('exige un motivo válido', () => {
    expect(validarCorreccion({ cantidad_nueva: 5 }).ok).toBe(false);
    expect(validarCorreccion({ cantidad_nueva: 5, motivo: '' }).ok).toBe(false);
    expect(validarCorreccion({ cantidad_nueva: 5, motivo: 'inventado' }).ok).toBe(false);
  });
  test('rechaza cuerpos que no son objeto y observaciones demasiado largas', () => {
    expect(validarCorreccion(null).ok).toBe(false);
    expect(validarCorreccion([]).ok).toBe(false);
    expect(validarCorreccion({ ...ok, observaciones: 'x'.repeat(301) }).ok).toBe(false);
  });
});
