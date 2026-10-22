import { describe, expect, test } from 'vitest';
import {
  aLineasReceta,
  costearLineas,
  costoDeExpansion,
  demandaAnualPorMateria,
  expandirLineas,
  intermediosUsados,
  pesoReceta,
  type FormulacionDemanda,
  type LineaReceta,
  type Recetas,
} from '../src/utils/intermedios';

const HARINA = 'mp-harina';
const AGUA = 'mp-agua';
const AZUCAR = 'mp-azucar';
const QUESO = 'mp-queso';
const MASA = 'prod-masa';
const GALLETA = 'prod-galleta';
const PAN = 'prod-pan';
const CONCHA = 'prod-concha';

const mp = (id: string, cantidad: number): LineaReceta => ({ materia_prima_id: id, producto_intermedio_id: null, cantidad });
const inter = (id: string, cantidad: number): LineaReceta => ({ materia_prima_id: null, producto_intermedio_id: id, cantidad });
const recetas = (o: Record<string, LineaReceta[]>): Recetas => new Map(Object.entries(o));
const redondear = (n: number, d = 6) => Math.round(n * 10 ** d) / 10 ** d;

describe('pesoReceta', () => {
  test('suma los gramos de todas las líneas, intermedios incluidos', () => {
    expect(pesoReceta([])).toBe(0);
    expect(pesoReceta([mp(HARINA, 600), inter(MASA, 250)])).toBe(850);
  });
});

describe('expandirLineas', () => {
  // Masa: 600 g harina + 400 g agua (1000 g). Pan lleva 250 g de masa + 100 g de azúcar.
  const R = recetas({ [MASA]: [mp(HARINA, 600), mp(AGUA, 400)] });

  test('reparte los gramos del intermedio en proporción a su receta', () => {
    const e = expandirLineas([inter(MASA, 250), mp(AZUCAR, 100)], R, PAN);
    expect(e.materias.get(HARINA)).toBe(150);
    expect(e.materias.get(AGUA)).toBe(100);
    expect(e.materias.get(AZUCAR)).toBe(100);
    expect(e.sin_receta.size).toBe(0);
    expect(e.ciclos.size).toBe(0);
  });

  test('conserva el peso: lo que sale en materias es lo que entró', () => {
    const e = expandirLineas([inter(MASA, 250), mp(AZUCAR, 100)], R, PAN);
    const total = [...e.materias.values()].reduce((s, g) => s + g, 0);
    expect(redondear(total)).toBe(350);
  });

  test('sin intermedios se comporta como antes (solo escala por el factor)', () => {
    const e = expandirLineas([mp(HARINA, 1000), mp(AZUCAR, 20)], recetas({}), PAN, 312);
    expect(e.materias.get(HARINA)).toBe(312000);
    expect(e.materias.get(AZUCAR)).toBe(6240);
  });

  test('un intermedio dentro de otro se reparte en cadena', () => {
    // Relleno: 100 g de masa + 100 g de queso (200 g). Pan lleva 50 g de relleno.
    const RELLENO = 'prod-relleno';
    const r = recetas({ [MASA]: [mp(HARINA, 600), mp(AGUA, 400)], [RELLENO]: [inter(MASA, 100), mp(QUESO, 100)] });
    const e = expandirLineas([inter(RELLENO, 50)], r, PAN);
    expect(e.materias.get(QUESO)).toBe(25);
    expect(redondear(e.materias.get(HARINA)!)).toBe(15);
    expect(redondear(e.materias.get(AGUA)!)).toBe(10);
  });

  test('un intermedio sin receta se avisa y no suma nada', () => {
    const e = expandirLineas([inter(GALLETA, 80), mp(HARINA, 10)], R, CONCHA);
    expect([...e.sin_receta]).toEqual([GALLETA]);
    expect([...e.materias.keys()]).toEqual([HARINA]);
  });

  test('una receta de peso cero cuenta como sin receta (no divide entre cero)', () => {
    const e = expandirLineas([inter(MASA, 10)], recetas({ [MASA]: [] }), PAN);
    expect(e.sin_receta.has(MASA)).toBe(true);
    expect(e.materias.size).toBe(0);
  });

  test('un ciclo A -> B -> A termina y se avisa', () => {
    const r = recetas({ A: [mp(HARINA, 50), inter('B', 50)], B: [mp(AGUA, 50), inter('A', 50)] });
    const e = expandirLineas([inter('A', 100)], r, 'RAIZ');
    expect(e.ciclos.size).toBeGreaterThan(0);
    expect(e.materias.get(HARINA)).toBeGreaterThan(0);
  });

  test('un producto que se usa a sí mismo se detecta con la raíz', () => {
    const r = recetas({ [MASA]: [mp(HARINA, 100)] });
    const e = expandirLineas([inter(MASA, 10)], r, MASA);
    expect(e.ciclos.has(MASA)).toBe(true);
  });
});

describe('costoDeExpansion', () => {
  const R = recetas({ [MASA]: [mp(HARINA, 600), mp(AGUA, 400)] });
  const costos = new Map<string, number | null>([[HARINA, 3], [AGUA, 0.5], [AZUCAR, 4]]);

  test('suma costo por gramo por gramos, repartiendo el intermedio', () => {
    const e = expandirLineas([inter(MASA, 250), mp(AZUCAR, 100)], R, PAN);
    // 150 x 3 + 100 x 0,5 + 100 x 4
    expect(redondear(costoDeExpansion(e, costos).costo)).toBe(900);
    expect(costoDeExpansion(e, costos).incompleto).toBe(false);
  });

  test('un insumo sin precio deja el costo incompleto', () => {
    const e = expandirLineas([inter(MASA, 250)], R, PAN);
    const c = costoDeExpansion(e, new Map<string, number | null>([[HARINA, 3], [AGUA, null]]));
    expect(c.incompleto).toBe(true);
    expect(redondear(c.costo)).toBe(450);
  });

  test('un intermedio sin receta o un ciclo dejan el costo incompleto', () => {
    expect(costoDeExpansion(expandirLineas([inter(GALLETA, 10)], R, PAN), costos).incompleto).toBe(true);
    const ciclo = recetas({ A: [inter('A', 10), mp(HARINA, 10)] });
    expect(costoDeExpansion(expandirLineas([inter('A', 10)], ciclo, PAN), costos).incompleto).toBe(true);
  });
});

describe('demandaAnualPorMateria', () => {
  const SEMANAS = 52;
  const form = (producto_id: string, es_intermedio: boolean, lotes: number, lineas: LineaReceta[]): FormulacionDemanda => ({
    producto_id,
    es_intermedio,
    lotes_por_semana: lotes,
    lineas,
  });

  test('sin intermedios es cantidad x lotes x 52, como antes', () => {
    const f = [form(PAN, false, 6, [mp(HARINA, 1000), mp(AZUCAR, 20)])];
    const { demanda: d } = demandaAnualPorMateria(f, recetas({}), SEMANAS);
    expect(d.get(HARINA)).toBe(312000);
    expect(d.get(AZUCAR)).toBe(6240);
  });

  test('la masa que usa un pan cuenta por el pan y no se duplica como producción aparte', () => {
    const masa = form(MASA, true, 6, [mp(HARINA, 600), mp(AGUA, 400)]);
    const pan = form(PAN, false, 2, [inter(MASA, 250), mp(AZUCAR, 100)]);
    const { demanda: d } = demandaAnualPorMateria([masa, pan], recetas({ [MASA]: masa.lineas as LineaReceta[] }), SEMANAS);
    // Solo por el pan: 250/1000 x 600 g x 2 lotes x 52 semanas
    expect(redondear(d.get(HARINA)!)).toBe(15600);
    expect(redondear(d.get(AGUA)!)).toBe(10400);
    expect(d.get(AZUCAR)).toBe(10400);
  });

  test('un intermedio que nadie usa se cuenta por su cuenta', () => {
    const galleta = form(GALLETA, true, 6, [mp(HARINA, 1000)]);
    const pan = form(PAN, false, 6, [mp(AZUCAR, 20)]);
    const { demanda: d } = demandaAnualPorMateria([galleta, pan], recetas({}), SEMANAS);
    expect(d.get(HARINA)).toBe(312000);
  });

  test('un intermedio que nadie usa y sin receta vigente no rompe nada', () => {
    const pan = form(PAN, false, 6, [inter(MASA, 100), mp(AZUCAR, 20)]);
    const { demanda: d } = demandaAnualPorMateria([pan], recetas({}), SEMANAS);
    expect(d.get(AZUCAR)).toBe(6240);
    expect(d.size).toBe(1);
  });

  test('varios productos que usan la misma masa suman su parte cada uno', () => {
    const masa = form(MASA, true, 6, [mp(HARINA, 600), mp(AGUA, 400)]);
    const a = form('pan-a', false, 1, [inter(MASA, 100)]);
    const b = form('pan-b', false, 3, [inter(MASA, 200)]);
    const { demanda: d } = demandaAnualPorMateria([masa, a, b], recetas({ [MASA]: masa.lineas as LineaReceta[] }), SEMANAS);
    // harina: (100 x 1 + 200 x 3) / 1000 x 600 x 52 = 21840
    expect(redondear(d.get(HARINA)!)).toBe(21840);
  });
});

describe('intermediosUsados', () => {
  test('junta los intermedios que aparecen en las líneas', () => {
    const u = intermediosUsados([{ lineas: [inter(MASA, 1), mp(HARINA, 1)] }, { lineas: [inter(GALLETA, 1), inter(MASA, 2)] }]);
    expect([...u].sort()).toEqual([GALLETA, MASA]);
  });
});

describe('costearLineas y aLineasReceta', () => {
  const R = recetas({ [MASA]: [mp(HARINA, 600), mp(AGUA, 400)] });
  const costos = new Map<string, number | null>([[HARINA, 3], [AGUA, 0.5], [AZUCAR, 4]]);

  test('da peso, costo y completitud en una sola llamada', () => {
    const r = costearLineas([inter(MASA, 250), mp(AZUCAR, 100)], R, PAN, costos);
    expect(r.peso).toBe(350);
    expect(redondear(r.costo)).toBe(900);
    expect(r.incompleto).toBe(false);
  });

  test('sin intermedios coincide con la suma directa de costo por gramo x gramos', () => {
    const r = costearLineas([mp(HARINA, 1000), mp(AZUCAR, 20)], recetas({}), PAN, costos);
    expect(r.costo).toBe(1000 * 3 + 20 * 4);
    expect(r.peso).toBe(1020);
  });

  test('convierte las cantidades Decimal de la base en números', () => {
    const l = aLineasReceta([{ materia_prima_id: HARINA, producto_intermedio_id: null, cantidad_estandar: '12.500' }]);
    expect(l).toEqual([{ materia_prima_id: HARINA, producto_intermedio_id: null, cantidad: 12.5 }]);
  });

  test('un intermedio sin receta deja incompleto, pero el peso cuenta sus gramos', () => {
    const r = costearLineas([inter(GALLETA, 80), mp(HARINA, 10)], R, CONCHA, costos);
    expect(r.incompleto).toBe(true);
    expect(r.peso).toBe(90);
  });
});

describe('demandaAnualPorMateria: avisos', () => {
  test('informa los intermedios usados sin receta', () => {
    const pan: FormulacionDemanda = { producto_id: PAN, es_intermedio: false, lotes_por_semana: 6, lineas: [inter(MASA, 100), mp(AZUCAR, 20)] };
    const r = demandaAnualPorMateria([pan], recetas({}), 52);
    expect([...r.sin_receta]).toEqual([MASA]);
    expect(r.ciclos.size).toBe(0);
  });
});
