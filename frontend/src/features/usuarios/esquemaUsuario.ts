import { z } from 'zod';
import { esquemaClaveNueva } from '../auth/esquemaContrasena';

export const esquemaUsuario = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(100, 'Máximo 100 caracteres'),
  nombre_usuario: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9][a-z0-9._-]{2,29}$/,
      'De 3 a 30 caracteres: letras sin tildes, números, punto, guion o guion bajo',
    ),
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Correo no válido'),
  password: esquemaClaveNueva,
  rol: z.enum(['administrador', 'operario']),
});

export type ValoresUsuario = z.infer<typeof esquemaUsuario>;

export const esquemaRestablecer = z.object({ password: esquemaClaveNueva });
export type ValoresRestablecer = z.infer<typeof esquemaRestablecer>;

export const ETIQUETA_ROL: Record<string, string> = {
  superadministrador: 'Superadministrador',
  administrador: 'Administrador',
  operario: 'Operario',
};
