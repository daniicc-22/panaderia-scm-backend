-- HU-14: conteo físico de inventario, exactitud (ERI) y ajustes con motivo.
-- Se puede ejecutar más de una vez sin dañar nada.
-- Local:     psql -U postgres -d panaderia_db -f prisma/sql/2026-10-25_conteo_fisico.sql
-- Supabase:  psql "$cadena" -f prisma/sql/2026-10-25_conteo_fisico.sql
BEGIN;

DO $$ BEGIN
  CREATE TYPE public.estado_conteo_enum AS ENUM ('en_curso', 'enviado', 'aplicado', 'descartado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Un conteo agrupa los lotes contados en una jornada. Pasa por: en_curso (se cuenta) → enviado (espera
-- revisión) → aplicado (se ajustó el inventario) o descartado (no se ajustó nada). Un administrador puede
-- devolverlo a en_curso para que se vuelva a contar.
CREATE TABLE IF NOT EXISTS public.conteo_fisico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    panaderia_id uuid NOT NULL,
    numero integer NOT NULL,
    estado public.estado_conteo_enum DEFAULT 'en_curso' NOT NULL,
    creado_por uuid NOT NULL,
    observaciones text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    enviado_at timestamp with time zone,
    resuelto_por uuid,
    resuelto_at timestamp with time zone,
    CONSTRAINT conteo_fisico_pkey PRIMARY KEY (id),
    CONSTRAINT conteo_fisico_id_panaderia_key UNIQUE (id, panaderia_id),
    CONSTRAINT conteo_fisico_numero_key UNIQUE (panaderia_id, numero),
    CONSTRAINT conteo_fisico_numero_check CHECK (numero > 0),
    CONSTRAINT conteo_fisico_resolucion_check CHECK (
        (estado IN ('aplicado', 'descartado')) = (resuelto_por IS NOT NULL AND resuelto_at IS NOT NULL)
    ),
    CONSTRAINT conteo_fisico_panaderia_fkey FOREIGN KEY (panaderia_id) REFERENCES public.panaderia(id),
    CONSTRAINT conteo_fisico_creador_fkey FOREIGN KEY (creado_por, panaderia_id)
        REFERENCES public.usuario_panaderia(usuario_id, panaderia_id),
    CONSTRAINT conteo_fisico_resolutor_fkey FOREIGN KEY (resuelto_por, panaderia_id)
        REFERENCES public.usuario_panaderia(usuario_id, panaderia_id)
);

-- Solo puede haber un conteo en curso por panadería (evita conteos paralelos que se pisen)
CREATE UNIQUE INDEX IF NOT EXISTS ux_conteo_fisico_en_curso
    ON public.conteo_fisico (panaderia_id) WHERE estado = 'en_curso';
CREATE INDEX IF NOT EXISTS idx_conteo_fisico_panaderia ON public.conteo_fisico (panaderia_id, created_at DESC);

-- Una línea por lote contado. cantidad_sistema es lo que decía el sistema en el momento de contar:
-- la diferencia no cambia aunque después haya producciones o entradas.
CREATE TABLE IF NOT EXISTS public.detalle_conteo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    panaderia_id uuid NOT NULL,
    conteo_id uuid NOT NULL,
    lote_id uuid NOT NULL,
    cantidad_sistema numeric(12,3) NOT NULL,
    cantidad_contada numeric(12,3) NOT NULL,
    motivo text,
    observaciones text,
    contado_por uuid NOT NULL,
    contado_at timestamp with time zone DEFAULT now() NOT NULL,
    movimiento_id uuid,
    CONSTRAINT detalle_conteo_pkey PRIMARY KEY (id),
    CONSTRAINT detalle_conteo_conteo_lote_key UNIQUE (conteo_id, lote_id),
    CONSTRAINT detalle_conteo_sistema_check CHECK (cantidad_sistema >= 0),
    CONSTRAINT detalle_conteo_contada_check CHECK (cantidad_contada >= 0),
    CONSTRAINT detalle_conteo_motivo_check CHECK (
        motivo IS NULL OR motivo IN ('error_registro', 'error_produccion', 'vencimiento', 'perdida_dano', 'otro')
    ),
    CONSTRAINT detalle_conteo_conteo_fkey FOREIGN KEY (conteo_id, panaderia_id)
        REFERENCES public.conteo_fisico(id, panaderia_id),
    CONSTRAINT detalle_conteo_lote_fkey FOREIGN KEY (lote_id, panaderia_id)
        REFERENCES public.lote(id, panaderia_id),
    CONSTRAINT detalle_conteo_usuario_fkey FOREIGN KEY (contado_por, panaderia_id)
        REFERENCES public.usuario_panaderia(usuario_id, panaderia_id),
    CONSTRAINT detalle_conteo_movimiento_fkey FOREIGN KEY (movimiento_id) REFERENCES public.movimiento_inventario(id)
);
CREATE INDEX IF NOT EXISTS idx_detalle_conteo_conteo ON public.detalle_conteo (conteo_id);
CREATE INDEX IF NOT EXISTS idx_detalle_conteo_lote ON public.detalle_conteo (lote_id);

-- Igual que el resto de tablas: sin acceso directo desde la API pública de Supabase
ALTER TABLE public.conteo_fisico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalle_conteo ENABLE ROW LEVEL SECURITY;

-- Verificación: las dos tablas deben aparecer con RLS activo
SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('conteo_fisico', 'detalle_conteo') ORDER BY relname;

COMMIT;
