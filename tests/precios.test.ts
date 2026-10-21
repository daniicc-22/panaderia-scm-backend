import { describe, expect, test } from 'vitest';
import { elegirPrecio, mejorOferta, ofertaCuenta, type OfertaPrecio, type PresentacionPrecio } from '../src/utils/precios';

const oferta = (id: string, precio: number, extra: Partial<OfertaPrecio> = {}): OfertaPrecio => ({
  id,
  precio,
  vigente: true,
  proveedor_activo: true,
  ...extra,
});
const presentacion = (id: string, contenido: number, ofertas: OfertaPrecio[], activa = true): PresentacionPrecio => ({
  id,
  contenido,
  activa,
  ofertas,
});

describe('ofertaCuenta', () => {
  test('cuenta solo si está vigente, el proveedor está activo y el precio es mayor que cero', () => {
    expect(ofertaCuenta(oferta('a', 100))).toBe(true);
    expect(ofertaCuenta(oferta('a', 100, { vigente: false }))).toBe(false);
    expect(ofertaCuenta(oferta('a', 100, { proveedor_activo: false }))).toBe(false);
    expect(ofertaCuenta(oferta('a', 0))).toBe(false);
    expect(ofertaCuenta(oferta('a', -5))).toBe(false);
  });
});

describe('mejorOferta', () => {
  test('toma la de menor precio entre las que cuentan', () => {
    expect(mejorOferta([oferta('a', 120), oferta('b', 100), oferta('c', 110)])?.id).toBe('b');
  });

  test('ignora la barata si no vigente o de un proveedor desactivado', () => {
    const r = mejorOferta([oferta('a', 50, { vigente: false }), oferta('b', 60, { proveedor_activo: false }), oferta('c', 120)]);
    expect(r?.id).toBe('c');
  });

  test('con empate de precio no depende del orden de llegada', () => {
    expect(mejorOferta([oferta('b', 100), oferta('a', 100)])?.id).toBe('a');
    expect(mejorOferta([oferta('a', 100), oferta('b', 100)])?.id).toBe('a');
  });

  test('sin ofertas que cuenten devuelve null', () => {
    expect(mejorOferta([])).toBeNull();
    expect(mejorOferta([oferta('a', 100, { vigente: false })])).toBeNull();
  });

  test('no modifica la lista recibida', () => {
    const lista = [oferta('b', 120), oferta('a', 100)];
    mejorOferta(lista);
    expect(lista.map((o) => o.id)).toEqual(['b', 'a']);
  });
});

describe('elegirPrecio', () => {
  test('caso del piloto: una presentación con una oferta (harina, bulto de 50.000 g a $87.150)', () => {
    const r = elegirPrecio([presentacion('p1', 50000, [oferta('o1', 87150)])]);
    expect(r?.costo_por_unidad_base).toBeCloseTo(1.743, 6);
    expect(r?.oferta_id).toBe('o1');
  });

  test('toma la presentación de mayor contenido', () => {
    const r = elegirPrecio([presentacion('chica', 1000, [oferta('o1', 3000)]), presentacion('grande', 25000, [oferta('o2', 50000)])]);
    expect(r?.presentacion_id).toBe('grande');
    expect(r?.costo_por_unidad_base).toBe(2);
  });

  test('con dos proveedores en la presentación elegida usa el de menor precio', () => {
    const r = elegirPrecio([presentacion('p', 25000, [oferta('o1', 60000), oferta('o2', 50000)])]);
    expect(r?.oferta_id).toBe('o2');
    expect(r?.costo_por_unidad_base).toBe(2);
  });

  test('si la presentación más grande no tiene oferta que cuente, pasa a la siguiente', () => {
    const r = elegirPrecio([
      presentacion('grande', 25000, [oferta('o1', 50000, { proveedor_activo: false })]),
      presentacion('chica', 1000, [oferta('o2', 3000)]),
    ]);
    expect(r?.presentacion_id).toBe('chica');
    expect(r?.costo_por_unidad_base).toBe(3);
  });

  test('ignora presentaciones inactivas o con contenido cero', () => {
    expect(elegirPrecio([presentacion('p', 1000, [oferta('o', 3000)], false)])).toBeNull();
    expect(elegirPrecio([presentacion('p', 0, [oferta('o', 3000)])])).toBeNull();
  });

  test('si desactivas al único proveedor no queda costo (no se inventa un precio viejo)', () => {
    expect(elegirPrecio([presentacion('p', 50000, [oferta('o1', 87150, { proveedor_activo: false })])])).toBeNull();
  });

  test('sin presentaciones devuelve null', () => {
    expect(elegirPrecio([])).toBeNull();
  });

  test('el resultado no depende del orden de los datos', () => {
    const datos = [
      presentacion('b', 5000, [oferta('o3', 9000), oferta('o4', 9000)]),
      presentacion('a', 5000, [oferta('o1', 9000)]),
    ];
    expect(elegirPrecio(datos)?.presentacion_id).toBe('a');
    expect(elegirPrecio([...datos].reverse())?.presentacion_id).toBe('a');
  });
});
