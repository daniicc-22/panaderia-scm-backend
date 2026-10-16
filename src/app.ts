import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { verificarToken, autorizarRoles } from './middleware/autenticacion';
import { resolverPanaderia } from './middleware/panaderia';
import { crearRouterFormulaciones } from './routes/formulaciones';
import { crearRouterAbc } from './routes/abc';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

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

interface CredencialesLogin {
  email?: string;
  password?: string;
}

app.post('/login', async (req, res) => {
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
app.get('/perfil', verificarToken, autorizarRoles('superadministrador'), (req, res) => {
  res.json({
    mensaje: 'Acceso concedido: eres superadministrador',
    usuario: req.usuario,
  });
});});

app.get('/materias-primas', verificarToken, resolverPanaderia(prisma), async (req, res) => {
  try {
    const materias = await prisma.materia_prima.findMany({
      where: { panaderia_id: req.panaderiaId, activa: true },
      include: {
        categoria_materia_prima: true,
        unidad_medida: true,
        presentacion: {
          where: { activa: true },
          include: { presentacion_proveedor: { where: { vigente: true } } },
        },
      },
      orderBy: { codigo: 'asc' },
    });

    res.json(
      materias.map((m) => ({
        id: m.id,
        codigo: m.codigo,
        nombre: m.nombre,
        categoria: m.categoria_materia_prima?.nombre ?? null,
        unidad: m.unidad_medida.codigo,
        presentaciones: m.presentacion.map((p) => {
          const contenido = Number(p.contenido);
          const precio = Number(p.presentacion_proveedor[0]?.precio_referencia ?? 0);
          return {
            id: p.id,
            nombre: p.nombre,
            contenido,
            precio,
            costo_por_unidad_base: contenido > 0 ? precio / contenido : null,
          };
        }),
      })),
    );
  } catch (error) {
    console.error('Error al consultar materias primas:', error);
    res.status(500).json({ error: 'Error al consultar las materias primas' });
  }
});

app.use('/formulaciones', verificarToken, resolverPanaderia(prisma), crearRouterFormulaciones(prisma));

app.use('/abc', verificarToken, resolverPanaderia(prisma), autorizarRoles('administrador', 'superadministrador'), crearRouterAbc(prisma));
export default app;