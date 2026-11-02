import { z } from 'zod';
import { esquemaClaveNueva } from '../auth/esquemaContrasena';

const REGLA_USUARIO = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const REGLA_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Los mismos campos para el administrador y para el operario (el servidor vuelve a validar todo)
const campoUsuario = {
  nombre: z.string().trim(),
  nombre_usuario: z.string().trim().toLowerCase(),
  email: z.string().trim(),
  password: z.string(),
};

export const esquemaPanaderia = z
  .object({
    nombre: z.string().trim().min(1, 'El nombre de la panadería es obligatorio').max(100, 'Máximo 100 caracteres'),
    ciudad: z.string().trim().max(60, 'Máximo 60 caracteres'),
    direccion: z.string().trim().max(150, 'Máximo 150 caracteres'),
    telefono: z.string().trim().max(30, 'Máximo 30 caracteres'),
    administrador: z.object(campoUsuario),
    con_operario: z.boolean(),
    operario: z.object(campoUsuario),
  })
  .superRefine((v, ctx) => {
    const revisar = (clave: 'administrador' | 'operario') => {
      const u = v[clave];
      const error = (campo: string, message: string) => ctx.addIssue({ code: 'custom', path: [clave, campo], message });
      if (!u.nombre) error('nombre', 'El nombre es obligatorio');
      else if (u.nombre.length > 100) error('nombre', 'Máximo 100 caracteres');
      if (!REGLA_USUARIO.test(u.nombre_usuario)) {
        error('nombre_usuario', 'De 3 a 30 caracteres: letras sin tildes, números, punto, guion o guion bajo');
      }
      if (u.email !== '' && !REGLA_CORREO.test(u.email)) error('email', 'Correo no válido');
      const clave10 = esquemaClaveNueva.safeParse(u.password);
      if (!clave10.success) error('password', clave10.error.issues[0].message);
    };
    revisar('administrador');
    if (v.con_operario) {
      revisar('operario');
      if (v.operario.nombre_usuario && v.operario.nombre_usuario === v.administrador.nombre_usuario) {
        ctx.addIssue({ code: 'custom', path: ['operario', 'nombre_usuario'], message: 'Debe ser distinto al del administrador' });
      }
    }
  });

export type ValoresPanaderia = z.infer<typeof esquemaPanaderia>;

export const VALORES_INICIALES: ValoresPanaderia = {
  nombre: '',
  ciudad: '',
  direccion: '',
  telefono: '',
  administrador: { nombre: '', nombre_usuario: '', email: '', password: '' },
  con_operario: true,
  operario: { nombre: '', nombre_usuario: '', email: '', password: '' },
};
