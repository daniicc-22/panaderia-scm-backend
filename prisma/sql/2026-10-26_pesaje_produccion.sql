-- HU-16 / HU-11: peso real de cada insumo por producción y cierre inmutable de la producción.
-- Se puede ejecutar más de una vez sin dañar nada.
-- Local:     psql -U postgres -d panaderia_db -f prisma/sql/2026-10-26_pesaje_produccion.sql
-- Supabase:  psql "$cadena" -f prisma/sql/2026-10-26_pesaje_produccion.sql
BEGIN;

-- Una fila por insumo de cada producción: lo que pedía la receta (estándar), lo que se usó (real) y si
-- el operario lo pesó. Si no se pesó, el real es igual al estándar (se descuenta el estándar).
CREATE TABLE IF NOT EXISTS public.pesaje_produccion (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    panaderia_id uuid NOT NULL,
    produccion_id uuid NOT NULL,
    materia_prima_id uuid NOT NULL,
    peso_estandar numeric(12,3) NOT NULL,
    peso_real numeric(12,3) NOT NULL,
    pesado boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pesaje_produccion_pkey PRIMARY KEY (id),
    CONSTRAINT pesaje_produccion_unico_key UNIQUE (produccion_id, materia_prima_id),
    CONSTRAINT pesaje_produccion_estandar_check CHECK (peso_estandar > 0),
    CONSTRAINT pesaje_produccion_real_check CHECK (peso_real > 0),
    CONSTRAINT pesaje_produccion_no_pesado_check CHECK (pesado OR peso_real = peso_estandar),
    CONSTRAINT pesaje_produccion_produccion_fkey FOREIGN KEY (produccion_id, panaderia_id)
        REFERENCES public.produccion(id, panaderia_id),
    CONSTRAINT pesaje_produccion_materia_fkey FOREIGN KEY (materia_prima_id, panaderia_id)
        REFERENCES public.materia_prima(id, panaderia_id)
);
CREATE INDEX IF NOT EXISTS idx_pesaje_produccion_materia ON public.pesaje_produccion (panaderia_id, materia_prima_id);

-- Una producción cerrada (finalizada o cancelada) no se modifica, como pide el diccionario de datos
-- (cantidad_producida inmutable tras el cierre). Las correcciones se harían con registros nuevos.
CREATE OR REPLACE FUNCTION public.fn_produccion_cerrada_inmutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.estado IN ('finalizada', 'cancelada') THEN
    RAISE EXCEPTION 'La producción % ya está cerrada y no se puede modificar', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_produccion_cerrada_inmutable ON public.produccion;
CREATE TRIGGER trg_produccion_cerrada_inmutable
    BEFORE UPDATE ON public.produccion
    FOR EACH ROW EXECUTE FUNCTION public.fn_produccion_cerrada_inmutable();

-- Mismo criterio que el resto de tablas: la API entra con el rol del dueño; el acceso directo queda cerrado
ALTER TABLE public.pesaje_produccion ENABLE ROW LEVEL SECURITY;

COMMIT;

-- Verificación: la tabla con RLS activo y el disparador creado
SELECT c.relname AS tabla, c.relrowsecurity AS rls FROM pg_class c WHERE c.relname = 'pesaje_produccion';
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_produccion_cerrada_inmutable';
