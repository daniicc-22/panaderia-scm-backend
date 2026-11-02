import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface PayloadUsuario {
  id: string;
  email: string | null;
  rol: string;
}

declare global {
  namespace Express {
    interface Request {
      usuario?: PayloadUsuario;
    }
  }
}

export function verificarToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No se proporcionó un token de acceso' });
  }

  const token = authHeader.slice('Bearer '.length);
  const jwtSecret = process.env.JWT_SECRET;

  if (!jwtSecret) {
    console.error('JWT_SECRET no está configurado en .env');
    return res.status(500).json({ error: 'Error de configuración del servidor' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret) as PayloadUsuario;
    req.usuario = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

export function autorizarRoles(...rolesPermitidos: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'No se proporcionó un token de acceso' });
    }

    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para realizar esta acción' });
    }

    next();
  };
}