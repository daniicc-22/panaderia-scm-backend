import { describe, expect, test } from 'vitest';
import { resumirNombres } from '../src/utils/texto';

describe('resumirNombres', () => {
  test('hasta 5 nombres los lista completos', () => {
    expect(resumirNombres([])).toBe('');
    expect(resumirNombres(['A'])).toBe('A');
    expect(resumirNombres(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C, D, E');
  });

  test('con más de 5 muestra los primeros y cuántos faltan', () => {
    expect(resumirNombres(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('A, B, C, D, E y 1 más');
    expect(resumirNombres(Array.from({ length: 32 }, (_, i) => `P${i}`))).toBe('P0, P1, P2, P3, P4 y 27 más');
  });
});
