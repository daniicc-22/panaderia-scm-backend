import { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      panaderiaId?: string;
    }
  }
}

export const resolverPanaderia =
  (prisma: PrismaClient) => async (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    try {
      if (req.usuario.rol === 'superadministrador') {
        // El superadministrador puede indicar la panadería con ?panaderiaId=...
        // Si no la indica, se usa la primera panadería activa.
        const pedida = typeof req.query.panaderiaId === 'string' ? req.query.panaderiaId : undefined;
        const panaderia = pedida
          ? await prisma.panaderia.findFirst({ where: { id: pedida, activa: true } })
          : await prisma.panaderia.findFirst({ where: { activa: true }, orderBy: { created_at: 'asc' } });
        if (!panaderia) return res.status(404).json({ error: 'No hay panadería disponible' });
        req.panaderiaId = panaderia.id;
        return next();
      }

      const asignacion = await prisma.usuario_panaderia.findFirst({
        where: { usuario_id: req.usuario.id, activo: true, panaderia: { activa: true } },
      });
      if (!asignacion) {
        return res.status(403).json({ error: 'Tu usuario no está asignado a ninguna panadería' });
      }
      req.panaderiaId = asignacion.panaderia_id;
      next();
    } catch (error) {
      console.error('Error al resolver la panadería:', error);
      res.status(500).json({ error: 'Error al resolver la panadería' });
    }
  };