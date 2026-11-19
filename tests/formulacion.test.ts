import { describe, expect, test } from 'vitest';
import {
  fechaHoyColombia,
  fichaCompleta,
  hayCambios,
  validarCambiosProducto,
  validarProductoNuevo,
  validarVersion,
  type LineaVersion,
} from '../src/utils/formulacion';

const A = '33333333-3333-4333-8333-333333333331';
const B = '33333333-3333-4333-8333-333333333332';
const INTER = '44444444-4444-4444-8444-444444444441';

const linea = (id: string, cantidad: number, extra: Partial<LineaVersion> = {}): LineaVersion => ({
  materia_prima_id: id,
  producto_intermedio_id: null,
  cantidad,
  tolerancia_porcentaje: null,
  ...extra,
});

const cuerpoValido = () => ({
  rendimiento: 20,
  ingredientes: [
    { materia_prima_id: A, cantidad: 1000 },
    { materia_prima_id: B, cantidad: 20.5, tolerancia_porcentaje: 2 },
  ],
});

describe('validarVersion', () => {
  test('acepta un cuerpo válido y normaliza decimales', () => {
    const r = validarVersion({ rendimiento: 20.00049, ingredientes: [{ materia_prima_id: A, cantidad: 10.00049 }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.rendimiento).toBe(20);
      expect(r.datos.ingredientes[0]).toEqual({
        materia_prima_id: A,
        producto_intermedio_id: null,
        cantidad: 10,
        tolerancia_porcentaje: null,
      });
    }
  });

  test('acepta un producto intermedio como ingrediente', () => {
    const r = validarVersion({ rendimiento: 5, ingredientes: [{ producto_intermedio_id: INTER, cantidad: 300 }] });
    expect(r.ok).toBe(true);
  });

  test('rechaza cuerpos que no son objetos', () => {
    for (const malo of [null, undefined, 'x', 5, [], [1]]) expect(validarVersion(malo).ok).toBe(false);
  });

  test('rechaza campos que no corresponden', () => {
    const r = validarVersion({ ...cuerpoValido(), version: 9 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.join(' ')).toContain('version');
  });

  test('rendimiento: obligatorio, mayor que 0, finito y con tope', () => {
    for (const malo of [undefined, null, 0, -1, '20', NaN, Infinity, 1_000_000_000, 0.0001]) {
      expect(validarVersion({ ...cuerpoValido(), rendimiento: malo }).ok).toBe(false);
    }
  });

  test('ingredientes: entre 1 y 100', () => {
    expect(validarVersion({ rendimiento: 1, ingredientes: [] }).ok).toBe(false);
    expect(validarVersion({ rendimiento: 1, ingredientes: 'x' }).ok).toBe(false);
    const cien = Array.from({ length: 100 }, (_, i) => ({
      materia_prima_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      cantidad: 1,
    }));
    expect(validarVersion({ rendimiento: 1, ingredientes: cien }).ok).toBe(true);
    const ciento1 = [...cien, { materia_prima_id: A, cantidad: 1 }];
    expect(validarVersion({ rendimiento: 1, ingredientes: ciento1 }).ok).toBe(false);
  });

  test('cada ingrediente: uno solo de los dos identificadores y uno válido', () => {
    const casos = [
      { cantidad: 1 },
      { materia_prima_id: A, producto_intermedio_id: INTER, cantidad: 1 },
      { materia_prima_id: 'no-es-uuid', cantidad: 1 },
      { materia_prima_id: 5, cantidad: 1 },
    ];
    for (const c of casos) expect(validarVersion({ rendimiento: 1, ingredientes: [c] }).ok).toBe(false);
  });

  test('cantidad: mayor que 0, finita, numérica y con tope', () => {
    for (const malo of [0, -5, '10', NaN, Infinity, undefined, null, 1_000_000_000, 0.0004]) {
      expect(validarVersion({ rendimiento: 1, ingredientes: [{ materia_prima_id: A, cantidad: malo }] }).ok).toBe(false);
    }
  });

  test('tolerancia: opcional, entre 0 y 100', () => {
    const con = (t: unknown) => validarVersion({ rendimiento: 1, ingredientes: [{ materia_prima_id: A, cantidad: 1, tolerancia_porcentaje: t }] });
    expect(con(0).ok).toBe(true);
    expect(con(100).ok).toBe(true);
    expect(con(null).ok).toBe(true);
    for (const malo of [-1, 100.5, '2', NaN]) expect(con(malo).ok).toBe(false);
  });

  test('rechaza ingredientes repetidos', () => {
    const r = validarVersion({
      rendimiento: 1,
      ingredientes: [
        { materia_prima_id: A, cantidad: 1 },
        { materia_prima_id: A, cantidad: 2 },
      ],
    });
    expect(r.ok).toBe(false);
  });

  test('reúne todos los errores en una sola respuesta', () => {
    const r = validarVersion({ rendimiento: -1, ingredientes: [{ cantidad: 0 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.length).toBeGreaterThanOrEqual(2);
  });
});

describe('hayCambios', () => {
  const actual = { rendimiento: 20, ingredientes: [linea(A, 1000), linea(B, 20.5, { tolerancia_porcentaje: 2 })] };
  const igual = () => ({ rendimiento: 20, ingredientes: [linea(B, 20.5, { tolerancia_porcentaje: 2 }), linea(A, 1000)] });

  test('mismo contenido en otro orden no es un cambio', () => {
    expect(hayCambios(actual, igual())).toBe(false);
  });

  test('detecta cambio de rendimiento, cantidad, tolerancia, ingrediente nuevo y ingrediente quitado', () => {
    expect(hayCambios(actual, { ...igual(), rendimiento: 21 })).toBe(true);
    const cantidad = igual();
    cantidad.ingredientes[1] = linea(A, 1001);
    expect(hayCambios(actual, cantidad)).toBe(true);
    const tolerancia = igual();
    tolerancia.ingredientes[0] = linea(B, 20.5, { tolerancia_porcentaje: 3 });
    expect(hayCambios(actual, tolerancia)).toBe(true);
    const nuevo = igual();
    nuevo.ingredientes.push(linea(INTER.replace('4', '5'), 5));
    expect(hayCambios(actual, nuevo)).toBe(true);
    const menos = { rendimiento: 20, ingredientes: [linea(A, 1000)] };
    expect(hayCambios(actual, menos)).toBe(true);
  });

  test('cambiar un ingrediente por otro (misma cantidad de líneas) es un cambio', () => {
    const otro = { rendimiento: 20, ingredientes: [linea(A, 1000), linea('55555555-5555-4555-8555-555555555555', 20.5, { tolerancia_porcentaje: 2 })] };
    expect(hayCambios(actual, otro)).toBe(true);
  });

  test('tolerancia vacía en ambos lados no es cambio; rendimiento null contra número sí', () => {
    const sin = { rendimiento: 20, ingredientes: [linea(A, 1000)] };
    expect(hayCambios(sin, { rendimiento: 20, ingredientes: [linea(A, 1000)] })).toBe(false);
    expect(hayCambios({ rendimiento: null, ingredientes: sin.ingredientes }, { rendimiento: 20, ingredientes: sin.ingredientes })).toBe(true);
  });

  test('un intermedio y una materia con el mismo identificador no se confunden', () => {
    const conMateria = { rendimiento: 1, ingredientes: [linea(INTER, 5)] };
    const conInter = { rendimiento: 1, ingredientes: [{ materia_prima_id: null, producto_intermedio_id: INTER, cantidad: 5, tolerancia_porcentaje: null }] };
    expect(hayCambios(conMateria, conInter)).toBe(true);
  });
});

describe('fechaHoyColombia', () => {
  test('usa la fecha de Colombia (UTC-5), no la de UTC', () => {
    // 22 de octubre 02:00 UTC = 21 de octubre 21:00 en Colombia
    expect(fechaHoyColombia(new Date('2026-10-22T02:00:00Z'))).toBe('2026-10-21');
    expect(fechaHoyColombia(new Date('2026-10-21T15:00:00Z'))).toBe('2026-10-21');
    expect(fechaHoyColombia(new Date('2026-10-21T05:00:00Z'))).toBe('2026-10-21');
    expect(fechaHoyColombia(new Date('2026-10-21T04:59:00Z'))).toBe('2026-10-20');
  });
});

describe('validarProductoNuevo', () => {
  const cuerpo = (extra: Record<string, unknown> = {}) => ({
    nombre: '  Pan   de   yuca ',
    rendimiento: 20,
    ingredientes: [{ materia_prima_id: A, cantidad: 500 }],
    ...extra,
  });

  test('acepta un cuerpo válido y limpia el nombre', () => {
    const r = validarProductoNuevo(cuerpo());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.nombre).toBe('Pan de yuca');
      expect(r.datos.rendimiento).toBe(20);
      expect(r.datos.ingredientes).toHaveLength(1);
    }
  });

  test('rechaza nombre faltante, muy corto o muy largo', () => {
    for (const malo of [undefined, null, 5, '', ' ', 'a', 'x'.repeat(101)]) {
      expect(validarProductoNuevo(cuerpo({ nombre: malo })).ok).toBe(false);
    }
    expect(validarProductoNuevo(cuerpo({ nombre: 'x'.repeat(100) })).ok).toBe(true);
  });

  test('acepta productos intermedios como ingrediente', () => {
    const r = validarProductoNuevo(cuerpo({ ingredientes: [{ producto_intermedio_id: INTER, cantidad: 10 }] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos.ingredientes[0]).toMatchObject({ materia_prima_id: null, producto_intermedio_id: INTER, cantidad: 10 });
  });

  test('es_intermedio es opcional (falso por omisión) y debe ser booleano', () => {
    const sin = validarProductoNuevo(cuerpo());
    expect(sin.ok && sin.datos.es_intermedio).toBe(false);
    const si = validarProductoNuevo(cuerpo({ es_intermedio: true }));
    expect(si.ok && si.datos.es_intermedio).toBe(true);
    const no = validarProductoNuevo(cuerpo({ es_intermedio: false }));
    expect(no.ok && no.datos.es_intermedio).toBe(false);
    for (const malo of ['true', 1, 0, null, {}]) {
      expect(validarProductoNuevo(cuerpo({ es_intermedio: malo })).ok).toBe(false);
    }
  });

  test('hereda las reglas de la versión: rendimiento, ingredientes y campos extra', () => {
    expect(validarProductoNuevo(cuerpo({ rendimiento: 0 })).ok).toBe(false);
    expect(validarProductoNuevo(cuerpo({ ingredientes: [] })).ok).toBe(false);
    expect(validarProductoNuevo(cuerpo({ unidad_produccion_id: A })).ok).toBe(false);
    expect(validarProductoNuevo(null).ok).toBe(false);
  });

  test('reúne los errores del nombre y de la versión juntos', () => {
    const r = validarProductoNuevo({ nombre: '', rendimiento: -1, ingredientes: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.length).toBeGreaterThanOrEqual(3);
  });
});

describe('validarCambiosProducto', () => {
  test('acepta dar de baja o reactivar', () => {
    expect(validarCambiosProducto({ activo: false })).toEqual({ ok: true, datos: { activo: false } });
    expect(validarCambiosProducto({ activo: true })).toEqual({ ok: true, datos: { activo: true } });
  });

  test('acepta renombrar (sin espacios sobrantes) y el precio de venta, que se puede borrar con null', () => {
    expect(validarCambiosProducto({ nombre: '  Pan   de  yuca ' })).toEqual({ ok: true, datos: { nombre: 'Pan de yuca' } });
    expect(validarCambiosProducto({ precio_venta: 1500 })).toEqual({ ok: true, datos: { precio_venta: 1500 } });
    expect(validarCambiosProducto({ precio_venta: null })).toEqual({ ok: true, datos: { precio_venta: null } });
    expect(validarCambiosProducto({ activo: true, nombre: 'Rosca' })).toEqual({ ok: true, datos: { activo: true, nombre: 'Rosca' } });
  });

  test('rechaza valores inválidos, campos extra, cuerpos vacíos y cuerpos que no son objeto', () => {
    const malos = [{}, { activo: 'si' }, { activo: 1 }, { activo: null }, { nombre: 'x' }, { nombre: 5 }, { nombre: 'x'.repeat(101) }, { precio_venta: -1 }, { precio_venta: 'caro' }, { precio_venta: 100_000_000 }, { activo: false, es_intermedio: true }, null, [], 'x'];
    for (const malo of malos) expect(validarCambiosProducto(malo).ok).toBe(false);
  });
});

describe('ficha técnica de la versión', () => {
  const base = { rendimiento: 10, ingredientes: [{ materia_prima_id: A, cantidad: 100 }] };

  test('los campos de la ficha son opcionales y no aparecen si no se envían', () => {
    const r = validarVersion(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.datos).sort()).toEqual(['ingredientes', 'rendimiento']);
  });

  test('acepta y normaliza motivo, procedimiento, tiempos, temperatura y merma', () => {
    const r = validarVersion({
      ...base,
      motivo_cambio: '  Bajamos   el azúcar ',
      procedimiento: ' 1. Amasar\r\n2. Hornear ',
      tiempo_preparacion_min: 45,
      tiempo_horneado_min: 25,
      temperatura_horneado_c: 180,
      merma_horneado_pct: 12.345,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.motivo_cambio).toBe('Bajamos el azúcar');
      expect(r.datos.procedimiento).toBe('1. Amasar\n2. Hornear');
      expect(r.datos.tiempo_horneado_min).toBe(25);
      expect(r.datos.merma_horneado_pct).toBe(12.35);
    }
  });

  test('texto vacío o null borra el campo', () => {
    const r = validarVersion({ ...base, motivo_cambio: '   ', procedimiento: null, tiempo_horneado_min: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos).toMatchObject({ motivo_cambio: null, procedimiento: null, tiempo_horneado_min: null });
  });

  test('rechaza valores fuera de rango o de otro tipo', () => {
    const malos = [
      { motivo_cambio: 'x'.repeat(301) },
      { procedimiento: 'x'.repeat(3001) },
      { procedimiento: 5 },
      { tiempo_horneado_min: -1 },
      { tiempo_horneado_min: 1441 },
      { tiempo_preparacion_min: 2.5 },
      { temperatura_horneado_c: 401 },
      { merma_horneado_pct: 61 },
      { merma_horneado_pct: -0.1 },
      { merma_horneado_pct: '10' },
    ];
    for (const m of malos) expect(validarVersion({ ...base, ...m }).ok).toBe(false);
  });

  test('hayCambios: cambiar la ficha cuenta, cambiar solo el motivo no, y lo que no se envía se ignora', () => {
    const actual = { rendimiento: 10, ingredientes: [linea(A, 100)], procedimiento: 'Amasar', tiempo_horneado_min: 25 };
    const igual = { rendimiento: 10, ingredientes: [linea(A, 100)] };
    expect(hayCambios(actual, igual)).toBe(false);
    expect(hayCambios(actual, { ...igual, motivo_cambio: 'otro motivo' })).toBe(false);
    expect(hayCambios(actual, { ...igual, procedimiento: 'Amasar' })).toBe(false);
    expect(hayCambios(actual, { ...igual, procedimiento: 'Amasar y reposar' })).toBe(true);
    expect(hayCambios(actual, { ...igual, tiempo_horneado_min: 30 })).toBe(true);
    expect(hayCambios(actual, { ...igual, tiempo_horneado_min: null })).toBe(true);
    expect(hayCambios({ ...igual }, { ...igual, merma_horneado_pct: null })).toBe(false);
  });

  test('un producto nuevo acepta precio de venta y lo valida', () => {
    const ok = validarProductoNuevo({ nombre: 'Rosca', ...base, precio_venta: 2000 });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.datos.precio_venta).toBe(2000);
    expect(validarProductoNuevo({ nombre: 'Rosca', ...base, precio_venta: -5 }).ok).toBe(false);
  });
});

describe('fichaCompleta', () => {
  test('un producto que se hornea necesita procedimiento, tiempo y temperatura de horneado', () => {
    expect(fichaCompleta({ procedimiento: 'Amasar', tiempo_horneado_min: 25, temperatura_horneado_c: 180 }, false)).toBe(true);
    expect(fichaCompleta({ procedimiento: 'Amasar', tiempo_horneado_min: 25, temperatura_horneado_c: null }, false)).toBe(false);
    expect(fichaCompleta({ procedimiento: 'Amasar', tiempo_horneado_min: null, temperatura_horneado_c: 180 }, false)).toBe(false);
    expect(fichaCompleta({ procedimiento: null, tiempo_horneado_min: 25, temperatura_horneado_c: 180 }, false)).toBe(false);
  });

  test('un intermedio solo necesita el procedimiento', () => {
    expect(fichaCompleta({ procedimiento: 'Mezclar y reposar' }, true)).toBe(true);
    expect(fichaCompleta({ procedimiento: '   ' }, true)).toBe(false);
    expect(fichaCompleta({}, true)).toBe(false);
  });
});
