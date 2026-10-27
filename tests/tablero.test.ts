import { describe, expect, test } from 'vitest';
import { causasFrecuentes, resumirSemana, serieDiaria, ventanaSemana } from '../src/utils/tablero';

const fila = (estado: string, planificada: number | null, producida: number | null, total = 3, pesados = 3) => ({
  estado,
  cantidad_planificada: planificada,
  cantidad_producida: producida,
  insumos_total: total,
  insumos_pesados: pesados,
});

describe('ventanaSemana', () => {
  test('abarca 7 días en hora de Colombia, hoy incluido', () => {
    const v = ventanaSemana('2026-10-26');
    expect(v.desde.toISOString()).toBe('2026-10-20T05:00:00.000Z');
    expect(v.hasta.toISOString()).toBe('2026-10-27T05:00:00.000Z');
    expect(v.desde_texto).toBe('2026-10-20');
  });

  test('cruza el fin de mes y de año', () => {
    expect(ventanaSemana('2026-01-03').desde_texto).toBe('2025-12-28');
    expect(ventanaSemana('2026-03-02').desde_texto).toBe('2026-02-24');
  });

  test('admite otra cantidad de días', () => {
    expect(ventanaSemana('2026-10-26', 1).desde_texto).toBe('2026-10-26');
  });
});

describe('resumirSemana', () => {
  test('sin producciones no inventa promedios', () => {
    expect(resumirSemana([])).toEqual({ producciones: 0, rendimiento_prom_pct: null, insumos_pesados_pct: null });
  });

  test('solo cuentan las finalizadas', () => {
    const r = resumirSemana([fila('finalizada', 10, 10), fila('en_curso', 10, null), fila('cancelada', 10, 5)]);
    expect(r.producciones).toBe(1);
    expect(r.rendimiento_prom_pct).toBe(100);
  });

  test('promedia el rendimiento de cada producción, no el total', () => {
    const r = resumirSemana([fila('finalizada', 1, 2), fila('finalizada', 100, 100)]);
    expect(r.rendimiento_prom_pct).toBe(150);
  });

  test('ignora las que no tenían cantidad planificada', () => {
    const r = resumirSemana([fila('finalizada', null, 5), fila('finalizada', 10, 9)]);
    expect(r.producciones).toBe(2);
    expect(r.rendimiento_prom_pct).toBe(90);
  });

  test('sin ninguna planificada el rendimiento queda en nulo', () => {
    expect(resumirSemana([fila('finalizada', null, 5)]).rendimiento_prom_pct).toBe(null);
  });

  test('porcentaje de insumos pesados sobre el total de insumos', () => {
    const r = resumirSemana([fila('finalizada', 10, 10, 4, 4), fila('finalizada', 10, 10, 4, 1)]);
    expect(r.insumos_pesados_pct).toBe(62.5);
  });

  test('sin insumos registrados no divide por cero', () => {
    expect(resumirSemana([fila('finalizada', 10, 10, 0, 0)]).insumos_pesados_pct).toBe(null);
  });

  test('redondea a un decimal', () => {
    const r = resumirSemana([fila('finalizada', 3, 1)]);
    expect(r.rendimiento_prom_pct).toBe(33.3);
  });
});

describe('causasFrecuentes', () => {
  test('lista vacía', () => {
    expect(causasFrecuentes([])).toEqual([]);
  });

  test('ordena por frecuencia y desempata por nombre', () => {
    const r = causasFrecuentes(['Quemado', 'Derrame', 'Derrame', 'Vencimiento', 'Quemado', 'Otra']);
    expect(r).toEqual([
      { causa: 'Derrame', veces: 2 },
      { causa: 'Quemado', veces: 2 },
      { causa: 'Otra', veces: 1 },
    ]);
  });

  test('respeta el máximo pedido', () => {
    expect(causasFrecuentes(['a', 'b', 'c', 'd'], 2).length).toBe(2);
    expect(causasFrecuentes(['a', 'b', 'c', 'd']).length).toBe(3);
  });
});

describe('serieDiaria', () => {
  const f = (iso: string, producida: number | null, estado = 'finalizada') => ({ fecha: new Date(iso), estado, cantidad_producida: producida });

  test('devuelve un registro por día, del más antiguo a hoy, con ceros donde no hubo producción', () => {
    const r = serieDiaria([], '2026-10-26');
    expect(r.length).toBe(7);
    expect(r[0]).toEqual({ fecha: '2026-10-20', producciones: 0, producidas: 0 });
    expect(r[6]).toEqual({ fecha: '2026-10-26', producciones: 0, producidas: 0 });
  });

  test('suma producciones y unidades del mismo día', () => {
    const r = serieDiaria([f('2026-10-26T15:00:00Z', 10), f('2026-10-26T18:00:00Z', 5.5)], '2026-10-26');
    expect(r[6]).toEqual({ fecha: '2026-10-26', producciones: 2, producidas: 15.5 });
  });

  test('cuenta el día en hora de Colombia: las 11:38 p. m. siguen siendo de ese día', () => {
    // 2026-10-27T04:38Z = 26 de octubre, 11:38 p. m. en Colombia
    const r = serieDiaria([f('2026-10-27T04:38:00Z', 1)], '2026-10-26');
    expect(r[6].producciones).toBe(1);
    // 2026-10-27T05:00Z ya es el 27 en Colombia y queda fuera de la ventana que termina el 26
    expect(serieDiaria([f('2026-10-27T05:00:00Z', 1)], '2026-10-26').reduce((s, x) => s + x.producciones, 0)).toBe(0);
  });

  test('ignora las no finalizadas y las fuera de la ventana', () => {
    const r = serieDiaria([f('2026-10-26T15:00:00Z', 10, 'en_curso'), f('2026-10-19T15:00:00Z', 10), f('2026-10-20T15:00:00Z', 4)], '2026-10-26');
    expect(r.reduce((s, x) => s + x.producciones, 0)).toBe(1);
    expect(r[0].producidas).toBe(4);
  });

  test('una producción sin cantidad cuenta como producción pero suma cero unidades', () => {
    const r = serieDiaria([f('2026-10-26T15:00:00Z', null)], '2026-10-26');
    expect(r[6]).toEqual({ fecha: '2026-10-26', producciones: 1, producidas: 0 });
  });

  test('cruza el fin de mes', () => {
    const r = serieDiaria([], '2026-03-02');
    expect(r[0].fecha).toBe('2026-02-24');
  });
});
