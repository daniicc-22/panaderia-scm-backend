import { describe, expect, test } from 'vitest';
import { validarEntrega } from '../src/utils/entregaProveedor';

describe('validarEntrega', () => {
  test('acepta un calendario completo y ordena los días sin repetirlos', () => {
    const r = validarEntrega({ dias_entrega: [3, 1, 3], hora_limite_pedido: '16:00', pedido_minimo: 750000 });
    expect(r).toEqual({ ok: true, datos: { dias_entrega: [1, 3], hora_limite_pedido: '16:00', pedido_minimo: 750000 } });
  });

  test('lista vacía y null dejan todo sin definir', () => {
    const r = validarEntrega({ dias_entrega: [], hora_limite_pedido: null, pedido_minimo: null });
    expect(r).toEqual({ ok: true, datos: { dias_entrega: [], hora_limite_pedido: null, pedido_minimo: null } });
    const sinCampos = validarEntrega({ dias_entrega: [] });
    expect(sinCampos.ok).toBe(true);
  });

  test('exige la lista de días (aunque sea vacía)', () => {
    expect(validarEntrega({}).ok).toBe(false);
    expect(validarEntrega({ dias_entrega: 3 }).ok).toBe(false);
  });

  test('rechaza días fuera de 0 a 6 o no enteros', () => {
    for (const dias of [[7], [-1], [1.5], ['lunes']]) {
      const r = validarEntrega({ dias_entrega: dias });
      expect(r.ok).toBe(false);
    }
  });

  test('la hora debe ser HH:MM válida', () => {
    for (const h of ['4pm', '24:00', '9:00', '16:60', 1600]) {
      const r = validarEntrega({ dias_entrega: [3], hora_limite_pedido: h });
      expect(r.ok).toBe(false);
    }
    expect(validarEntrega({ dias_entrega: [3], hora_limite_pedido: '00:00' }).ok).toBe(true);
    expect(validarEntrega({ dias_entrega: [3], hora_limite_pedido: '23:59' }).ok).toBe(true);
  });

  test('el pedido mínimo no puede ser negativo, texto ni tener más de 2 decimales', () => {
    for (const m of [-1, '750000', 10.123, Number.NaN, 1e10]) {
      const r = validarEntrega({ dias_entrega: [3], pedido_minimo: m });
      expect(r.ok).toBe(false);
    }
    expect(validarEntrega({ dias_entrega: [3], pedido_minimo: 0 }).ok).toBe(true);
    expect(validarEntrega({ dias_entrega: [3], pedido_minimo: 750000.5 }).ok).toBe(true);
  });

  test('un cuerpo que no es objeto da error', () => {
    expect(validarEntrega(null).ok).toBe(false);
    expect(validarEntrega([]).ok).toBe(false);
    expect(validarEntrega('x').ok).toBe(false);
  });
});
