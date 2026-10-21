import { describe, expect, test } from 'vitest';
import {
  validarOfertaCrear,
  validarOfertaEditar,
  validarPresentacionCrear,
  validarPresentacionEditar,
} from '../src/utils/precioValidacion';

const PROV = '11111111-1111-4111-8111-111111111111';

describe('validarPresentacionCrear', () => {
  test('acepta nombre y contenido, limpia espacios y redondea a 4 decimales', () => {
    expect(validarPresentacionCrear({ nombre: '  Bulto   50 kg ', contenido: 50000.123456 })).toEqual({
      ok: true,
      datos: { nombre: 'Bulto 50 kg', contenido: 50000.1235 },
    });
  });

  test('rechaza contenido cero, negativo, texto, infinito o por encima del límite', () => {
    for (const contenido of [0, -1, '500', Number.NaN, Infinity, 100_000_000, 0.00001, null, undefined]) {
      expect(validarPresentacionCrear({ nombre: 'Bulto', contenido }).ok).toBe(false);
    }
  });

  test('rechaza nombre vacío, corto o largo', () => {
    for (const nombre of ['', ' ', 'a', 'x'.repeat(101), 5, undefined]) {
      expect(validarPresentacionCrear({ nombre, contenido: 100 }).ok).toBe(false);
    }
  });

  test('no deja enviar la unidad ni la panadería', () => {
    expect(validarPresentacionCrear({ nombre: 'Bulto', contenido: 100, unidad_contenido_id: 'x' }).ok).toBe(false);
    expect(validarPresentacionCrear({ nombre: 'Bulto', contenido: 100, panaderia_id: 'x' }).ok).toBe(false);
  });

  test('rechaza cuerpos que no son objeto', () => {
    for (const cuerpo of [null, undefined, 'x', 3, []]) expect(validarPresentacionCrear(cuerpo).ok).toBe(false);
  });
});

describe('validarPresentacionEditar', () => {
  test('acepta cambios parciales', () => {
    expect(validarPresentacionEditar({ contenido: 25000 })).toEqual({ ok: true, datos: { contenido: 25000 } });
    expect(validarPresentacionEditar({ activa: false })).toEqual({ ok: true, datos: { activa: false } });
  });

  test('exige al menos un cambio y rechaza campos no editables', () => {
    expect(validarPresentacionEditar({}).ok).toBe(false);
    expect(validarPresentacionEditar({ materia_prima_id: PROV }).ok).toBe(false);
    expect(validarPresentacionEditar({ activa: 'no' }).ok).toBe(false);
    expect(validarPresentacionEditar({ contenido: 0 }).ok).toBe(false);
  });
});

describe('validarOfertaCrear', () => {
  test('acepta proveedor y precio; el tiempo de entrega es opcional', () => {
    expect(validarOfertaCrear({ proveedor_id: PROV, precio_referencia: 87150 })).toEqual({
      ok: true,
      datos: { proveedor_id: PROV, precio_referencia: 87150, tiempo_entrega_dias: null },
    });
    expect(validarOfertaCrear({ proveedor_id: PROV, precio_referencia: 87150.456, tiempo_entrega_dias: 2 })).toEqual({
      ok: true,
      datos: { proveedor_id: PROV, precio_referencia: 87150.46, tiempo_entrega_dias: 2 },
    });
  });

  test('rechaza precio cero, negativo, texto o por encima del límite', () => {
    for (const precio of [0, -5, '100', Number.NaN, 10_000_000_000, 0.001, undefined]) {
      expect(validarOfertaCrear({ proveedor_id: PROV, precio_referencia: precio }).ok).toBe(false);
    }
  });

  test('rechaza un proveedor que no es un identificador válido', () => {
    for (const proveedor_id of ['', 'abc', 5, undefined]) {
      expect(validarOfertaCrear({ proveedor_id, precio_referencia: 100 }).ok).toBe(false);
    }
  });

  test('valida el tiempo de entrega y no deja enviar la panadería', () => {
    for (const t of [-1, 366, '2', Number.NaN]) {
      expect(validarOfertaCrear({ proveedor_id: PROV, precio_referencia: 100, tiempo_entrega_dias: t }).ok).toBe(false);
    }
    expect(validarOfertaCrear({ proveedor_id: PROV, precio_referencia: 100, panaderia_id: 'x' }).ok).toBe(false);
  });
});

describe('validarOfertaEditar', () => {
  test('acepta precio, entrega y vigencia', () => {
    expect(validarOfertaEditar({ precio_referencia: 90000, vigente: false, tiempo_entrega_dias: null })).toEqual({
      ok: true,
      datos: { precio_referencia: 90000, vigente: false, tiempo_entrega_dias: null },
    });
  });

  test('no se puede cambiar el proveedor ni la presentación de una oferta', () => {
    expect(validarOfertaEditar({ proveedor_id: PROV }).ok).toBe(false);
    expect(validarOfertaEditar({ presentacion_id: PROV }).ok).toBe(false);
  });

  test('exige un cambio válido', () => {
    expect(validarOfertaEditar({}).ok).toBe(false);
    expect(validarOfertaEditar({ precio_referencia: 0 }).ok).toBe(false);
    expect(validarOfertaEditar({ vigente: 'si' }).ok).toBe(false);
  });
});
