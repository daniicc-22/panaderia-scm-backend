-- Sprint 7: modo de reposición por insumo. 'periodica' = se calcula cuándo y cuánto pedir (por defecto);
-- 'al_uso' = perecedero que se compra según la producción (p. ej. queso cuajada): no entra en las alertas de compra.
-- Se puede ejecutar más de una vez sin dañar nada. Requiere haber corrido antes 2026-10-29_reposicion.sql.
-- Local:     psql -U postgres -d panaderia_db -f prisma/sql/2026-10-30_modo_reposicion.sql
-- Supabase:  psql "$cadena" -f prisma/sql/2026-10-30_modo_reposicion.sql
-- El archivo está en UTF-8: esta línea evita que psql en Windows lo lea como cp1252 (tildes rotas).
\encoding UTF8
BEGIN;

ALTER TABLE public.parametro_inventario ADD COLUMN IF NOT EXISTS modo_reposicion varchar(10) NOT NULL DEFAULT 'periodica';

DO $$ BEGIN
  ALTER TABLE public.parametro_inventario ADD CONSTRAINT parametro_inventario_modo_check
    CHECK (modo_reposicion IN ('periodica', 'al_uso'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Verificación
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'parametro_inventario' AND column_name = 'modo_reposicion';

SELECT conname FROM pg_constraint WHERE conname = 'parametro_inventario_modo_check';

SELECT modo_reposicion, count(*) AS parametros_activos
FROM public.parametro_inventario WHERE activo GROUP BY modo_reposicion ORDER BY modo_reposicion;

COMMIT;
