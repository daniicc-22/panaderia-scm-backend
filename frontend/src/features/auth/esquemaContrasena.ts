import { z } from 'zod';

// Mismas reglas que el servidor (src/utils/usuarios.ts): el servidor es quien decide, esto solo avisa antes
export const esquemaClaveNueva = z
  .string()
  .min(10, 'Debe tener al menos 10 caracteres')
  .max(64, 'No puede tener más de 64 caracteres')
  .regex(/[A-Za-z]/, 'Debe incluir letras')
  .regex(/[0-9]/, 'Debe incluir números');

export const esquemaCambioContrasena = z
  .object({
    actual: z.string().min(1, 'Escribe tu contraseña actual'),
    nueva: esquemaClaveNueva,
    confirmar: z.string().min(1, 'Repite la nueva contraseña'),
  })
  .refine((v) => v.nueva === v.confirmar, { path: ['confirmar'], message: 'Las contraseñas no coinciden' })
  .refine((v) => v.nueva !== v.actual, { path: ['nueva'], message: 'Debe ser distinta de la actual' });

export type ValoresCambioContrasena = z.infer<typeof esquemaCambioContrasena>;
