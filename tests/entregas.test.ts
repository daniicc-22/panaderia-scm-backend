import { describe, expect, it } from 'vitest';
import { aKilos, diaColombia, resumirEntregas } from '../src/utils/entregas';

describe('diaColombia', () => {
  it('usa el día de Colombia (UTC−5), no el UTC', () => {
    expect(diaColombia('2026-11-19T03:00:00.000Z')).toBe('2026-11-18'); // 22:00 del 18 en Colombia
    expect(diaColombia('2026-11-19T05:00:00.000Z')).toBe('2026-11-19'); // 00:00 del 19
  });
});

describe('aKilos', () => {
  it('convierte gramos y kilos; lo demás no es de peso', () => {
    expect(aKilos(2500, 'g')).toBe(2.5);
    expect(aKilos(3, 'KG')).toBe(3);
    expect(aKilos(30, 'un')).toBeNull();
    expect(aKilos(2, 'l')).toBeNull();
  });
});

describe('resumirEntregas', () => {
  it('suma los kilos por día y cuenta los lotes', () => {
    const r = resumirEntregas([
      { created_at: '2026-11-18T15:00:00Z', cantidad_inicial: 50000, unidad: 'g' },
      { created_at: '2026-11-18T16:00:00Z', cantidad_inicial: 10, unidad: 'kg' },
      { created_at: '2026-11-19T15:00:00Z', cantidad_inicial: 1500, unidad: 'g' },
    ]);
    expect(r.dias).toEqual([
      { fecha: '2026-11-18', kg: 60, lotes: 2 },
      { fecha: '2026-11-19', kg: 1.5, lotes: 1 },
    ]);
    expect(r.sin_peso).toBe(0);
  });

  it('las entradas en unidades que no son de peso no entran en los kilos y se cuentan aparte', () => {
    const r = resumirEntregas([
      { created_at: '2026-11-18T15:00:00Z', cantidad_inicial: 30, unidad: 'un' },
      { created_at: '2026-11-18T15:00:00Z', cantidad_inicial: 2000, unidad: 'g' },
    ]);
    expect(r.dias).toEqual([{ fecha: '2026-11-18', kg: 2, lotes: 1 }]);
    expect(r.sin_peso).toBe(1);
  });

  it('sin entradas devuelve una lista vacía', () => {
    expect(resumirEntregas([])).toEqual({ dias: [], sin_peso: 0 });
  });

  it('ordena los días de menor a mayor', () => {
    const r = resumirEntregas([
      { created_at: '2026-11-20T15:00:00Z', cantidad_inicial: 1000, unidad: 'g' },
      { created_at: '2026-11-18T15:00:00Z', cantidad_inicial: 1000, unidad: 'g' },
    ]);
    expect(r.dias.map((d) => d.fecha)).toEqual(['2026-11-18', '2026-11-20']);
  });
});
