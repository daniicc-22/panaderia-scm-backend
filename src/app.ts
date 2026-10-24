import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { verificarToken, autorizarRoles } from './middleware/autenticacion';
import { resolverPanaderia } from './middleware/panaderia';
import { crearRouterFormulaciones } from './routes/formulaciones';
import { crearRouterAbc } from './routes/abc';
import { crearRouterMateriasPrimas } from './routes/materiasPrimas';
import { crearRouterProveedores } from './routes/proveedores';
import { crearRouterPrecios } from './routes/precios';
import { crearRouterInventario } from './routes/inventario';

interface CredencialesLogin {
  email?: string;
  password?: string;
}

// Arma la aplicación con la base de datos que se le entrega: el servidor real le pasa Prisma y las
// pruebas, una base simulada. Todo lo que depende del entorno (secreto, CORS, límite de intentos)
// se lee aquí, al crearla, y no al importar el archivo.
export function crearApp(prisma: PrismaClient): Express {
  // En producción no se arranca con un secreto ausente o débil
  if (process.env.NODE_ENV === 'production') {
    const secreto = process.env.JWT_SECRET;
    if (!secreto || secreto.length < 32) {
      throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción');
    }
  }

  const app = express();

  // Detrás del proxy del hosting, para que el límite de intentos use la IP real
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  // CORS: solo los orígenes autorizados (lista separada por comas en CORS_ORIGINS)
  const origenesPermitidos = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(cors({ origin: origenesPermitidos }));
  app.use(express.json({ limit: '100kb' }));

  // Límite de intentos fallidos de inicio de sesión por IP (los exitosos no cuentan)
  const limitadorLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.LOGIN_MAX_INTENTOS ?? 20),
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Demasiados intentos fallidos. Intenta de nuevo en unos minutos.' },
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', mensaje: 'API panaderia-scm-backend funcionando' });
  });

  app.get('/roles', verificarToken, async (_req, res) => {
    try {
      const roles = await prisma.rol.findMany();
      res.json(roles);
    } catch (error) {
      console.error('Error al consultar roles:', error);
      res.status(500).json({ error: 'Error al consultar los roles' });
    }
  });

  app.post('/login', limitadorLogin, async (req, res) => {
    const { email, password }: CredencialesLogin = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'El correo y la contraseña son obligatorios' });
    }

    try {
      const usuario = await prisma.usuario.findUnique({
        where: { email },
        include: { rol: true },
      });

      if (!usuario || !usuario.activo) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }

      const passwordValida = await bcrypt.compare(password, usuario.password_hash);

      if (!passwordValida) {
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        console.error('JWT_SECRET no está configurado en .env');
        return res.status(500).json({ error: 'Error de configuración del servidor' });
      }

      const token = jwt.sign(
        { id: usuario.id, email: usuario.email, rol: usuario.rol.codigo },
        jwtSecret,
        { expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as jwt.SignOptions['expiresIn'] },
      );

      res.json({
        usuario: {
          id: usuario.id,
          nombre: usuario.nombre,
          email: usuario.email,
          rol: usuario.rol.codigo,
        },
        token,
      });
    } catch (error) {
      console.error('Error en /login:', error);
      res.status(500).json({ error: 'Error al iniciar sesión' });
    }
  });

  app.use('/materias-primas', verificarToken, resolverPanaderia(prisma), crearRouterMateriasPrimas(prisma));

  app.use('/proveedores', verificarToken, resolverPanaderia(prisma), crearRouterProveedores(prisma));

  app.use('/precios', verificarToken, resolverPanaderia(prisma), crearRouterPrecios(prisma));

  app.use('/inventario', verificarToken, resolverPanaderia(prisma), crearRouterInventario(prisma));

  app.use('/formulaciones', verificarToken, resolverPanaderia(prisma), crearRouterFormulaciones(prisma));

  app.use(
    '/abc',
    verificarToken,
    resolverPanaderia(prisma),
    autorizarRoles('administrador', 'superadministrador'),
    crearRouterAbc(prisma),
  );

  app.get('/mi-panaderia', verificarToken, resolverPanaderia(prisma), async (req, res) => {
    try {
      const panaderia = await prisma.panaderia.findUnique({ where: { id: req.panaderiaId! } });
      if (!panaderia) return res.status(404).json({ error: 'Panadería no encontrada' });
      res.json({ id: panaderia.id, nombre: panaderia.nombre });
    } catch (error) {
      console.error('Error al consultar la panadería:', error);
      res.status(500).json({ error: 'Error al consultar la panadería' });
    }
  });

  return app;
}
