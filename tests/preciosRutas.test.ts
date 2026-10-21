import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterAbc } from '../src/routes/abc';
import { costosPorUnidadBase } from '../src/routes/formulaciones';

const PAN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type Oferta = { id: string; precio_referencia: number; vigente: boolean; proveedor: { activo: boolean } };
let harina: { presentaciones: { id: string; contenido: number; activa: boolean; ofertas: Oferta[] }[] };

const filaMateria = () => ({
  id: 'mp-harina',
  codigo: 'MP-001',
  nombre: 'Harina',
  presentacion: harina.presentaciones.map((p) => ({
    id: p.id,
    contenido: p.contenido,
    activa: p.activa,
    presentacion_proveedor: p.ofertas,
  })),
});

const prismaFalso: any = {
  materia_prima: { findMany: async () => [filaMateria()] },
  formulacion: {
    findMany: async () => [
      { producto: { nombre: 'Producto de prueba' }, detalle_formulacion: [{ materia_prima_id: 'mp-harina', cantidad_estandar: 1000 }] },
    ],
  },
};

const of = (id: string, precio: number, extra: Partial<Oferta> = {}): Oferta => ({
  id,
  precio_referencia: precio,
  vigente: true,
  proveedor: { activo: true },
  ...extra,
});

beforeEach(() => {
  harina = { presentaciones: [{ id: 'p1', contenido: 50000, activa: true, ofertas: [of('o1', 87150)] }] };
});

describe('costosPorUnidadBase', () => {
  test('con una sola oferta da el costo del piloto', async () => {
    const mapa = await costosPorUnidadBase(prismaFalso, PAN);
    expect(mapa.get('mp-harina')?.costo).toBeCloseTo(1.743, 6);
  });

  test('si aparece un segundo proveedor más barato, el costo baja a ese precio', async () => {
    harina.presentaciones[0].ofertas.push(of('o2', 75000));
    expect((await costosPorUnidadBase(prismaFalso, PAN)).get('mp-harina')?.costo).toBeCloseTo(1.5, 6);
  });

  test('si el proveedor más barato se desactiva, vuelve a contar el otro', async () => {
    harina.presentaciones[0].ofertas.push(of('o2', 75000, { proveedor: { activo: false } }));
    expect((await costosPorUnidadBase(prismaFalso, PAN)).get('mp-harina')?.costo).toBeCloseTo(1.743, 6);
  });

  test('si se desactiva al único proveedor, el costo queda en null', async () => {
    harina.presentaciones[0].ofertas[0].proveedor.activo = false;
    expect((await costosPorUnidadBase(prismaFalso, PAN)).get('mp-harina')?.costo).toBeNull();
  });

  test('una oferta no vigente no cuenta', async () => {
    harina.presentaciones[0].ofertas[0].vigente = false;
    expect((await costosPorUnidadBase(prismaFalso, PAN)).get('mp-harina')?.costo).toBeNull();
  });
});

describe('GET /abc: aviso de insumos sin costo', () => {
  let servidor: ReturnType<express.Application['listen']>;
  let base = '';

  beforeAll(async () => {
    const app = express();
    app.use((req, _res, next) => {
      (req as any).usuario = { id: 'u1', email: 'x@x.com', rol: 'administrador' };
      (req as any).panaderiaId = PAN;
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

  test('con precio no hay avisos', async () => {
    const r: any = await (await fetch(base + '/abc')).json();
    expect(r.insumos_sin_costo).toEqual([]);
    expect(r.items).toHaveLength(1);
  });

  test('si el único proveedor está desactivado, el insumo aparece en insumos_sin_costo', async () => {
    harina.presentaciones[0].ofertas[0].proveedor.activo = false;
    const r: any = await (await fetch(base + '/abc')).json();
    expect(r.insumos_sin_costo).toEqual([{ codigo: 'MP-001', nombre: 'Harina' }]);
  });
});
