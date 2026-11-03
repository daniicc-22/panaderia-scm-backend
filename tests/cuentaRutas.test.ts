import express from 'express';
import bcrypt from 'bcryptjs';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { crearRouterCuenta } from '../src/routes/cuenta';
import { sinErroresEnConsola } from './helpers';

const ID = '11111111-1111-4111-8111-111111111111';
const ACTUAL = 'Clave-actual-26';
const NUEVA = 'Clave-nueva-2026';

type Fila = Record<string, any>;
let usuario: Fila | null;
let actualizaciones: Fila[];

const prismaFalso: any = {
  usuario: {
    findUnique: async ({ where }: any) => (usuario && usuario.id === where.id ? usuario : null),
    update: async ({ data }: any) => {
      actualizaciones.push(data);
      Object.assign(usuario!, data);
      return usuario;
    },
  },
};

let servidor: ReturnType<express.Application['listen']>;
let base = '';

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).usuario = { id: ID, email: null, rol: 'operario' };
    next();
  });
  app.use('/cuenta', crearRouterCuenta(prismaFalso));
  await new Promise<void>((ok) => {
    servidor = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => {
  servidor.close();
});

beforeEach(() => {
  actualizaciones = [];
  usuario = {
    id: ID,
    nombre: 'Oper',
    nombre_usuario: 'oper.a',
    password_hash: bcrypt.hashSync(ACTUAL, 4),
    activo: true,
    debe_cambiar_password: true,
  };
});

async function cambiar(cuerpo: unknown) {
  const r = await fetch(`${base}/cuenta/contrasena`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  return { status: r.status, cuerpo: (await r.json()) as any };
}

describe('POST /cuenta/contrasena', () => {
  test('con la contraseña actual correcta guarda la nueva cifrada y quita el cambio obligatorio', async () => {
    const r = await cambiar({ actual: ACTUAL, nueva: NUEVA });
    expect(r.status).toBe(200);
    expect(actualizaciones).toHaveLength(1);
    expect(actualizaciones[0].debe_cambiar_password).toBe(false);
    expect(actualizaciones[0].password_hash).not.toBe(NUEVA);
    expect(await bcrypt.compare(NUEVA, usuario!.password_hash)).toBe(true);
    expect(await bcrypt.compare(ACTUAL, usuario!.password_hash)).toBe(false);
  });

  test('con la contraseña actual equivocada responde 401 y no cambia nada', async () => {
    const r = await cambiar({ actual: 'otra-clave-1234', nueva: NUEVA });
    expect(r.status).toBe(401);
    expect(actualizaciones).toHaveLength(0);
  });

  test('sin contraseña actual responde 400', async () => {
    expect((await cambiar({ nueva: NUEVA })).status).toBe(400);
    expect((await cambiar({ actual: '', nueva: NUEVA })).status).toBe(400);
    expect((await cambiar({})).status).toBe(400);
    expect(actualizaciones).toHaveLength(0);
  });

  test('una nueva contraseña débil, con el nombre de usuario o igual a la actual responde 400', async () => {
    for (const nueva of ['corta1', 'oper.a-Clave-2026', ACTUAL, undefined]) {
      expect((await cambiar({ actual: ACTUAL, nueva })).status).toBe(400);
    }
    expect(actualizaciones).toHaveLength(0);
  });

  test('una cuenta inactiva o inexistente responde 401', async () => {
    usuario!.activo = false;
    expect((await cambiar({ actual: ACTUAL, nueva: NUEVA })).status).toBe(401);
    usuario = null;
    expect((await cambiar({ actual: ACTUAL, nueva: NUEVA })).status).toBe(401);
  });

  test('si la base falla responde 500 genérico', async () => {
    const original = prismaFalso.usuario.findUnique;
    prismaFalso.usuario.findUnique = async () => {
      throw new Error('detalle interno');
    };
    try {
      const r = await sinErroresEnConsola(() => cambiar({ actual: ACTUAL, nueva: NUEVA }));
      expect(r.status).toBe(500);
      expect(JSON.stringify(r.cuerpo)).not.toContain('detalle interno');
    } finally {
      prismaFalso.usuario.findUnique = original;
    }
  });
});
