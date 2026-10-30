import { describe, expect, test } from 'vitest';
import { revisarCoherencia, validarParametros } from '../src/utils/parametrosInventario';

describe('validarParametros', () => {
  test('acepta solo los campos enviados', () => {
    const r = validarParametros({ costo_ordenar_s: 20000, dias_seguridad: 2 });
    expect(r).toEqual({ ok: true, datos: { costo_ordenar_s: 20000, dias_seguridad: 2 } });
  });

  test('null borra el valor', () => {
    const r = validarParametros({ vida_util_dias: null });
    expect(r).toEqual({ ok: true, datos: { vida_util_dias: null } });
  });

  test('no acepta un cuerpo vacío ni sin campos conocidos', () => {
    expect(validarParametros({}).ok).toBe(false);
    expect(validarParametros(null).ok).toBe(false);
    expect(validarParametros([]).ok).toBe(false);
    const r = validarParametros({ panaderia_id: 'x' });
    expect(r.ok).toBe(false);
  });

  test('rechaza campos que no se pueden modificar aunque vengan con uno válido', () => {
    const r = validarParametros({ dias_seguridad: 2, materia_prima_id: 'otro' });
    expect(r.ok).toBe(false);
  });

  test('rechaza texto y números no finitos', () => {
    for (const v of ['20000', Number.NaN, Number.POSITIVE_INFINITY, true]) {
      expect(validarParametros({ costo_ordenar_s: v }).ok).toBe(false);
    }
  });

  test('el costo de pedido admite 0 pero H, stock máximo y vida útil deben ser mayores que 0', () => {
    expect(validarParametros({ costo_ordenar_s: 0 }).ok).toBe(true);
    expect(validarParametros({ costo_mantener_h: 0 }).ok).toBe(false);
    expect(validarParametros({ stock_maximo: 0 }).ok).toBe(false);
    expect(validarParametros({ vida_util_dias: 0 }).ok).toBe(false);
    expect(validarParametros({ dias_seguridad: 0 }).ok).toBe(true);
    expect(validarParametros({ stock_minimo: 0 }).ok).toBe(true);
  });

  test('rechaza negativos', () => {
    for (const campo of ['costo_ordenar_s', 'dias_seguridad', 'stock_minimo', 'consumo_semanal_declarado', 'lead_time_dias']) {
      expect(validarParametros({ [campo]: -1 }).ok).toBe(false);
    }
  });

  test('respeta los máximos', () => {
    expect(validarParametros({ tasa_mantenimiento_anual: 0.24 }).ok).toBe(true);
    expect(validarParametros({ tasa_mantenimiento_anual: 5.5 }).ok).toBe(false);
    expect(validarParametros({ porcentaje_perdida_tolerable: 101 }).ok).toBe(false);
    expect(validarParametros({ dias_seguridad: 400 }).ok).toBe(false);
  });

  test('respeta los decimales y el tamaño que admite cada columna', () => {
    expect(validarParametros({ costo_ordenar_s: 20000.5 }).ok).toBe(true);
    expect(validarParametros({ costo_ordenar_s: 20000.555 }).ok).toBe(false);
    expect(validarParametros({ tasa_mantenimiento_anual: 0.12345 }).ok).toBe(false);
    expect(validarParametros({ vida_util_dias: 14.25 }).ok).toBe(false);
    expect(validarParametros({ costo_ordenar_s: 1e10 }).ok).toBe(false);
    expect(validarParametros({ lead_time_dias: 1e-7 }).ok).toBe(false);
  });

  test('junta todos los errores', () => {
    const r = validarParametros({ costo_ordenar_s: -1, dias_seguridad: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toHaveLength(2);
  });
});

describe('revisarCoherencia', () => {
  test('el mínimo no puede superar al máximo', () => {
    expect(revisarCoherencia({ stock_minimo: 10, stock_maximo: 5 })).toHaveLength(1);
    expect(revisarCoherencia({ stock_minimo: 5, stock_maximo: 5 })).toEqual([]);
    expect(revisarCoherencia({ stock_minimo: null, stock_maximo: 5 })).toEqual([]);
    expect(revisarCoherencia({ stock_minimo: 10, stock_maximo: null })).toEqual([]);
  });
});
