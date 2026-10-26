-- HU-17: mermas con causa y etapa, ligadas a un lote y/o a una producción, y catálogo inicial de causas.
-- Se puede ejecutar más de una vez sin dañar nada.
-- Local:     psql -U postgres -d panaderia_db -f prisma/sql/2026-10-26_mermas.sql
-- Supabase:  psql "$cadena" -f prisma/sql/2026-10-26_mermas.sql
-- El archivo está en UTF-8: esta línea evita que psql en Windows lo lea como cp1252 (tildes rotas: "caÃ­da").
\encoding UTF8
BEGIN;

-- Una merma puede ser de un insumo en un lote (se descuenta del lote), de una producción (masa quemada,
-- masa pasada: los insumos ya se descontaron al producir) o de ambos (se perdió insumo durante esa producción).
ALTER TABLE public.desperdicio ADD COLUMN IF NOT EXISTS produccion_id uuid;

DO $$ BEGIN
  ALTER TABLE public.desperdicio ADD CONSTRAINT desperdicio_produccion_fkey
    FOREIGN KEY (produccion_id, panaderia_id) REFERENCES public.produccion(id, panaderia_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.desperdicio ADD CONSTRAINT desperdicio_origen_check
    CHECK (lote_id IS NOT NULL OR produccion_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_desperdicio_produccion ON public.desperdicio (produccion_id);
CREATE INDEX IF NOT EXISTS idx_desperdicio_fecha ON public.desperdicio (panaderia_id, fecha DESC);

-- Catálogo inicial de causas para cada panadería (acordado con el piloto el 25/10/2026)
CREATE TEMP TABLE _causas_iniciales (codigo text, nombre text, descripcion text) ON COMMIT DROP;
INSERT INTO _causas_iniciales VALUES
  ('vencimiento',        'Vencimiento',                  'El insumo o producto superó su fecha de vencimiento'),
  ('derrame',            'Derrame o caída',              'Se derramó, se cayó o se ensució durante el manejo'),
  ('quemado',            'Quemado o sobrehorneado',      'Se pasó de cocción o de temperatura en el horno'),
  ('error_dosificacion', 'Error de dosificación',        'Se pesó o se agregó mal un insumo y la masa no sirvió'),
  ('masa_pasada',        'Masa pasada',                  'La masa fermentó de más o se dejó reposar demasiado'),
  ('devolucion',         'Devolución',                   'Producto o insumo devuelto que no se puede reutilizar'),
  ('otra',               'Otra',                         'Causa distinta a las anteriores');

INSERT INTO public.causa_desperdicio (panaderia_id, codigo, nombre, descripcion)
SELECT p.id, v.codigo, v.nombre, v.descripcion
FROM public.panaderia p CROSS JOIN _causas_iniciales v
ON CONFLICT (panaderia_id, codigo) DO NOTHING;

-- Repara causas guardadas con tildes rotas por una ejecución anterior con la codificación equivocada
UPDATE public.causa_desperdicio c
SET nombre = v.nombre, descripcion = v.descripcion
FROM _causas_iniciales v
WHERE c.codigo = v.codigo AND (c.nombre ~ '[ÃÂ]' OR c.descripcion ~ '[ÃÂ]');

COMMIT;

-- Verificación: la columna nueva, las restricciones y las causas por panadería
SELECT column_name FROM information_schema.columns WHERE table_name = 'desperdicio' AND column_name = 'produccion_id';
SELECT conname FROM pg_constraint WHERE conname IN ('desperdicio_produccion_fkey', 'desperdicio_origen_check') ORDER BY conname;
SELECT p.nombre AS panaderia, count(c.id) AS causas FROM public.panaderia p LEFT JOIN public.causa_desperdicio c ON c.panaderia_id = p.id GROUP BY p.nombre;
