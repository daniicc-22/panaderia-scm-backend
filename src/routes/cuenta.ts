import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { validarContrasena } from '../utils/usuarios';

const COSTO_BCRYPT = 10;

// Cuenta del propio usuario (cualquier rol). Se monta con verificarToken.
export function crearRouterCuenta(prisma: PrismaClient) {
  const router = Router();

  // Cambiar la propia contraseña: exige la actual, así un token robado no basta
  router.post('/contrasena', async (req, res) => {
    const { actual, nueva } = req.body ?? {};
    if (typeof actual !== 'string' || actual.length === 0) {
      return res.status(400).json({ error: 'Escribe tu contraseña actual.' });
    }

    try {
      const usuario = await prisma.usuario.findUnique({ where: { id: req.usuario!.id } });
      if (!usuario || !usuario.activo) return res.status(401).json({ error: 'Credenciales incorrectas' });

      if (!(await bcrypt.compare(actual, usuario.password_hash))) {
        return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
      }

      const errorClave = validarContrasena(nueva, { nombreUsuario: usuario.nombre_usuario });
      if (errorClave) return res.status(400).json({ error: errorClave });
      if (nueva === actual) return res.status(400).json({ error: 'La nueva contraseña debe ser distinta de la actual.' });

      const password_hash = await bcrypt.hash(nueva, COSTO_BCRYPT);
      await prisma.usuario.update({ where: { id: usuario.id }, data: { password_hash, debe_cambiar_password: false } });
      res.json({ ok: true });
    } catch (error) {
      console.error('Error al cambiar la contraseña:', error);
      res.status(500).json({ error: 'Error al cambiar la contraseña' });
    }
  });

  return router;
}
