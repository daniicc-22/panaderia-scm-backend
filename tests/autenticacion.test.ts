import { test } from 'vitest';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { autorizarRoles, verificarToken } from '../src/middleware/autenticacion';
import { crearRes, sinErroresEnConsola } from './helpers';

const SECRETO = 'secreto-de-prueba-con-mas-de-32-caracteres';
const usuario = { id: 'u-1', email: 'admin@prueba.test', rol: 'administrador' };

function conSecreto<T>(valor: string | undefined, fn: () => T): T {
  const anterior = process.env.JWT_SECRET;
  if (valor === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = valor;
  try {
    return fn();
  } finally {
    if (anterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = anterior;
  }
}

function ejecutarVerificar(authorization?: string) {
  const req: any = { headers: authorization ? { authorization } : {} };
  const res = crearRes();
  let siguiente = false;
  verificarToken(req, res, () => {
    siguiente = true;
  });
  return { req, res, siguiente };
}

test('verificarToken: sin cabecera Authorization responde 401', () => {
  const { res, siguiente } = conSecreto(SECRETO, () => ejecutarVerificar());
  assert.equal(res.statusCode, 401);
  assert.equal(siguiente, false);
});

test('verificarToken: cabecera sin el prefijo Bearer responde 401', () => {
  const token = jwt.sign(usuario, SECRETO);
  const { res, siguiente } = conSecreto(SECRETO, () => ejecutarVerificar(token));
  assert.equal(res.statusCode, 401);
  assert.equal(siguiente, false);
});

test('verificarToken: token firmado con otra clave responde 401', () => {
  const token = jwt.sign(usuario, 'otra-clave-distinta-de-32-caracteres-xx');
  const { res, siguiente } = conSecreto(SECRETO, () => ejecutarVerificar(`Bearer ${token}`));
  assert.equal(res.statusCode, 401);
  assert.equal(siguiente, false);
});

test('verificarToken: token vencido responde 401', () => {
  const token = jwt.sign(usuario, SECRETO, { expiresIn: -10 });
  const { res, siguiente } = conSecreto(SECRETO, () => ejecutarVerificar(`Bearer ${token}`));
  assert.equal(res.statusCode, 401);
  assert.equal(siguiente, false);
});

test('verificarToken: token válido continúa y deja req.usuario', () => {
  const token = jwt.sign(usuario, SECRETO);
  const { req, res, siguiente } = conSecreto(SECRETO, () => ejecutarVerificar(`Bearer ${token}`));
  assert.equal(siguiente, true);
  assert.equal(res.statusCode, 200);
  assert.equal(req.usuario.id, usuario.id);
  assert.equal(req.usuario.rol, usuario.rol);
});

test('verificarToken: sin JWT_SECRET en el servidor responde 500', async () => {
  const token = jwt.sign(usuario, SECRETO);
  const { res, siguiente } = await sinErroresEnConsola(() =>
    conSecreto(undefined, () => ejecutarVerificar(`Bearer ${token}`)),
  );
  assert.equal(res.statusCode, 500);
  assert.equal(siguiente, false);
});

function ejecutarAutorizar(roles: string[], usuarioReq?: { rol: string }) {
  const req: any = { usuario: usuarioReq };
  const res = crearRes();
  let siguiente = false;
  autorizarRoles(...roles)(req, res, () => {
    siguiente = true;
  });
  return { res, siguiente };
}

test('autorizarRoles: sin usuario autenticado responde 401', () => {
  const { res, siguiente } = ejecutarAutorizar(['administrador']);
  assert.equal(res.statusCode, 401);
  assert.equal(siguiente, false);
});

test('autorizarRoles: un rol no permitido responde 403', () => {
  const { res, siguiente } = ejecutarAutorizar(['administrador'], { rol: 'operario' });
  assert.equal(res.statusCode, 403);
  assert.equal(siguiente, false);
});

test('autorizarRoles: un rol permitido continúa', () => {
  const { res, siguiente } = ejecutarAutorizar(['administrador', 'superadministrador'], { rol: 'superadministrador' });
  assert.equal(siguiente, true);
  assert.equal(res.statusCode, 200);
});
