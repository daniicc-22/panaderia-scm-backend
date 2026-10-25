-- HU-13: insumos que no se compran ni se guardan (agua) dejan de exigir existencias al producir.
-- Se puede ejecutar más de una vez sin dañar nada.
-- Local:     psql -U postgres -d panaderia_db -f prisma/sql/2026-10-24_controla_inventario.sql
-- Supabase:  psql "<cadena de conexión>" -f prisma/sql/2026-10-24_controla_inventario.sql
BEGIN;

ALTER TABLE public.materia_prima
  ADD COLUMN IF NOT EXISTS controla_inventario boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.materia_prima.controla_inventario IS
  'false = insumo que no se compra ni se almacena (p. ej. agua): no tiene lotes, no sale en Inventario ni en el ABC y no se descuenta al producir';

-- El agua del piloto (MP-008)
UPDATE public.materia_prima
   SET controla_inventario = false
 WHERE codigo = 'MP-008' AND lower(nombre) = 'agua';

-- Verificación: debe listar solo el agua con false
SELECT codigo, nombre, controla_inventario FROM public.materia_prima WHERE controla_inventario = false;

COMMIT;
