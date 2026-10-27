import { describe, expect, test } from 'vitest';
import { resumirDesviaciones, validarRango, type FilaPesaje } from '../src/utils/desviaciones';

let n = 0;
const fila = (materia: string, nombre: string, estandar: number, real: number, pesado = true, produccion = `p${++n}`): FilaPesaje => ({
  produccion_id: produccion,
  materia_prima_id: materia,
  nombre,
  peso_estandar: estandar,
  peso_real: real,
  pesado,
});

describe('resumirDesviaciones', () => {
  test('sin filas: todo vacío', () => {
    const r = resumirDesviaciones([]);
    expect(r.insumos).toEqual([]);
    expect(r.global).toEqual({ producciones: 0, pesajes: 0, pesados: 0, pct_pesado: null, desviacion_abs_media_pct: null });
  });

  test('media con signo, media sin signo y extremo de un insumo', () => {
    // +10 %, −20 %, +5 %
    const r = resumirDesviaciones([fila('h', 'Harina', 100, 110), fila('h', 'Harina', 100, 80), fila('h', 'Harina', 100, 105)]);
    const h = r.insumos[0];
    expect(h.producciones).toBe(3);
    expect(h.pesadas).toBe(3);
    expect(h.pct_pesado).toBe(100);
    expect(h.desviacion_media_pct).toBe(-1.67); // (10 − 20 + 5) / 3
    expect(h.desviacion_abs_media_pct).toBe(11.67); // (10 + 20 + 5) / 3
    expect(h.desviacion_max_pct).toBe(-20);
  });

  test('el extremo conserva su signo positivo si es el mayor', () => {
    const r = resumirDesviaciones([fila('h', 'Harina', 100, 130), fila('h', 'Harina', 100, 90)]);
    expect(r.insumos[0].desviacion_max_pct).toBe(30);
  });

  test('un insumo al ojo no entra a la desviación pero sí cuenta como producción', () => {
    const r = resumirDesviaciones([fila('s', 'Sal', 10, 12), fila('s', 'Sal', 10, 10, false), fila('s', 'Sal', 10, 10, false)]);
    const s = r.insumos[0];
    expect(s.producciones).toBe(3);
    expect(s.pesadas).toBe(1);
    expect(s.pct_pesado).toBe(33.3);
    expect(s.desviacion_media_pct).toBe(20);
    expect(s.desviacion_abs_media_pct).toBe(20);
  });

  test('un insumo que nunca se pesó queda sin desviación y al final', () => {
    const r = resumirDesviaciones([fila('a', 'Anís', 5, 5, false), fila('h', 'Harina', 100, 101)]);
    expect(r.insumos.map((i) => i.nombre)).toEqual(['Harina', 'Anís']);
    const anis = r.insumos[1];
    expect(anis).toMatchObject({ pesadas: 0, pct_pesado: 0, desviacion_media_pct: null, desviacion_abs_media_pct: null, desviacion_max_pct: null });
  });

  test('ordena de mayor a menor error típico y desempata por nombre', () => {
    const r = resumirDesviaciones([
      fila('a', 'Azúcar', 100, 103),
      fila('b', 'Levadura', 100, 90),
      fila('c', 'Harina', 100, 110),
      fila('d', 'Agua', 100, 103),
    ]);
    expect(r.insumos.map((i) => i.nombre)).toEqual(['Harina', 'Levadura', 'Agua', 'Azúcar']);
  });

  test('global: producciones distintas, porcentaje pesado y error típico de todo lo pesado', () => {
    const r = resumirDesviaciones([
      fila('h', 'Harina', 100, 110, true, 'P1'),
      fila('s', 'Sal', 10, 10, false, 'P1'),
      fila('h', 'Harina', 100, 90, true, 'P2'),
      fila('s', 'Sal', 10, 10, false, 'P2'),
    ]);
    expect(r.global.producciones).toBe(2);
    expect(r.global.pesajes).toBe(4);
    expect(r.global.pesados).toBe(2);
    expect(r.global.pct_pesado).toBe(50);
    expect(r.global.desviacion_abs_media_pct).toBe(10);
  });

  test('global sin nada pesado: error típico nulo', () => {
    const r = resumirDesviaciones([fila('s', 'Sal', 10, 10, false)]);
    expect(r.global.desviacion_abs_media_pct).toBeNull();
    expect(r.global.pct_pesado).toBe(0);
  });

  test('un estándar en 0 se ignora sin romper', () => {
    const r = resumirDesviaciones([fila('x', 'X', 0, 5), fila('x', 'X', 100, 110)]);
    expect(r.insumos[0].desviacion_media_pct).toBe(10);
  });

  test('redondea a dos decimales', () => {
    const r = resumirDesviaciones([fila('h', 'Harina', 3, 4)]); // 33,333… %
    expect(r.insumos[0].desviacion_media_pct).toBe(33.33);
  });
});

describe('validarRango', () => {
  test('sin fechas: sin límites', () => {
    expect(validarRango(undefined, undefined)).toEqual({ ok: true, datos: { desde: null, hasta: null } });
  });

  test('desde y hasta incluyen ambos días de Colombia', () => {
    const r = validarRango('2026-10-26', '2026-10-27');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.desde!.toISOString()).toBe('2026-10-26T05:00:00.000Z');
      expect(r.datos.hasta!.toISOString()).toBe('2026-10-28T05:00:00.000Z');
    }
  });

  test('un solo día: desde = hasta es válido', () => {
    const r = validarRango('2026-10-26', '2026-10-26');
    expect(r.ok).toBe(true);
  });

  test('formatos y fechas imposibles se rechazan', () => {
    for (const malo of ['26/10/2026', '2026-1-5', '2026-02-31', '2026-13-01', 'hoy', '']) {
      expect(validarRango(malo, undefined).ok).toBe(false);
      expect(validarRango(undefined, malo).ok).toBe(false);
    }
    expect(validarRango(5, undefined).ok).toBe(false);
    expect(validarRango(undefined, ['2026-10-26']).ok).toBe(false);
  });

  test('desde posterior a hasta se rechaza', () => {
    const r = validarRango('2026-10-27', '2026-10-26');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores[0]).toContain('posterior');
  });

  test('acumula los dos errores', () => {
    const r = validarRango('x', 'y');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores).toHaveLength(2);
  });
});
