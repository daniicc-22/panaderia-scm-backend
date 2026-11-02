-- Ingreso por nombre de usuario (Sprint 8): el correo pasa a ser opcional.
-- Idempotente: se puede ejecutar varias veces sin dañar nada.
--   Ensayo:  psql "<cadena>" -f prisma/sql/2026-11-02_usuarios_por_nombre.sql  
-- No borra ni cambia usuarios existentes: siguen entrando con su correo.

BEGIN;

ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS nombre_usuario text;
ALTER TABLE public.usuario ADD COLUMN IF NOT EXISTS debe_cambiar_password boolean NOT NULL DEFAULT false;
ALTER TABLE public.usuario ALTER COLUMN email DROP NOT NULL;

-- Formato del nombre de usuario: 3 a 30 caracteres en minúsculas (igual que la validación de la API)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuario_nombre_usuario_formato') THEN
    ALTER TABLE public.usuario
      ADD CONSTRAINT usuario_nombre_usuario_formato
      CHECK (nombre_usuario IS NULL OR nombre_usuario ~ '^[a-z0-9][a-z0-9._-]{2,29}$');
  END IF;
  -- Toda cuenta debe poder entrar por algún medio
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuario_tiene_acceso') THEN
    ALTER TABLE public.usuario
      ADD CONSTRAINT usuario_tiene_acceso
      CHECK (email IS NOT NULL OR nombre_usuario IS NOT NULL);
  END IF;
END
$$;

-- Único en todo el sistema (el nombre es el mismo sin importar la panadería)
CREATE UNIQUE INDEX IF NOT EXISTS usuario_nombre_usuario_key ON public.usuario (nombre_usuario);

-- Comprobación: debe mostrar las dos columnas nuevas y email como nullable (YES)
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'usuario'
  AND column_name IN ('email', 'nombre_usuario', 'debe_cambiar_password')
ORDER BY column_name;

COMMIT;
