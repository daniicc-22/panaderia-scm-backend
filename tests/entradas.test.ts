import { describe, expect, test } from 'vitest';
import {
  cantidadBase,
  codigoGenerado,
  costoUnitario,
  fechaValida,
  hoyColombia,
  validarEntrada,
  validarNuevoVencimiento,
  verificarVencimiento,
} from '../src/utils/entradas';

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const base = { materia_prima_id: U1, presentacion_id: U2, cantidad: 2 };

describe('validarEntrada', () => {
  test('acepta lo mínimo y normaliza opcionales a null', () => {
    const r = validarEntrada(base);
    expect(r).toEqual({
      ok: true,
      datos: { ...base, proveedor_id: null, fecha_vencimiento: null, codigo_lote: null },
    });
  });

  test('recorta y compacta textos; vacío pasa a null', () => {
    const r = validarEntrada({ ...base, codigo_lote: '  AB   12 ', fecha_vencimiento: '' });
    expect(r.ok && r.datos.codigo_lote).toBe('AB 12');
    expect(r.ok && r.datos.fecha_vencimiento).toBeNull();
  });

  test('rechaza cuerpos que no son objeto', () => {
    for (const x of [null, undefined, 5, 'a', []]) expect(validarEntrada(x).ok).toBe(false);
  });

  test('rechaza identificadores no UUID', () => {
    const r = validarEntrada({ ...base, materia_prima_id: 'x', presentacion_id: 3 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toEqual(['El insumo no es válido.', 'La presentación no es válida.']);
  });

  test('rechaza texto que no es UUID en cada identificador por separado', () => {
    expect(validarEntrada({ ...base, presentacion_id: 'abc' }).ok).toBe(false);
    expect(validarEntrada({ ...base, materia_prima_id: 'abc' }).ok).toBe(false);
  });

  test('proveedor opcional: vacío es null, texto que no es UUID se rechaza', () => {
    const ok = validarEntrada({ ...base, proveedor_id: U1 });
    expect(ok.ok && ok.datos.proveedor_id).toBe(U1);
    const vacio = validarEntrada({ ...base, proveedor_id: '' });
    expect(vacio.ok && vacio.datos.proveedor_id).toBeNull();
    expect(validarEntrada({ ...base, proveedor_id: 'xyz' }).ok).toBe(false);
    expect(validarEntrada({ ...base, proveedor_id: 7 }).ok).toBe(false);
  });

  test('cantidad: mayor que 0, finita, número y con tope', () => {
    for (const c of [0, -1, NaN, Infinity, '2', null, 1_000_001, 0.0001]) {
      expect(validarEntrada({ ...base, cantidad: c }).ok).toBe(false);
    }
    expect(validarEntrada({ ...base, cantidad: 1_000_000 }).ok).toBe(true);
    const r = validarEntrada({ ...base, cantidad: 1.23456 });
    expect(r.ok && r.datos.cantidad).toBe(1.235);
  });

  test('fecha: formato AAAA-MM-DD y fecha real', () => {
    for (const f of ['2026-13-01', '2026-02-30', '26-01-01', 'mañana', 20260101]) {
      expect(validarEntrada({ ...base, fecha_vencimiento: f }).ok).toBe(false);
    }
    const r = validarEntrada({ ...base, fecha_vencimiento: '2028-02-29' });
    expect(r.ok && r.datos.fecha_vencimiento).toBe('2028-02-29');
  });

  test('código de lote: tipo y largo máximos', () => {
    expect(validarEntrada({ ...base, codigo_lote: 'a'.repeat(60) }).ok).toBe(true);
    expect(validarEntrada({ ...base, codigo_lote: 'a'.repeat(61) }).ok).toBe(false);
    expect(validarEntrada({ ...base, codigo_lote: 5 }).ok).toBe(false);
  });
});

describe('fechaValida / hoyColombia', () => {
  test('fechas reales y bisiestos', () => {
    expect(fechaValida('2024-02-29')).toBe(true);
    expect(fechaValida('2026-02-29')).toBe(false);
    expect(fechaValida('2026-04-31')).toBe(false);
    expect(fechaValida('2026-1-01')).toBe(false);
  });
  test('usa UTC-5: a las 03:00 UTC aún es el día anterior en Colombia', () => {
    expect(hoyColombia(new Date('2026-10-24T03:00:00Z'))).toBe('2026-10-23');
    expect(hoyColombia(new Date('2026-10-24T05:00:00Z'))).toBe('2026-10-24');
    expect(hoyColombia(new Date('2026-10-24T04:59:59Z'))).toBe('2026-10-23');
  });
});

describe('verificarVencimiento', () => {
  const hoy = '2026-10-24';
  test('sin fecha: solo FEFO la exige', () => {
    expect(verificarVencimiento(null, hoy, 'FEFO')).toHaveLength(1);
    expect(verificarVencimiento(null, hoy, 'FIFO')).toEqual([]);
    expect(verificarVencimiento(null, hoy, 'ninguno')).toEqual([]);
    expect(verificarVencimiento(null, hoy, null)).toEqual([]);
  });
  test('hoy es válido; ayer no', () => {
    expect(verificarVencimiento('2026-10-24', hoy, null)).toEqual([]);
    expect(verificarVencimiento('2026-10-23', hoy, null)).toEqual(['No se puede recibir mercancía ya vencida.']);
  });
  test('tope de 10 años: el mismo día aún pasa, un día más no', () => {
    expect(verificarVencimiento('2036-10-24', hoy, null)).toEqual([]);
    expect(verificarVencimiento('2036-10-25', hoy, null)).toHaveLength(1);
  });
});

describe('cálculos', () => {
  test('cantidadBase multiplica por el contenido con 3 decimales', () => {
    expect(cantidadBase(2, 50_000)).toBe(100_000);
    expect(cantidadBase(0.5, 453.592)).toBe(226.796);
    expect(cantidadBase(1.001, 0.1)).toBe(0.1);
  });
  test('costoUnitario es precio / contenido con 4 decimales', () => {
    expect(costoUnitario(150_000, 50_000)).toBe(3);
    expect(costoUnitario(10_000, 3)).toBe(3333.3333);
  });
  test('codigoGenerado: fecha sin guiones y secuencia con ceros', () => {
    expect(codigoGenerado('2026-10-24', 7)).toBe('L-20261024-007');
    expect(codigoGenerado('2026-10-24', 1234)).toBe('L-20261024-1234');
  });
});

describe('validarNuevoVencimiento', () => {
  const HOY = '2026-10-25';
  test('acepta fechas válidas, pasadas o futuras', () => {
    expect(validarNuevoVencimiento({ fecha_vencimiento: '2026-12-01' }, HOY, null)).toEqual({ ok: true, fecha: '2026-12-01' });
    expect(validarNuevoVencimiento({ fecha_vencimiento: '2026-10-01' }, HOY, 'FEFO')).toEqual({ ok: true, fecha: '2026-10-01' });
  });
  test('sin fecha solo si el insumo no es FEFO', () => {
    expect(validarNuevoVencimiento({ fecha_vencimiento: null }, HOY, null)).toEqual({ ok: true, fecha: null });
    expect(validarNuevoVencimiento({ fecha_vencimiento: '' }, HOY, 'FIFO')).toEqual({ ok: true, fecha: null });
    expect(validarNuevoVencimiento({ fecha_vencimiento: null }, HOY, 'FEFO').ok).toBe(false);
  });
  test('rechaza lo no válido', () => {
    expect(validarNuevoVencimiento(null, HOY, null).ok).toBe(false);
    expect(validarNuevoVencimiento({}, HOY, null).ok).toBe(false);
    expect(validarNuevoVencimiento({ fecha_vencimiento: 5 }, HOY, null).ok).toBe(false);
    expect(validarNuevoVencimiento({ fecha_vencimiento: '2026-02-30' }, HOY, null).ok).toBe(false);
    expect(validarNuevoVencimiento({ fecha_vencimiento: '2019-12-31' }, HOY, null).ok).toBe(false);
    expect(validarNuevoVencimiento({ fecha_vencimiento: '2036-10-25' }, HOY, null).ok).toBe(true); // límite: 10 años
    expect(validarNuevoVencimiento({ fecha_vencimiento: '2036-10-26' }, HOY, null).ok).toBe(false);
  });
});
