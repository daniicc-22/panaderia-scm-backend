import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterAbc } from '../src/routes/abc';

const PAN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HARINA = '33333333-3333-4333-8333-333333333331';
const SAL = '33333333-3333-4333-8333-333333333332';

type Fila = Record<string, any>;

let productos: Fila[];
let formulaciones: Fila[];

beforeEach(() => {
  productos = [
    { id: 'p1', panaderia_id: PAN_A, nombre: 'ZZ Vigente', activo: true, es_intermedio: false },
    { id: 'p2', panaderia_id: PAN_A, nombre: 'ZZ De baja', activo: false, es_intermedio: false },
  ];
  formulaciones = [
    { panaderia_id: PAN_A, activa: true, producto_id: 'p1', detalle_formulacion: [{ materia_prima_id: HARINA, cantidad_estandar: 1000 }, { materia_prima_id: SAL, cantidad_estandar: 20 }] },
    { panaderia_id: PAN_A, activa: true, producto_id: 'p2', detalle_formulacion: [{ materia_prima_id: HARINA, cantidad_estandar: 90000 }] },
  ];
});

const materias = [
  { id: HARINA, codigo: 'MP-001', nombre: 'Harina' },
  { id: SAL, codigo: 'MP-007', nombre: 'Sal' },
];

const prismaFalso: any = {
  formulacion: {
    findMany: async ({ where }: any) =>
      formulaciones
        .filter((f) => {
          const prod = productos.find((p) => p.id === f.producto_id)!;
          if (where.panaderia_id !== f.panaderia_id || where.activa !== f.activa) return false;
          if (where.producto?.activo !== undefined && prod.activo !== where.producto.activo) return false;
          return true;
        })
        .map((f) => ({ ...f, producto: productos.find((p) => p.id === f.producto_id) })),
  },
  producto: {
    findMany: async ({ where }: any) =>
      productos.filter((p) => where.id.in.includes(p.id) && p.panaderia_id === where.panaderia_id).map((p) => ({ id: p.id, nombre: p.nombre })),
  },
  materia_prima: {
    findMany: async () =>
      materias.map((m) => ({
        ...m,
        presentacion: [{ id: 'p', contenido: 1000, activa: true, presentacion_proveedor: [{ id: 'o', precio_referencia: 2000, vigente: true, proveedor: { activo: true } }] }],
      })),
  },
};

let servidor: ReturnType<express.Application['listen']>;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).panaderiaId = PAN_A;
    next();
  });
  app.use('/abc', crearRouterAbc(prismaFalso));
  await new Promise<void>((ok) => {
    servidor = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => {
  servidor.close();
});

describe('GET /abc', () => {
  test('los productos dados de baja no generan demanda', async () => {
    const r = (await (await fetch(`${base}/abc`)).json()) as any;
    const harina = r.items.find((i: any) => i.codigo === 'MP-001');
    // 1000 g por lote x 6 lotes por semana x 52 semanas = 312 kg; el producto de baja (90 kg por lote) no suma
    expect(harina.demanda_anual_kg).toBe(312);
    const sal = r.items.find((i: any) => i.codigo === 'MP-007');
    expect(sal.demanda_anual_kg).toBe(6.24);
  });
});

describe('GET /abc con productos intermedios', () => {
  const kg = async (codigo: string) => {
    const r = (await (await fetch(`${base}/abc`)).json()) as any;
    return { r, kg: r.items.find((i: any) => i.codigo === codigo)?.demanda_anual_kg };
  };
  const masa = (conReceta: boolean) => {
    productos.push({ id: 'masa', panaderia_id: PAN_A, nombre: 'ZZ Masa', activo: true, es_intermedio: true });
    if (conReceta) {
      formulaciones.push({
        panaderia_id: PAN_A, activa: true, producto_id: 'masa',
        detalle_formulacion: [{ materia_prima_id: HARINA, cantidad_estandar: 600 }, { materia_prima_id: SAL, cantidad_estandar: 400 }],
      });
    }
    // el producto vigente lleva 500 g de masa por lote
    formulaciones[0].detalle_formulacion.push({ materia_prima_id: null, producto_intermedio_id: 'masa', cantidad_estandar: 500 });
  };

  test('sin intermedios no hay avisos', async () => {
    const { r } = await kg('MP-001');
    expect(r.intermedios_sin_receta).toEqual([]);
  });

  test('la masa reparte su demanda por lo que lleva el producto y no se cuenta aparte', async () => {
    masa(true);
    // Harina: (1000 + 500/1000 x 600) x 6 lotes x 52 semanas = 405,6 kg; si la masa contara aparte serían 592,8 kg
    expect((await kg('MP-001')).kg).toBe(405.6);
    // Sal: (20 + 500/1000 x 400) x 312 = 68,64 kg
    expect((await kg('MP-007')).kg).toBe(68.64);
    expect((await kg('MP-001')).r.intermedios_sin_receta).toEqual([]);
  });

  test('una masa usada que no tiene receta se avisa y no cambia el resto de la demanda', async () => {
    masa(false);
    const { r, kg: harina } = await kg('MP-001');
    expect(harina).toBe(312);
    expect(r.intermedios_sin_receta).toEqual([{ id: 'masa', nombre: 'ZZ Masa' }]);
  });
});
