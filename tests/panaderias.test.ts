import { describe, expect, test } from 'vitest';
import { CAUSAS_INICIALES, validarCrearPanaderia } from '../src/utils/panaderias';

const CLAVE = 'Pan-de-maiz-26';
const ADMIN = { nombre: 'Laura Gómez', nombre_usuario: 'laura.gomez', password: CLAVE };
const OPER = { nombre: 'Pedro Ruiz', nombre_usuario: 'pedro.ruiz', password: CLAVE };
const BASE = { nombre: 'Panadería El Trigal', administrador: ADMIN, operario: OPER };

describe('validarCrearPanaderia', () => {
  test('acepta una panadería con administrador y operario y limpia los textos', () => {
    const r: any = validarCrearPanaderia({ ...BASE, nombre: '  Panadería El Trigal  ', ciudad: ' Ipiales ', direccion: '', telefono: ' 3001234567 ' });
    expect(r.datos).toMatchObject({ nombre: 'Panadería El Trigal', ciudad: 'Ipiales', direccion: null, telefono: '3001234567' });
    expect(r.datos.administrador).toMatchObject({ nombre_usuario: 'laura.gomez', rol: 'administrador' });
    expect(r.datos.operario).toMatchObject({ nombre_usuario: 'pedro.ruiz', rol: 'operario' });
  });

  test('el operario es opcional', () => {
    const r: any = validarCrearPanaderia({ nombre: 'Sola', administrador: ADMIN });
    expect(r.datos.operario).toBeNull();
    expect((validarCrearPanaderia({ nombre: 'Sola', administrador: ADMIN, operario: null }) as any).datos.operario).toBeNull();
  });

  test('el rol lo fija el servidor, no lo que mande el cliente', () => {
    const r: any = validarCrearPanaderia({ ...BASE, administrador: { ...ADMIN, rol: 'superadministrador' }, operario: { ...OPER, rol: 'administrador' } });
    expect(r.datos.administrador.rol).toBe('administrador');
    expect(r.datos.operario.rol).toBe('operario');
  });

  test('rechaza nombre vacío, demasiado largo o ausente', () => {
    expect(validarCrearPanaderia({ ...BASE, nombre: '   ' })).toEqual({ error: 'El nombre de la panadería es obligatorio.' });
    expect(validarCrearPanaderia({ administrador: ADMIN })).toHaveProperty('error');
    expect((validarCrearPanaderia({ ...BASE, nombre: 'x'.repeat(101) }) as any).error).toContain('100');
    expect(validarCrearPanaderia(undefined)).toHaveProperty('error');
  });

  test('rechaza ciudad, dirección o teléfono no válidos', () => {
    expect((validarCrearPanaderia({ ...BASE, ciudad: 5 }) as any).error).toContain('ciudad');
    expect((validarCrearPanaderia({ ...BASE, direccion: 'x'.repeat(151) }) as any).error).toContain('150');
    expect((validarCrearPanaderia({ ...BASE, telefono: 'x'.repeat(31) }) as any).error).toContain('30');
  });

  test('exige administrador', () => {
    expect(validarCrearPanaderia({ nombre: 'Sin admin' })).toEqual({ error: 'Indica el administrador de la panadería.' });
    expect(validarCrearPanaderia({ nombre: 'Sin admin', administrador: 'x' })).toHaveProperty('error');
  });

  test('los errores de cada usuario dicen de quién son', () => {
    expect((validarCrearPanaderia({ ...BASE, administrador: { ...ADMIN, password: 'corta1' } }) as any).error).toMatch(/^Administrador: /);
    expect((validarCrearPanaderia({ ...BASE, operario: { ...OPER, nombre_usuario: 'a' } }) as any).error).toMatch(/^Operario: /);
    expect((validarCrearPanaderia({ ...BASE, operario: 'x' }) as any).error).toContain('operario');
  });

  test('administrador y operario no pueden compartir usuario ni correo', () => {
    expect((validarCrearPanaderia({ ...BASE, operario: { ...OPER, nombre_usuario: 'Laura.Gomez' } }) as any).error).toContain('usuarios distintos');
    const mismoCorreo = validarCrearPanaderia({
      ...BASE,
      administrador: { ...ADMIN, email: 'a@pan.co' },
      operario: { ...OPER, email: 'A@pan.co' },
    });
    expect((mismoCorreo as any).error).toContain('correos distintos');
  });
});

describe('CAUSAS_INICIALES', () => {
  test('son las 7 causas acordadas, con códigos únicos', () => {
    expect(CAUSAS_INICIALES).toHaveLength(7);
    expect(new Set(CAUSAS_INICIALES.map((c) => c.codigo)).size).toBe(7);
    expect(CAUSAS_INICIALES.map((c) => c.codigo)).toContain('vencimiento');
    expect(CAUSAS_INICIALES.map((c) => c.codigo)).toContain('otra');
  });
});
