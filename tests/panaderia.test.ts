import { test } from 'vitest';
import assert from 'node:assert/strict';
import { resolverPanaderia } from '../src/middleware/panaderia';
import { crearRes, sinErroresEnConsola } from './helpers';

type Llamada = { donde: any; orden?: any };

// Base de datos simulada: registra con qué filtros se consultó
function prismaFalso(opciones: { panaderia?: any; asignacion?: any; fallar?: boolean }) {
  const llamadas = { panaderia: [] as Llamada[], asignacion: [] as Llamada[] };
  const prisma: any = {
    panaderia: {
      findFirst: async (args: any) => {
        if (opciones.fallar) throw new Error('fallo simulado');
        llamadas.panaderia.push({ donde: args.where, orden: args.orderBy });
        return opciones.panaderia ?? null;
      },
    },
    usuario_panaderia: {
      findFirst: async (args: any) => {
        if (opciones.fallar) throw new Error('fallo simulado');
        llamadas.asignacion.push({ donde: args.where });
        return opciones.asignacion ?? null;
      },
    },
  };
  return { prisma, llamadas };
}

async function ejecutar(prisma: any, usuario: any, query: any = {}) {
  const req: any = { usuario, query };
  const res = crearRes();
  let siguiente = false;
  await resolverPanaderia(prisma)(req, res, () => {
    siguiente = true;
  });
  return { req, res, siguiente };
}

test('resolverPanaderia: sin usuario autenticado responde 401', async () => {
  const { prisma } = prismaFalso({});
  const { res, siguiente } = await ejecutar(prisma, undefined);
  assert.equal(res.statusCode, 401);
  assert.equal(siguiente, false);
});

test('resolverPanaderia: el administrador recibe la panadería de su asignación', async () => {
  const { prisma, llamadas } = prismaFalso({ asignacion: { panaderia_id: 'p-1' } });
  const { req, siguiente } = await ejecutar(prisma, { id: 'u-1', rol: 'administrador' });
  assert.equal(siguiente, true);
  assert.equal(req.panaderiaId, 'p-1');
  assert.equal(llamadas.asignacion[0].donde.usuario_id, 'u-1');
  assert.equal(llamadas.asignacion[0].donde.activo, true);
});

test('resolverPanaderia: aislamiento: el administrador no puede elegir otra panadería con la URL', async () => {
  const { prisma, llamadas } = prismaFalso({ asignacion: { panaderia_id: 'p-1' } });
  const { req } = await ejecutar(prisma, { id: 'u-1', rol: 'administrador' }, { panaderiaId: 'p-ajena' });
  assert.equal(req.panaderiaId, 'p-1');
  assert.equal(llamadas.panaderia.length, 0);
});

test('resolverPanaderia: el operario sin asignación responde 403', async () => {
  const { prisma } = prismaFalso({ asignacion: null });
  const { res, siguiente } = await ejecutar(prisma, { id: 'u-2', rol: 'operario' });
  assert.equal(res.statusCode, 403);
  assert.equal(siguiente, false);
});

test('resolverPanaderia: el superadministrador puede elegir la panadería con ?panaderiaId', async () => {
  const { prisma, llamadas } = prismaFalso({ panaderia: { id: 'p-9' } });
  const { req, siguiente } = await ejecutar(prisma, { id: 'u-3', rol: 'superadministrador' }, { panaderiaId: 'p-9' });
  assert.equal(siguiente, true);
  assert.equal(req.panaderiaId, 'p-9');
  assert.equal(llamadas.panaderia[0].donde.id, 'p-9');
  assert.equal(llamadas.panaderia[0].donde.activa, true);
});

test('resolverPanaderia: sin ?panaderiaId el superadministrador recibe la primera panadería activa', async () => {
  const { prisma, llamadas } = prismaFalso({ panaderia: { id: 'p-1' } });
  const { req, siguiente } = await ejecutar(prisma, { id: 'u-3', rol: 'superadministrador' });
  assert.equal(siguiente, true);
  assert.equal(req.panaderiaId, 'p-1');
  assert.deepEqual(llamadas.panaderia[0].orden, { created_at: 'asc' });
});

test('resolverPanaderia: el superadministrador sin panaderías disponibles recibe 404', async () => {
  const { prisma } = prismaFalso({ panaderia: null });
  const { res, siguiente } = await ejecutar(prisma, { id: 'u-3', rol: 'superadministrador' });
  assert.equal(res.statusCode, 404);
  assert.equal(siguiente, false);
});

test('resolverPanaderia: un fallo de la base de datos responde 500', async () => {
  const { prisma } = prismaFalso({ fallar: true });
  const { res, siguiente } = await sinErroresEnConsola(() => ejecutar(prisma, { id: 'u-1', rol: 'administrador' }));
  assert.equal(res.statusCode, 500);
  assert.equal(siguiente, false);
});
