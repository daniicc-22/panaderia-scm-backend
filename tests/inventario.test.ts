import { describe, expect, test } from 'vitest';
import {
  alertasDeLotes,
  diasHasta,
  estadoLote,
  ordenarLotes,
  resumirStock,
  validarDiasAlerta,
  type LoteVista,
} from '../src/utils/inventario';

const lote = (id: string, extra: Partial<LoteVista> = {}): LoteVista => ({
  id,
  codigo_lote: id,
  cantidad_inicial: 100,
  cantidad_disponible: 100,
  costo_unitario: 2,
  fecha_vencimiento: null,
  created_at: '2026-10-01T10:00:00.000Z',
  ...extra,
});
const HOY = '2026-10-24';

describe('diasHasta / estadoLote', () => {
  test('cuenta días de calendario, también entre meses y años', () => {
    expect(diasHasta(HOY, '2026-10-24')).toBe(0);
    expect(diasHasta(HOY, '2026-10-31')).toBe(7);
    expect(diasHasta(HOY, '2026-10-23')).toBe(-1);
    expect(diasHasta('2026-12-30', '2027-01-02')).toBe(3);
  });
  test('sin fecha es ok; vencido solo si ya pasó; por vencer hasta 7 días inclusive', () => {
    expect(estadoLote(null, HOY)).toBe('ok');
    expect(estadoLote('2026-10-23', HOY)).toBe('vencido');
    expect(estadoLote('2026-10-24', HOY)).toBe('por_vencer');
    expect(estadoLote('2026-10-31', HOY)).toBe('por_vencer');
    expect(estadoLote('2026-11-01', HOY)).toBe('ok');
    expect(estadoLote('2026-11-01', HOY, 8)).toBe('por_vencer');
  });
});

describe('ordenarLotes', () => {
  const a = lote('a', { fecha_vencimiento: '2026-12-01', created_at: '2026-10-03T00:00:00Z' });
  const b = lote('b', { fecha_vencimiento: '2026-11-01', created_at: '2026-10-05T00:00:00Z' });
  const c = lote('c', { fecha_vencimiento: null, created_at: '2026-10-01T00:00:00Z' });
  const d = lote('d', { fecha_vencimiento: '2026-11-01', created_at: '2026-10-02T00:00:00Z' });
  test('FEFO: vence primero sale primero, empate por llegada, sin fecha al final', () => {
    expect(ordenarLotes([a, b, c, d], 'FEFO').map((l) => l.id)).toEqual(['d', 'b', 'a', 'c']);
  });
  test('FIFO y sin criterio: por llegada, ignorando el vencimiento', () => {
    expect(ordenarLotes([a, b, c, d], 'FIFO').map((l) => l.id)).toEqual(['c', 'd', 'a', 'b']);
    expect(ordenarLotes([a, b, c, d], null).map((l) => l.id)).toEqual(['c', 'd', 'a', 'b']);
    expect(ordenarLotes([a, b, c, d], 'ninguno').map((l) => l.id)).toEqual(['c', 'd', 'a', 'b']);
  });
  test('misma llegada: desempata por id y no modifica el arreglo original', () => {
    const x = lote('x');
    const y = lote('y');
    const original = [y, x];
    expect(ordenarLotes(original, null).map((l) => l.id)).toEqual(['x', 'y']);
    expect(original.map((l) => l.id)).toEqual(['y', 'x']);
  });
});

describe('resumirStock', () => {
  test('sin lotes o con todos agotados: sin_stock', () => {
    const vacio = { stock: 0, lotes_activos: 0, proximo_vencimiento: null, estado: 'sin_stock', valor: 0 };
    expect(resumirStock([], HOY)).toEqual(vacio);
    expect(resumirStock([lote('a', { cantidad_disponible: 0 })], HOY)).toEqual(vacio);
  });
  test('suma existencias y valor solo de lotes activos', () => {
    const r = resumirStock(
      [
        lote('a', { cantidad_disponible: 100.5, costo_unitario: 2 }),
        lote('b', { cantidad_disponible: 50, costo_unitario: 3.3333 }),
        lote('c', { cantidad_disponible: 0, costo_unitario: 99 }),
      ],
      HOY,
    );
    expect(r.stock).toBe(150.5);
    expect(r.lotes_activos).toBe(2);
    expect(r.valor).toBe(367.67);
    expect(r.estado).toBe('ok');
  });
  test('el estado es el peor entre los lotes con existencias; un lote agotado vencido no cuenta', () => {
    expect(resumirStock([lote('a', { fecha_vencimiento: '2026-10-30' }), lote('b')], HOY).estado).toBe('por_vencer');
    expect(
      resumirStock([lote('a', { fecha_vencimiento: '2026-10-30' }), lote('b', { fecha_vencimiento: '2026-10-01' })], HOY).estado,
    ).toBe('vencido');
    expect(resumirStock([lote('a', { fecha_vencimiento: '2026-10-01', cantidad_disponible: 0 }), lote('b')], HOY).estado).toBe('ok');
  });
  test('el próximo vencimiento es la fecha más cercana entre lotes activos', () => {
    const r = resumirStock(
      [
        lote('a', { fecha_vencimiento: '2026-12-01' }),
        lote('b', { fecha_vencimiento: '2026-11-05' }),
        lote('c'),
        lote('d', { fecha_vencimiento: '2026-10-25', cantidad_disponible: 0 }),
      ],
      HOY,
    );
    expect(r.proximo_vencimiento).toBe('2026-11-05');
    expect(resumirStock([lote('a')], HOY).proximo_vencimiento).toBeNull();
  });
});

describe('validarDiasAlerta', () => {
  test('sin valor usa 7; acepta enteros de 1 a 60', () => {
    expect(validarDiasAlerta(undefined)).toEqual({ ok: true, dias: 7 });
    expect(validarDiasAlerta('1')).toEqual({ ok: true, dias: 1 });
    expect(validarDiasAlerta(' 30 ')).toEqual({ ok: true, dias: 30 });
    expect(validarDiasAlerta('60')).toEqual({ ok: true, dias: 60 });
  });

  test('rechaza 0, 61, decimales, negativos, texto, vacío y valores repetidos (arreglo)', () => {
    for (const malo of ['0', '61', '2.5', '-3', 'abc', '', '1e1', ['5', '6'], { a: 1 }]) {
      expect(validarDiasAlerta(malo).ok).toBe(false);
    }
  });
});

describe('alertasDeLotes', () => {
  const con = (id: string, materia: string, extra: Partial<LoteVista> = {}) => ({ ...lote(id, extra), materia_prima_id: materia });

  test('incluye vencidos y por vencer, deja fuera los que están al día, sin fecha o agotados', () => {
    const r = alertasDeLotes(
      [
        con('vencido', 'm1', { fecha_vencimiento: '2026-10-20' }),
        con('hoy', 'm1', { fecha_vencimiento: '2026-10-24' }),
        con('limite', 'm2', { fecha_vencimiento: '2026-10-31' }),
        con('lejos', 'm2', { fecha_vencimiento: '2026-11-01' }),
        con('sin-fecha', 'm2'),
        con('agotado', 'm2', { fecha_vencimiento: '2026-10-20', cantidad_disponible: 0 }),
      ],
      HOY,
    );
    expect(r.map((a) => [a.lote_id, a.estado, a.dias])).toEqual([
      ['vencido', 'vencido', -4],
      ['hoy', 'por_vencer', 0],
      ['limite', 'por_vencer', 7],
    ]);
  });

  test('ordena del que vence antes al que vence después y desempata por id', () => {
    const r = alertasDeLotes(
      [
        con('b', 'm1', { fecha_vencimiento: '2026-10-26' }),
        con('z', 'm1', { fecha_vencimiento: '2026-10-25' }),
        con('a', 'm1', { fecha_vencimiento: '2026-10-25' }),
        con('muy-vencido', 'm1', { fecha_vencimiento: '2026-09-01' }),
      ],
      HOY,
    );
    expect(r.map((a) => a.lote_id)).toEqual(['muy-vencido', 'a', 'z', 'b']);
  });

  test('respeta los días de aviso pedidos y calcula el valor del lote', () => {
    const lotes = [con('x', 'm1', { fecha_vencimiento: '2026-11-10', cantidad_disponible: 500, costo_unitario: 1.5 })];
    expect(alertasDeLotes(lotes, HOY)).toEqual([]);
    const r = alertasDeLotes(lotes, HOY, 30);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ estado: 'por_vencer', dias: 17, valor: 750, cantidad_disponible: 500, materia_prima_id: 'm1' });
  });

  test('sin lotes no hay alertas', () => {
    expect(alertasDeLotes([], HOY)).toEqual([]);
  });
});
