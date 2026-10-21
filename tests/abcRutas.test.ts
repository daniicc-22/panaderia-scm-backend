import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { crearRouterAbc } from '../src/routes/abc';

const PAN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const HARINA = '33333333-3333-4333-8333-333333333331';
const SAL = '33333333-3333-4333-8333-333333333332';

type Fila = Record<string, any>;

const productos: Fila[] = [
  { id: 'p1', nombre: 'ZZ Vigente', activo: true },
  { id: 'p2', nombre: 'ZZ De baja', activo: false },
];
const formulaciones: Fila[] = [
  { panaderia_id: PAN_A, activa: true, producto_id: 'p1', detalle_formulacion: [{ materia_prima_id: HARINA, cantidad_estandar: 1000 }, { materia_prima_id: SAL, cantidad_estandar: 20 }] },
  { panaderia_id: PAN_A, activa: true, producto_id: 'p2', detalle_formulacion: [{ materia_prima_id: HARINA, cantidad_estandar: 90000 }] },
];
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
