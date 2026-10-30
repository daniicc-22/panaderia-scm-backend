import { describe, expect, test } from 'vitest';
import { queSePuedeProducir, type ProductoProducible } from '../src/utils/queProducir';

const insumos = new Map([
  ['harina', { nombre: 'Harina', unidad: 'g' }],
  ['levadura', { nombre: 'Levadura', unidad: 'g' }],
  ['sal', { nombre: 'Sal', unidad: 'g' }],
]);

function producto(cambios: Partial<ProductoProducible> = {}): ProductoProducible {
  return {
    producto_id: 'p-pan',
    producto: 'Pan de maíz',
    formulacion_id: 'f-1',
    version: 2,
    rendimiento: 30,
    necesidades: new Map([
      ['harina', 500],
      ['levadura', 200],
    ]),
    bloqueo: null,
    ...cambios,
  };
}

describe('queSePuedeProducir', () => {
  test('los lotes posibles los marca el insumo que se agota primero', () => {
    const [r] = queSePuedeProducir([producto()], new Map([['harina', 1200], ['levadura', 300]]), insumos);
    expect(r!.estado).toBe('puede');
    expect(r!.lotes_posibles).toBe(1); // harina da 2,4 lotes; levadura 1,5
    expect(r!.lotes_exactos).toBe(1.5);
    expect(r!.cantidad_posible).toBe(30); // 1 lote × 30
    expect(r!.limitante).toEqual({ materia_prima_id: 'levadura', nombre: 'Levadura', unidad: 'g', disponible: 300, por_lote: 200 });
    expect(r!.faltantes).toEqual([]);
  });

  test('si no alcanza para un lote dice qué falta y cuánto', () => {
    const [r] = queSePuedeProducir([producto()], new Map([['harina', 100], ['levadura', 50]]), insumos);
    expect(r!.estado).toBe('no_alcanza');
    expect(r!.lotes_posibles).toBe(0);
    expect(r!.lotes_exactos).toBe(0.2);
    expect(r!.cantidad_posible).toBe(0);
    expect(r!.faltantes).toEqual([
      { materia_prima_id: 'harina', nombre: 'Harina', unidad: 'g', falta: 400 },
      { materia_prima_id: 'levadura', nombre: 'Levadura', unidad: 'g', falta: 150 },
    ]);
  });

  test('un insumo sin existencias registradas cuenta como cero', () => {
    const [r] = queSePuedeProducir([producto()], new Map([['harina', 5000]]), insumos);
    expect(r!.estado).toBe('no_alcanza');
    expect(r!.limitante?.materia_prima_id).toBe('levadura');
    expect(r!.faltantes).toEqual([{ materia_prima_id: 'levadura', nombre: 'Levadura', unidad: 'g', falta: 200 }]);
  });

  test('sin rendimiento no inventa la cantidad de producto', () => {
    const [r] = queSePuedeProducir([producto({ rendimiento: null })], new Map([['harina', 5000], ['levadura', 5000]]), insumos);
    expect(r!.estado).toBe('puede');
    expect(r!.lotes_posibles).toBe(10);
    expect(r!.cantidad_posible).toBeNull();
  });

  test('una receta bloqueada no se calcula y explica por qué', () => {
    const [r] = queSePuedeProducir([producto({ bloqueo: 'Usa una masa base sin receta vigente.' })], new Map(), insumos);
    expect(r!.estado).toBe('no_calculable');
    expect(r!.motivo).toBe('Usa una masa base sin receta vigente.');
    expect(r!.lotes_posibles).toBeNull();
    expect(r!.limitante).toBeNull();
  });

  test('una receta sin insumos con inventario no se calcula', () => {
    const [r] = queSePuedeProducir([producto({ necesidades: new Map() })], new Map(), insumos);
    expect(r!.estado).toBe('no_calculable');
    expect(r!.motivo).toContain('inventario');
  });

  test('primero lo que se puede producir, luego lo que no alcanza y al final lo que no se calcula', () => {
    const existencias = new Map([['harina', 5000], ['levadura', 5000], ['sal', 0]]);
    const lista = queSePuedeProducir(
      [
        producto({ producto_id: 'c', producto: 'Calculo roto', bloqueo: 'x' }),
        producto({ producto_id: 'b', producto: 'Buñuelo', necesidades: new Map([['sal', 10]]) }),
        producto({ producto_id: 'z', producto: 'Zeta', necesidades: new Map([['harina', 100]]) }),
        producto({ producto_id: 'a', producto: 'Almojábana', necesidades: new Map([['harina', 100]]) }),
      ],
      existencias,
      insumos,
    );
    expect(lista.map((i) => i.producto)).toEqual(['Almojábana', 'Zeta', 'Buñuelo', 'Calculo roto']);
  });

  test('no incluye datos de dinero', () => {
    const [r] = queSePuedeProducir([producto()], new Map([['harina', 1200], ['levadura', 300]]), insumos);
    expect(JSON.stringify(r)).not.toMatch(/precio|costo|valor/);
  });
});

describe('queSePuedeProducir: insumos que se compran al uso', () => {
  const conQueso = new Map([...insumos, ['queso', { nombre: 'Queso cuajada', unidad: 'g' }]]);

  test('no limitan: con el queso en cero igual se puede producir, y se avisa que hay que comprarlo', () => {
    const p = producto({ compra_al_uso: new Map([['queso', 300]]) });
    const [r] = queSePuedeProducir([p], new Map([['harina', 1200], ['levadura', 300]]), conQueso);
    expect(r!.estado).toBe('puede');
    expect(r!.faltantes).toEqual([]);
    expect(r!.compra_al_uso).toEqual([{ materia_prima_id: 'queso', nombre: 'Queso cuajada', unidad: 'g', por_lote: 300 }]);
  });

  test('sin insumos al uso la lista sale vacía', () => {
    const [r] = queSePuedeProducir([producto()], new Map([['harina', 1200], ['levadura', 300]]), conQueso);
    expect(r!.compra_al_uso).toEqual([]);
  });

  test('un producto no calculable también informa lo que se compra al uso', () => {
    const p = producto({ bloqueo: 'La receta usa insumos desactivados.', compra_al_uso: new Map([['queso', 300]]) });
    const [r] = queSePuedeProducir([p], new Map(), conQueso);
    expect(r!.estado).toBe('no_calculable');
    expect(r!.compra_al_uso).toHaveLength(1);
  });

  test('se ordenan por nombre', () => {
    const p = producto({ compra_al_uso: new Map([['sal', 10], ['queso', 300]]) });
    const [r] = queSePuedeProducir([p], new Map([['harina', 1200], ['levadura', 300]]), conQueso);
    expect(r!.compra_al_uso.map((c) => c.nombre)).toEqual(['Queso cuajada', 'Sal']);
  });
});
