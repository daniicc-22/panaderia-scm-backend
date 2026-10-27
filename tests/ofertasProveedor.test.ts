import { describe, expect, test } from 'vitest';
import { armarOfertasProveedor, type OfertaDato, type PresentacionDato } from '../src/utils/ofertasProveedor';

const A = 'prov-a';
const B = 'prov-b';
const C = 'prov-c';

const oferta = (id: string, proveedor: string, precio: number, extra: Partial<OfertaDato> = {}): OfertaDato => ({
  id,
  proveedor_id: proveedor,
  precio,
  vigente: true,
  proveedor_activo: true,
  tiempo_entrega_dias: null,
  ...extra,
});
const pres = (id: string, materia: string, contenido: number, ofertas: OfertaDato[], extra: Partial<PresentacionDato> = {}): PresentacionDato => ({
  id,
  materia_prima_id: materia,
  nombre: `Presentación ${id}`,
  contenido,
  activa: true,
  ofertas,
  ...extra,
});
const HARINA = { id: 'm-harina', codigo: 'MP-001', nombre: 'Harina', unidad: 'g' };
const AZUCAR = { id: 'm-azucar', codigo: 'MP-002', nombre: 'Azúcar', unidad: 'g' };

describe('armarOfertasProveedor', () => {
  test('una sola oferta: cuenta, se aplica y es el mejor precio', () => {
    const r = armarOfertasProveedor(A, [HARINA], [pres('p1', HARINA.id, 1000, [oferta('o1', A, 3000)])]);
    expect(r.items.length).toBe(1);
    const i = r.items[0];
    expect(i.cuenta).toBe(true);
    expect(i.aplicado).toBe(true);
    expect(i.mejor_precio).toBe(true);
    expect(i.sobre_mejor_pct).toBe(null);
    expect(i.otros_proveedores).toBe(0);
    expect(i.costo_por_unidad_base).toBe(3);
    expect(i.materia).toBe('Harina');
    expect(i.codigo).toBe('MP-001');
  });

  test('solo devuelve las ofertas del proveedor pedido', () => {
    const r = armarOfertasProveedor(A, [HARINA], [pres('p1', HARINA.id, 1000, [oferta('o1', A, 3000), oferta('o2', B, 2500)])]);
    expect(r.items.map((i) => i.oferta_id)).toEqual(['o1']);
  });

  test('compara con los demás proveedores: calcula cuánto más caro es', () => {
    const p = pres('p1', HARINA.id, 1000, [oferta('o1', A, 3300), oferta('o2', B, 3000)]);
    const a = armarOfertasProveedor(A, [HARINA], [p]).items[0];
    expect(a.mejor_precio).toBe(false);
    expect(a.sobre_mejor_pct).toBe(10);
    expect(a.aplicado).toBe(false);
    expect(a.otros_proveedores).toBe(1);
    const b = armarOfertasProveedor(B, [HARINA], [p]).items[0];
    expect(b.mejor_precio).toBe(true);
    expect(b.aplicado).toBe(true);
    expect(b.sobre_mejor_pct).toBe(null);
  });

  test('un empate en el mejor precio marca a los dos', () => {
    const p = pres('p1', HARINA.id, 1000, [oferta('o1', A, 3000), oferta('o2', B, 3000)]);
    expect(armarOfertasProveedor(A, [HARINA], [p]).items[0].mejor_precio).toBe(true);
    expect(armarOfertasProveedor(B, [HARINA], [p]).items[0].mejor_precio).toBe(true);
  });

  test('el mejor precio se compara por unidad, aunque sean presentaciones distintas', () => {
    // Bulto de 50 kg a 100.000 (2 por g) frente a saco de 25 kg a 45.000 (1,8 por g)
    const bulto = pres('bulto', HARINA.id, 50000, [oferta('o1', A, 100000)]);
    const saco = pres('saco', HARINA.id, 25000, [oferta('o2', B, 45000)]);
    const a = armarOfertasProveedor(A, [HARINA], [bulto, saco]).items[0];
    expect(a.aplicado).toBe(true); // los costos usan la presentación de mayor contenido
    expect(a.mejor_precio).toBe(false); // pero el saco del otro es más barato por g
    expect(a.sobre_mejor_pct).toBe(11.1);
    const b = armarOfertasProveedor(B, [HARINA], [bulto, saco]).items[0];
    expect(b.mejor_precio).toBe(true);
    expect(b.aplicado).toBe(false);
  });

  test('una oferta no vigente no cuenta, no se aplica ni se compara', () => {
    const p = pres('p1', HARINA.id, 1000, [oferta('o1', A, 1000, { vigente: false }), oferta('o2', B, 3000)]);
    const a = armarOfertasProveedor(A, [HARINA], [p]).items[0];
    expect(a.cuenta).toBe(false);
    expect(a.aplicado).toBe(false);
    expect(a.mejor_precio).toBe(false);
    expect(a.sobre_mejor_pct).toBe(null);
    expect(armarOfertasProveedor(B, [HARINA], [p]).items[0].mejor_precio).toBe(true);
  });

  test('un proveedor inactivo no cuenta', () => {
    const p = pres('p1', HARINA.id, 1000, [oferta('o1', A, 1000, { proveedor_activo: false }), oferta('o2', B, 3000)]);
    expect(armarOfertasProveedor(A, [HARINA], [p]).items[0].cuenta).toBe(false);
    expect(armarOfertasProveedor(B, [HARINA], [p]).items[0].otros_proveedores).toBe(0);
  });

  test('una oferta más barata en una presentación inactiva no cambia el mejor precio', () => {
    const activa = pres('p1', HARINA.id, 1000, [oferta('o1', A, 3000)]);
    const inactiva = pres('p2', HARINA.id, 1000, [oferta('o2', B, 1000)], { activa: false });
    const a = armarOfertasProveedor(A, [HARINA], [activa, inactiva]).items[0];
    expect(a.mejor_precio).toBe(true);
    expect(a.otros_proveedores).toBe(0);
  });

  test('un precio en cero no cuenta', () => {
    const p = pres('p1', HARINA.id, 1000, [oferta('o1', A, 0)]);
    expect(armarOfertasProveedor(A, [HARINA], [p]).items[0].cuenta).toBe(false);
  });

  test('una presentación inactiva hace que sus ofertas no cuenten', () => {
    const p = pres('p1', HARINA.id, 1000, [oferta('o1', A, 3000)], { activa: false });
    const i = armarOfertasProveedor(A, [HARINA], [p]).items[0];
    expect(i.presentacion_activa).toBe(false);
    expect(i.cuenta).toBe(false);
    expect(i.aplicado).toBe(false);
    expect(i.mejor_precio).toBe(false);
  });

  test('cuenta los otros proveedores distintos que sí cuentan', () => {
    const p = pres('p1', HARINA.id, 1000, [
      oferta('o1', A, 3000),
      oferta('o2', B, 3100),
      oferta('o3', B, 3200),
      oferta('o4', C, 3300, { vigente: false }),
    ]);
    expect(armarOfertasProveedor(A, [HARINA], [p]).items[0].otros_proveedores).toBe(1);
  });

  test('ordena por insumo, luego por contenido mayor y por precio', () => {
    const r = armarOfertasProveedor(
      A,
      [HARINA, AZUCAR],
      [
        pres('h1', HARINA.id, 1000, [oferta('o1', A, 3000)]),
        pres('z1', AZUCAR.id, 5000, [oferta('o2', A, 9000)]),
        pres('h2', HARINA.id, 50000, [oferta('o3', A, 100000)]),
      ],
    );
    expect(r.items.map((i) => i.oferta_id)).toEqual(['o2', 'o3', 'o1']);
  });

  test('el resumen cuenta ofertas, las que cuentan, las aplicadas y los mejores precios', () => {
    const r = armarOfertasProveedor(
      A,
      [HARINA, AZUCAR],
      [
        pres('h1', HARINA.id, 1000, [oferta('o1', A, 3000), oferta('o2', B, 2500)]),
        pres('z1', AZUCAR.id, 5000, [oferta('o3', A, 9000, { vigente: false })]),
      ],
    );
    expect(r.resumen.ofertas).toBe(2);
    expect(r.resumen.cuentan).toBe(1);
    expect(r.resumen.aplicadas).toBe(0);
    expect(r.resumen.mejor_precio).toBe(0);
  });

  test('la entrega promedio solo usa las que cuentan y tienen dato', () => {
    const r = armarOfertasProveedor(
      A,
      [HARINA, AZUCAR],
      [
        pres('h1', HARINA.id, 1000, [oferta('o1', A, 3000, { tiempo_entrega_dias: 2 })]),
        pres('z1', AZUCAR.id, 1000, [oferta('o2', A, 3000, { tiempo_entrega_dias: 3 })]),
        pres('z2', AZUCAR.id, 500, [oferta('o3', A, 1500, { tiempo_entrega_dias: 30, vigente: false }), oferta('o4', A, 1600)]),
      ],
    );
    expect(r.resumen.entrega_promedio_dias).toBe(2.5);
  });

  test('sin datos de entrega el promedio queda en nulo', () => {
    const r = armarOfertasProveedor(A, [HARINA], [pres('h1', HARINA.id, 1000, [oferta('o1', A, 3000)])]);
    expect(r.resumen.entrega_promedio_dias).toBe(null);
  });

  test('sin ofertas devuelve todo vacío', () => {
    const r = armarOfertasProveedor(A, [], []);
    expect(r.items).toEqual([]);
    expect(r.resumen).toEqual({ ofertas: 0, cuentan: 0, aplicadas: 0, mejor_precio: 0, entrega_promedio_dias: null });
  });

  test('ignora presentaciones de un insumo que no está en la lista', () => {
    const r = armarOfertasProveedor(A, [], [pres('p1', HARINA.id, 1000, [oferta('o1', A, 3000)])]);
    expect(r.items).toEqual([]);
  });
});
