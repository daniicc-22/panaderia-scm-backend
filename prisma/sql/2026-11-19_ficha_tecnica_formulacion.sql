-- Ficha técnica de las formulaciones (Sprint 12): motivo del cambio, método de preparación,
-- merma esperada del horneado y precio de venta del producto (para el margen).
-- Idempotente: se puede ejecutar varias veces sin dañar nada.
--   Ensayo:  psql "<cadena de conexión directa, puerto 5432>" -f prisma/sql/2026-11-19_ficha_tecnica_formulacion.sql
-- No borra ni cambia datos: solo agrega columnas opcionales (las versiones existentes quedan con NULL).
-- IMPORTANTE: ejecutar ANTES de desplegar el backend, porque el código nuevo lee estas columnas.

BEGIN;

ALTER TABLE public.producto ADD COLUMN IF NOT EXISTS precio_venta numeric(12,2);

ALTER TABLE public.formulacion ADD COLUMN IF NOT EXISTS motivo_cambio varchar(300);
ALTER TABLE public.formulacion ADD COLUMN IF NOT EXISTS procedimiento text;
ALTER TABLE public.formulacion ADD COLUMN IF NOT EXISTS tiempo_preparacion_min integer;
ALTER TABLE public.formulacion ADD COLUMN IF NOT EXISTS tiempo_horneado_min integer;
ALTER TABLE public.formulacion ADD COLUMN IF NOT EXISTS temperatura_horneado_c integer;
ALTER TABLE public.formulacion ADD COLUMN IF NOT EXISTS merma_horneado_pct numeric(5,2);

-- Rangos (los mismos que valida la API)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'producto_precio_venta_rango') THEN
    ALTER TABLE public.producto
      ADD CONSTRAINT producto_precio_venta_rango CHECK (precio_venta IS NULL OR (precio_venta >= 0 AND precio_venta <= 99999999));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'formulacion_procedimiento_largo') THEN
    ALTER TABLE public.formulacion
      ADD CONSTRAINT formulacion_procedimiento_largo CHECK (procedimiento IS NULL OR char_length(procedimiento) <= 3000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'formulacion_tiempos_rango') THEN
    ALTER TABLE public.formulacion
      ADD CONSTRAINT formulacion_tiempos_rango CHECK (
        (tiempo_preparacion_min IS NULL OR (tiempo_preparacion_min >= 0 AND tiempo_preparacion_min <= 1440))
        AND (tiempo_horneado_min IS NULL OR (tiempo_horneado_min >= 0 AND tiempo_horneado_min <= 1440))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'formulacion_temperatura_rango') THEN
    ALTER TABLE public.formulacion
      ADD CONSTRAINT formulacion_temperatura_rango CHECK (temperatura_horneado_c IS NULL OR (temperatura_horneado_c >= 0 AND temperatura_horneado_c <= 400));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'formulacion_merma_rango') THEN
    ALTER TABLE public.formulacion
      ADD CONSTRAINT formulacion_merma_rango CHECK (merma_horneado_pct IS NULL OR (merma_horneado_pct >= 0 AND merma_horneado_pct <= 60));
  END IF;
END
$$;

-- Comprobación: deben salir 1 columna de producto y 6 de formulacion
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'producto' AND column_name = 'precio_venta')
    OR (table_name = 'formulacion' AND column_name IN
        ('motivo_cambio', 'procedimiento', 'tiempo_preparacion_min', 'tiempo_horneado_min', 'temperatura_horneado_c', 'merma_horneado_pct')))
ORDER BY table_name, column_name;

COMMIT;
