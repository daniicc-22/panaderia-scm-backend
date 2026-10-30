-- Sprint 7 (HU-20, HU-21, HU-22): calendario de entrega del proveedor y parámetros de reposición por insumo.
-- Se puede ejecutar más de una vez sin dañar nada.
-- Local:     psql -U postgres -d panaderia_db -f prisma/sql/2026-10-29_reposicion.sql
-- Supabase:  psql "$cadena" -f prisma/sql/2026-10-29_reposicion.sql
-- El archivo está en UTF-8: esta línea evita que psql en Windows lo lea como cp1252 (tildes rotas).
\encoding UTF8
BEGIN;

-- Proveedor: cuándo entrega (0 = domingo ... 6 = sábado), hasta qué hora recibe pedidos y cuánto es el pedido mínimo.
-- Lista vacía / NULL = sin definir (el sistema no inventa un calendario: avisa que falta).
ALTER TABLE public.proveedor ADD COLUMN IF NOT EXISTS dias_entrega smallint[] NOT NULL DEFAULT '{}';
ALTER TABLE public.proveedor ADD COLUMN IF NOT EXISTS hora_limite_pedido varchar(5);
ALTER TABLE public.proveedor ADD COLUMN IF NOT EXISTS pedido_minimo numeric(12,2);

DO $$ BEGIN
  ALTER TABLE public.proveedor ADD CONSTRAINT proveedor_dias_entrega_check
    CHECK (cardinality(dias_entrega) <= 7 AND dias_entrega <@ ARRAY[0,1,2,3,4,5,6]::smallint[]);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.proveedor ADD CONSTRAINT proveedor_hora_limite_check
    CHECK (hora_limite_pedido IS NULL OR hora_limite_pedido ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.proveedor ADD CONSTRAINT proveedor_pedido_minimo_check
    CHECK (pedido_minimo IS NULL OR pedido_minimo >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Parámetros por insumo: todo opcional, nada se rellena por su cuenta.
--  dias_seguridad:            stock de seguridad en días de consumo (si no, se usa stock_minimo en unidades)
--  vida_util_dias:            días máximos que se acepta tener el insumo guardado (tope operativo)
--  consumo_semanal_declarado: lo que dice el administrador que se gasta por semana, en la unidad base
--  tasa_mantenimiento_anual:  i, fracción anual (0.24 = 24 %) para H = i × costo, si no hay costo_mantener_h
ALTER TABLE public.parametro_inventario ADD COLUMN IF NOT EXISTS dias_seguridad numeric(6,2);
ALTER TABLE public.parametro_inventario ADD COLUMN IF NOT EXISTS vida_util_dias numeric(6,1);
ALTER TABLE public.parametro_inventario ADD COLUMN IF NOT EXISTS consumo_semanal_declarado numeric(14,3);
ALTER TABLE public.parametro_inventario ADD COLUMN IF NOT EXISTS tasa_mantenimiento_anual numeric(6,4);

DO $$ BEGIN
  ALTER TABLE public.parametro_inventario ADD CONSTRAINT parametro_inventario_valores_check
    CHECK (
      (dias_seguridad IS NULL OR dias_seguridad >= 0) AND
      (vida_util_dias IS NULL OR vida_util_dias > 0) AND
      (consumo_semanal_declarado IS NULL OR consumo_semanal_declarado >= 0) AND
      (tasa_mantenimiento_anual IS NULL OR (tasa_mantenimiento_anual > 0 AND tasa_mantenimiento_anual <= 5)) AND
      (costo_ordenar_s IS NULL OR costo_ordenar_s >= 0) AND
      (costo_mantener_h IS NULL OR costo_mantener_h > 0) AND
      (stock_minimo IS NULL OR stock_minimo >= 0) AND
      (stock_maximo IS NULL OR stock_maximo > 0)
    ) NOT VALID; -- NOT VALID: exige las reglas a lo nuevo sin fallar por datos viejos que ya existían
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Un solo parámetro activo por insumo. Si hubiera repetidos, se deja activo el más reciente.
UPDATE public.parametro_inventario p
SET activo = false
FROM (
  SELECT id, row_number() OVER (PARTITION BY panaderia_id, materia_prima_id ORDER BY vigente_desde DESC, id) AS n
  FROM public.parametro_inventario WHERE activo
) r
WHERE p.id = r.id AND r.n > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_parametro_inventario_activo
  ON public.parametro_inventario (panaderia_id, materia_prima_id) WHERE activo;

COMMIT;

-- Verificación: columnas nuevas, restricciones e índice
SELECT table_name, column_name FROM information_schema.columns
WHERE (table_name = 'proveedor' AND column_name IN ('dias_entrega', 'hora_limite_pedido', 'pedido_minimo'))
   OR (table_name = 'parametro_inventario' AND column_name IN ('dias_seguridad', 'vida_util_dias', 'consumo_semanal_declarado', 'tasa_mantenimiento_anual'))
ORDER BY table_name, column_name;
SELECT conname FROM pg_constraint
WHERE conname IN ('proveedor_dias_entrega_check', 'proveedor_hora_limite_check', 'proveedor_pedido_minimo_check', 'parametro_inventario_valores_check')
ORDER BY conname;
SELECT indexname FROM pg_indexes WHERE indexname = 'uq_parametro_inventario_activo';
