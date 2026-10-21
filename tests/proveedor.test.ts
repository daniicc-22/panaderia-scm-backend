import { describe, expect, test } from 'vitest';
import { validarProveedorCrear, validarProveedorEditar } from '../src/utils/proveedor';

describe('validarProveedorCrear', () => {
  test('acepta solo el nombre y deja lo demás en null', () => {
    expect(validarProveedorCrear({ nombre: 'Distribuidora Pasto' })).toEqual({
      ok: true,
      datos: { nombre: 'Distribuidora Pasto', contacto: null, telefono: null, direccion: null },
    });
  });

  test('limpia espacios y convierte textos vacíos en null', () => {
    const r = validarProveedorCrear({ nombre: '  Molino   del Sur ', contacto: '  ', telefono: '', direccion: ' Calle 18  #25-10 ' });
    expect(r).toEqual({
      ok: true,
      datos: { nombre: 'Molino del Sur', contacto: null, telefono: null, direccion: 'Calle 18 #25-10' },
    });
  });

  test('acepta teléfonos con formato habitual', () => {
    for (const t of ['3001234567', '+57 300 123 4567', '(602) 723-1234']) {
      expect(validarProveedorCrear({ nombre: 'Prov', telefono: t }).ok).toBe(true);
    }
  });

  test('rechaza teléfonos con letras o demasiado largos', () => {
    expect(validarProveedorCrear({ nombre: 'Prov', telefono: '300abc' }).ok).toBe(false);
    expect(validarProveedorCrear({ nombre: 'Prov', telefono: '1'.repeat(31) }).ok).toBe(false);
  });

  test('rechaza nombre vacío, corto, largo o que no es texto', () => {
    for (const nombre of ['', ' ', 'a', 'x'.repeat(101), 7, null, undefined]) {
      expect(validarProveedorCrear({ nombre }).ok).toBe(false);
    }
  });

  test('rechaza contacto o dirección demasiado largos o que no son texto', () => {
    expect(validarProveedorCrear({ nombre: 'Prov', contacto: 'x'.repeat(101) }).ok).toBe(false);
    expect(validarProveedorCrear({ nombre: 'Prov', direccion: 'x'.repeat(201) }).ok).toBe(false);
    expect(validarProveedorCrear({ nombre: 'Prov', contacto: 5 }).ok).toBe(false);
  });

  test('rechaza cuerpos que no son objeto y no deja pasar panaderia_id ni grupo_id', () => {
    for (const cuerpo of [null, undefined, 'x', 3, []]) expect(validarProveedorCrear(cuerpo).ok).toBe(false);
    const r = validarProveedorCrear({ nombre: 'Prov', panaderia_id: 'otra', grupo_id: 'otro' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.datos).sort()).toEqual(['contacto', 'direccion', 'nombre', 'telefono']);
  });
});

describe('validarProveedorEditar', () => {
  test('acepta cambios parciales y permite vaciar los opcionales', () => {
    expect(validarProveedorEditar({ telefono: '3101112233', contacto: null })).toEqual({
      ok: true,
      datos: { telefono: '3101112233', contacto: null },
    });
  });

  test('permite desactivar y reactivar', () => {
    expect(validarProveedorEditar({ activo: false })).toEqual({ ok: true, datos: { activo: false } });
    expect(validarProveedorEditar({ activo: 'no' }).ok).toBe(false);
  });

  test('rechaza campos que no se pueden modificar', () => {
    for (const campo of ['panaderia_id', 'grupo_id', 'id', 'inventado']) {
      expect(validarProveedorEditar({ [campo]: 'x' }).ok).toBe(false);
    }
  });

  test('exige al menos un cambio y un nombre válido', () => {
    expect(validarProveedorEditar({}).ok).toBe(false);
    expect(validarProveedorEditar({ nombre: ' ' }).ok).toBe(false);
  });
});
