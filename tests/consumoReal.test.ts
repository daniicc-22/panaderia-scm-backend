import { describe, expect, test } from 'vitest';
import { consumoReal } from '../src/utils/consumoReal';

const HOY = '2026-10-29';

describe('consumoReal', () => {
  test('promedia por semana desde el inicio de la observación', () => {
    // 28 días observados (2026-10-02 al 2026-10-29) = 4 semanas; 20.000 + 8.000 = 28.000 → 7.000 por semana
    const r = consumoReal(
      [
        { fecha: '2026-10-05', cantidad: 20000 },
        { fecha: '2026-10-20', cantidad: 8000 },
      ],
      HOY,
      '2026-10-02',
    );
    expect(r?.semanal).toBeCloseTo(7000, 6);
    expect(r?.semanasObservadas).toBe(4);
    expect(r?.total).toBe(28000);
  });

  test('antes del inicio de la observación no cuenta como semanas sin consumo', () => {
    // El sistema empezó hace 14 días: 14.000 en 2 semanas = 7.000 por semana, no 14.000 / 12
    const r = consumoReal([{ fecha: '2026-10-20', cantidad: 14000 }], HOY, '2026-10-16');
    expect(r?.semanal).toBeCloseTo(7000, 6);
    expect(r?.semanasObservadas).toBe(2);
  });

  test('ignora salidas anteriores al inicio, futuras y cantidades no positivas', () => {
    const r = consumoReal(
      [
        { fecha: '2026-09-01', cantidad: 99999 },
        { fecha: '2026-10-30', cantidad: 99999 },
        { fecha: '2026-10-20', cantidad: -5 },
        { fecha: '2026-10-20', cantidad: Number.NaN },
        { fecha: '2026-10-20', cantidad: 7000 },
      ],
      HOY,
      '2026-10-23',
    );
    // desde 23/10 hasta 29/10 son 7 días, pero la salida del 20/10 queda antes del inicio
    expect(r).toBeNull();
    const r2 = consumoReal([{ fecha: '2026-10-25', cantidad: 7000 }], HOY, '2026-10-23');
    expect(r2?.semanal).toBeCloseTo(7000, 6);
    expect(r2?.semanasObservadas).toBe(1);
  });

  test('la ventana limita la observación a las últimas 12 semanas', () => {
    // inicio hace un año; solo cuentan los últimos 84 días (2026-08-07 al 2026-10-29)
    const r = consumoReal(
      [
        { fecha: '2026-01-10', cantidad: 500000 },
        { fecha: '2026-08-07', cantidad: 8400 },
        { fecha: '2026-08-06', cantidad: 70000 },
      ],
      HOY,
      '2025-10-29',
    );
    expect(r?.semanasObservadas).toBe(12);
    expect(r?.semanal).toBeCloseTo(700, 6); // 8.400 / 12
  });

  test('con menos de una semana observada no es confiable (0 semanas)', () => {
    const r = consumoReal([{ fecha: '2026-10-28', cantidad: 1000 }], HOY, '2026-10-27');
    expect(r?.semanasObservadas).toBe(0);
  });

  test('sin inicio de observación o sin consumo devuelve null (no inventa un cero)', () => {
    expect(consumoReal([{ fecha: '2026-10-28', cantidad: 1000 }], HOY, null)).toBeNull();
    expect(consumoReal([], HOY, '2026-10-01')).toBeNull();
    expect(consumoReal([{ fecha: '2026-10-28', cantidad: 1000 }], HOY, '2026-10-30')).toBeNull();
  });

  test('rechaza ventanas inválidas', () => {
    expect(() => consumoReal([], HOY, '2026-10-01', 0)).toThrow('ventana');
    expect(() => consumoReal([], HOY, '2026-10-01', 1.5)).toThrow('ventana');
  });
});
