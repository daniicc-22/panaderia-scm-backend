import { describe, expect, test } from 'vitest';
import {
  asignarLotes,
  intermediosAlcanzados,
  necesidadesDeProduccion,
  planificarConsumo,
  separarControlados,
  validarProduccion,
} from '../src/utils/consumo';
import type { LoteVista } from '../src/utils/inventario';
import type { LineaReceta } from '../src/utils/intermedios';

const HOY = '2026-10-24';
const F = '11111111-1111-4111-8111-111111111111';
const lote = (id: string, disp: number, extra: Partial<LoteVista> = {}): LoteVista => ({
  id,
  codigo_lote: id,
  cantidad_inicial: disp,
  cantidad_disponible: disp,
  costo_unitario: 1,
  fecha_vencimiento: null,
  created_at: '2026-10-01T00:00:00.000Z',
  ...extra,
});
const mp = (id: string, g: number): LineaReceta => ({ materia_prima_id: id, producto_intermedio_id: null, cantidad: g });
const inter = (id: string, g: number): LineaReceta => ({ materia_prima_id: null, producto_intermedio_id: id, cantidad: g });

describe('validarProduccion', () => {
  test('acepta una formulación y lotes válidos, con fracciones a 3 decimales', () => {
    expect(validarProduccion({ formulacion_id: F, lotes: 2 })).toEqual({ ok: true, datos: { formulacion_id: F, lotes: 2 } });
    const r = validarProduccion({ formulacion_id: F, lotes: 0.5555 });
    expect(r.ok && r.datos.lotes).toBe(0.556);
  });
  test('rechaza lotes no positivos, no numéricos, enormes o diminutos', () => {
    for (const lotes of [0, -1, NaN, Infinity, '2', null, 1001, 0.0001]) {
      expect(validarProduccion({ formulacion_id: F, lotes }).ok).toBe(false);
    }
    expect(validarProduccion({ formulacion_id: F, lotes: 1000 }).ok).toBe(true);
  });
  test('rechaza formulación no UUID y cuerpos que no son objeto', () => {
    expect(validarProduccion({ formulacion_id: 'x', lotes: 1 }).ok).toBe(false);
    for (const x of [null, undefined, 3, 'a', []]) expect(validarProduccion(x).ok).toBe(false);
  });
  test('reúne los dos errores a la vez', () => {
    const r = validarProduccion({ formulacion_id: 'x', lotes: 0 });
    expect(!r.ok && r.errores).toHaveLength(2);
  });
});

describe('necesidadesDeProduccion', () => {
  test('multiplica por los lotes y reparte los intermedios según el peso de su receta', () => {
    const recetas = new Map<string, LineaReceta[]>([['masa', [mp('harina', 600), mp('agua', 400)]]]);
    const n = necesidadesDeProduccion([mp('azucar', 100), inter('masa', 500)], recetas, 'pan', 2);
    expect(n.materias.get('azucar')).toBe(200);
    expect(n.materias.get('harina')).toBe(600); // 500 g de masa × 2 lotes = 1000 g → 60 % harina
    expect(n.materias.get('agua')).toBe(400);
    expect(n.sin_receta.size).toBe(0);
  });
  test('informa intermedios sin receta y ciclos, y descarta cantidades que redondean a cero', () => {
    const n = necesidadesDeProduccion([mp('sal', 0.0001), inter('sin', 10)], new Map(), 'pan', 1);
    expect(n.materias.has('sal')).toBe(false);
    expect([...n.sin_receta]).toEqual(['sin']);
    const ciclo = necesidadesDeProduccion([inter('a', 10)], new Map([['a', [inter('a', 10)]]]), 'pan', 1);
    expect([...ciclo.ciclos]).toEqual(['a']);
  });
});

describe('intermediosAlcanzados', () => {
  test('sigue los intermedios a cualquier profundidad, sin repetir ni ciclar', () => {
    const recetas = new Map<string, LineaReceta[]>([
      ['a', [mp('harina', 1), inter('b', 1)]],
      ['b', [inter('c', 1), inter('a', 1)]],
      ['c', [mp('sal', 1)]],
      ['z', [inter('a', 1)]],
    ]);
    expect([...intermediosAlcanzados([inter('a', 5), mp('x', 1)], recetas)].sort()).toEqual(['a', 'b', 'c']);
    expect(intermediosAlcanzados([mp('x', 1)], recetas).size).toBe(0);
    expect([...intermediosAlcanzados([inter('sin-receta', 1)], recetas)]).toEqual(['sin-receta']);
  });
});

describe('asignarLotes', () => {
  test('FEFO toma primero el que vence antes y completa con el siguiente', () => {
    const lotes = [
      lote('tarde', 500, { fecha_vencimiento: '2026-12-01' }),
      lote('pronto', 300, { fecha_vencimiento: '2026-11-01' }),
    ];
    const r = asignarLotes(400, lotes, 'FEFO', HOY);
    expect(r.asignaciones).toEqual([
      { lote_id: 'pronto', cantidad: 300 },
      { lote_id: 'tarde', cantidad: 100 },
    ]);
    expect(r.faltante).toBe(0);
  });
  test('FIFO y sin criterio usan el que llegó antes aunque venza después', () => {
    const lotes = [
      lote('nuevo', 500, { created_at: '2026-10-10T00:00:00Z', fecha_vencimiento: '2026-11-01' }),
      lote('viejo', 500, { created_at: '2026-10-01T00:00:00Z', fecha_vencimiento: '2027-01-01' }),
    ];
    expect(asignarLotes(100, lotes, 'FIFO', HOY).asignaciones).toEqual([{ lote_id: 'viejo', cantidad: 100 }]);
    expect(asignarLotes(100, lotes, null, HOY).asignaciones).toEqual([{ lote_id: 'viejo', cantidad: 100 }]);
  });
  test('no usa lotes vencidos y los informa; el que vence hoy todavía se puede usar', () => {
    const lotes = [lote('vencido', 400, { fecha_vencimiento: '2026-10-23' }), lote('hoy', 100, { fecha_vencimiento: HOY })];
    const r = asignarLotes(300, lotes, 'FEFO', HOY);
    expect(r.asignaciones).toEqual([{ lote_id: 'hoy', cantidad: 100 }]);
    expect(r.faltante).toBe(200);
    expect(r.vencido_omitido).toBe(400);
  });
  test('ignora lotes agotados y deja el faltante cuando no alcanza', () => {
    const r = asignarLotes(1000, [lote('a', 0), lote('b', 250.5)], null, HOY);
    expect(r.asignaciones).toEqual([{ lote_id: 'b', cantidad: 250.5 }]);
    expect(r.faltante).toBe(749.5);
  });
  test('sin lotes: todo es faltante; pedir justo lo disponible no deja faltante', () => {
    expect(asignarLotes(10, [], null, HOY)).toEqual({ asignaciones: [], faltante: 10, vencido_omitido: 0 });
    expect(asignarLotes(100, [lote('a', 100)], null, HOY).faltante).toBe(0);
  });
  test('la suma de lo asignado más el faltante siempre es lo necesario', () => {
    const lotes = [lote('a', 0.1), lote('b', 0.2), lote('c', 0.7)];
    const r = asignarLotes(0.9, lotes, null, HOY);
    const suma = r.asignaciones.reduce((s, a) => s + a.cantidad, 0);
    expect(Math.round((suma + r.faltante) * 1000) / 1000).toBe(0.9);
  });
  test('tolera el ruido de decimales de la entrada: 0,1 + 0,2 pedido contra un lote de 0,3', () => {
    const r = asignarLotes(0.1 + 0.2, [lote('a', 0.3)], null, HOY);
    expect(r.faltante).toBe(0);
    expect(r.asignaciones).toEqual([{ lote_id: 'a', cantidad: 0.3 }]);
  });
  test('no modifica los lotes recibidos', () => {
    const lotes = [lote('a', 100)];
    asignarLotes(50, lotes, null, HOY);
    expect(lotes[0].cantidad_disponible).toBe(100);
  });
});

describe('planificarConsumo', () => {
  const lotes = new Map([
    ['harina', [lote('h1', 1000)]],
    ['azucar', [lote('a1', 50)]],
  ]);
  test('completo cuando todo alcanza', () => {
    const p = planificarConsumo(new Map([['harina', 600], ['azucar', 50]]), lotes, new Map(), HOY);
    expect(p.completo).toBe(true);
    expect(p.items.map((i) => i.materia_prima_id)).toEqual(['harina', 'azucar']);
  });
  test('incompleto si falta un solo insumo y cuando un insumo no tiene lotes', () => {
    const p = planificarConsumo(new Map([['harina', 600], ['azucar', 80], ['sal', 5]]), lotes, new Map(), HOY);
    expect(p.completo).toBe(false);
    expect(p.items.map((i) => i.faltante)).toEqual([0, 30, 5]);
  });
  test('usa el criterio de rotación de cada insumo', () => {
    const l = new Map([
      ['x', [lote('tarde', 100, { fecha_vencimiento: '2026-12-01', created_at: '2026-10-01T00:00:00Z' }), lote('pronto', 100, { fecha_vencimiento: '2026-11-01', created_at: '2026-10-05T00:00:00Z' })]],
    ]);
    expect(planificarConsumo(new Map([['x', 50]]), l, new Map([['x', 'FEFO' as const]]), HOY).items[0].asignaciones[0].lote_id).toBe('pronto');
    expect(planificarConsumo(new Map([['x', 50]]), l, new Map([['x', 'FIFO' as const]]), HOY).items[0].asignaciones[0].lote_id).toBe('tarde');
  });
});

describe('separarControlados', () => {
  test('reparte lo que se descuenta de lo que no se controla, sin perder ni duplicar nada', () => {
    const necesidades = new Map([['harina', 600], ['agua', 400], ['sal', 12.5]]);
    const r = separarControlados(necesidades, new Set(['agua']));
    expect([...r.controladas]).toEqual([['harina', 600], ['sal', 12.5]]);
    expect([...r.no_controladas]).toEqual([['agua', 400]]);
  });

  test('sin insumos no controlados todo queda como controlado; un id desconocido en el conjunto no afecta', () => {
    const necesidades = new Map([['a', 1], ['b', 2]]);
    const r = separarControlados(necesidades, new Set(['zzz']));
    expect(r.controladas.size).toBe(2);
    expect(r.no_controladas.size).toBe(0);
  });
});
