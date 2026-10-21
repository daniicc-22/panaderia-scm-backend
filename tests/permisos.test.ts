import { test } from 'vitest';
import assert from 'node:assert/strict';
import { puedeVerCostos } from '../src/utils/permisos';

test('permisos: administrador y superadministrador ven costos', () => {
  assert.equal(puedeVerCostos('administrador'), true);
  assert.equal(puedeVerCostos('superadministrador'), true);
});

test('permisos: el operario no ve costos', () => {
  assert.equal(puedeVerCostos('operario'), false);
});

test('permisos: sin rol o con un rol desconocido no ve costos', () => {
  assert.equal(puedeVerCostos(undefined), false);
  assert.equal(puedeVerCostos(''), false);
  assert.equal(puedeVerCostos('invitado'), false);
});
