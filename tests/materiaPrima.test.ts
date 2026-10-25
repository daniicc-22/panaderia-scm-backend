import { describe, expect, test } from 'vitest';
import { siguienteCodigo, validarCrear, validarEditar } from '../src/utils/materiaPrima';

const UNIDAD = '11111111-1111-4111-8111-111111111111';
const CATEGORIA = '22222222-2222-4222-8222-222222222222';

describe('validarCrear', () => {
  test('acepta lo mínimo: nombre y unidad base', () => {
    const r = validarCrear({ nombre: 'Harina de trigo', unidad_base_id: UNIDAD });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.nombre).toBe('Harina de trigo');
      expect(r.datos.categoria_id).toBeNull();
      expect(r.datos.criterio_rotacion).toBeNull();
      expect(r.datos.lead_time_dias).toBeNull();
    }
  });

  test('limpia espacios del nombre', () => {
    const r = validarCrear({ nombre: '  Harina   de   trigo ', unidad_base_id: UNIDAD });
    expect(r.ok && r.datos.nombre).toBe('Harina de trigo');
  });

  test('rechaza nombre vacío, corto, largo o que no es texto', () => {
    for (const nombre of ['', ' ', 'a', 'x'.repeat(101), 5, null, undefined]) {
      expect(validarCrear({ nombre, unidad_base_id: UNIDAD }).ok).toBe(false);
    }
  });

  test('exige una unidad base válida', () => {
    expect(validarCrear({ nombre: 'Sal' }).ok).toBe(false);
    expect(validarCrear({ nombre: 'Sal', unidad_base_id: 'g' }).ok).toBe(false);
  });

  test('valida criterio de rotación, categoría, tiempo de entrega y variabilidad', () => {
    const ok = validarCrear({
      nombre: 'Levadura',
      unidad_base_id: UNIDAD,
      categoria_id: CATEGORIA,
      criterio_rotacion: 'FEFO',
      lead_time_dias: 2.5,
      variabilidad_peso_unitario: false,
    });
    expect(ok.ok).toBe(true);
    const base = { nombre: 'Levadura', unidad_base_id: UNIDAD };
    expect(validarCrear({ ...base, criterio_rotacion: 'LIFO' }).ok).toBe(false);
    expect(validarCrear({ ...base, categoria_id: 'abc' }).ok).toBe(false);
    expect(validarCrear({ ...base, lead_time_dias: -1 }).ok).toBe(false);
    expect(validarCrear({ ...base, lead_time_dias: 366 }).ok).toBe(false);
    expect(validarCrear({ ...base, lead_time_dias: '3' }).ok).toBe(false);
    expect(validarCrear({ ...base, lead_time_dias: Number.NaN }).ok).toBe(false);
    expect(validarCrear({ ...base, variabilidad_peso_unitario: 'si' }).ok).toBe(false);
  });

  test('rechaza cuerpos que no son objeto', () => {
    for (const cuerpo of [null, undefined, 'texto', 3, []]) expect(validarCrear(cuerpo).ok).toBe(false);
  });

  test('ignora campos de más como panaderia_id o codigo (no llegan a los datos)', () => {
    const r = validarCrear({ nombre: 'Sal', unidad_base_id: UNIDAD, panaderia_id: 'otra', codigo: 'MP-999' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.datos)).not.toContain('panaderia_id');
    if (r.ok) expect(Object.keys(r.datos)).not.toContain('codigo');
  });
});

describe('validarEditar', () => {
  test('acepta cambios parciales', () => {
    const r = validarEditar({ nombre: 'Harina integral', lead_time_dias: 3 });
    expect(r).toEqual({ ok: true, datos: { nombre: 'Harina integral', lead_time_dias: 3 } });
  });

  test('permite poner en blanco los campos opcionales', () => {
    const r = validarEditar({ categoria_id: null, criterio_rotacion: null, lead_time_dias: null });
    expect(r).toEqual({ ok: true, datos: { categoria_id: null, criterio_rotacion: null, lead_time_dias: null } });
  });

  test('bloquea el código y la unidad base', () => {
    const r = validarEditar({ codigo: 'MP-100' });
    expect(r.ok).toBe(false);
    const r2 = validarEditar({ unidad_base_id: UNIDAD, nombre: 'Sal' });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.errores.join(' ')).toContain('unidad_base_id');
  });

  test('rechaza campos desconocidos y panaderia_id', () => {
    expect(validarEditar({ panaderia_id: 'x' }).ok).toBe(false);
    expect(validarEditar({ inventado: 1 }).ok).toBe(false);
  });

  test('exige al menos un cambio y un valor booleano en activa', () => {
    expect(validarEditar({}).ok).toBe(false);
    expect(validarEditar({ activa: 'no' }).ok).toBe(false);
    expect(validarEditar({ activa: false })).toEqual({ ok: true, datos: { activa: false } });
  });

  test('un nombre inválido no se guarda', () => {
    expect(validarEditar({ nombre: ' ' }).ok).toBe(false);
  });
});

describe('siguienteCodigo', () => {
  test('sin materias empieza en MP-001', () => {
    expect(siguienteCodigo([])).toBe('MP-001');
  });

  test('toma el mayor y suma uno, aunque haya huecos', () => {
    expect(siguienteCodigo(['MP-001', 'MP-041', 'MP-007'])).toBe('MP-042');
  });

  test('ignora códigos con otro formato', () => {
    expect(siguienteCodigo(['HARINA', 'MP-', 'mp-009', 'MP-1A'])).toBe('MP-010');
  });

  test('pasa de tres cifras sin romperse', () => {
    expect(siguienteCodigo(['MP-999'])).toBe('MP-1000');
  });
});

describe('controla_inventario (validación)', () => {
  const base = { nombre: 'Agua', unidad_base_id: '11111111-1111-4111-8111-111111111111' };

  test('al crear: por defecto verdadero; acepta false; rechaza lo que no es booleano', () => {
    const a = validarCrear(base);
    expect(a.ok && a.datos.controla_inventario).toBe(true);
    const b = validarCrear({ ...base, controla_inventario: false });
    expect(b.ok && b.datos.controla_inventario).toBe(false);
    for (const malo of ['false', 0, null]) expect(validarCrear({ ...base, controla_inventario: malo }).ok).toBe(false);
  });

  test('al editar: es un campo editable y booleano', () => {
    const a = validarEditar({ controla_inventario: false });
    expect(a.ok && a.datos).toEqual({ controla_inventario: false });
    expect(validarEditar({ controla_inventario: 'si' }).ok).toBe(false);
    expect(validarEditar({ controla_inventario: null }).ok).toBe(false);
  });
});
