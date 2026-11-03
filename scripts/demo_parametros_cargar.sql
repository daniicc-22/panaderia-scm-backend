-- DEMO: carga parámetros de PRUEBA en La Casa del Pan de Maíz para mostrar el análisis EOQ en vivo.
-- No son datos reales. Después de la demo se revierten con scripts/demo_parametros_revertir.sql.
--
-- Qué hace, todo en una sola transacción:
--   1. Guarda una copia de parametro_inventario (solo si todavía no existe: nunca pisa el estado original).
--   2. Para cada insumo que controla inventario crea o actualiza su parámetro activo con:
--        costo por pedido $5.000, tasa de mantenimiento 24 % anual, 2 días de seguridad, plazo de entrega 0.
--   3. Pone un consumo semanal declarado de 500 g a Esencia de vainilla (MP-016) y Hojaldrina (MP-041),
--      que no tienen producción ni receta, para que también entren al cálculo.
--   4. Leche (MP-009): tiempo máximo que se prefiere guardar = 7 días.
--   5. Queso cuajada (MP-017): modo "se compra según la producción" (al_uso).
-- No toca proveedores: el calendario (días de entrega y pedido mínimo) se configura en Proveedores.
--
-- Ensayo (no guarda nada):  psql "$cadena" -v fin=ROLLBACK -f scripts/demo_parametros_cargar.sql
-- Real:                     psql "$cadena" -v fin=COMMIT   -f scripts/demo_parametros_cargar.sql
-- Se puede repetir: vuelve a dejar los mismos valores de prueba.
\encoding UTF8
\set ON_ERROR_STOP on
\if :{?fin}
\else
  \echo 'Falta -v fin=ROLLBACK (ensayo) o -v fin=COMMIT (real)'
  \quit
\endif

BEGIN;

-- 1. Copia del estado actual (una sola vez)
CREATE TABLE IF NOT EXISTS public.respaldo_parametro_inventario_demo AS TABLE public.parametro_inventario;

-- Seguridad: debe haber exactamente una panadería con este nombre; si no, se aborta sin cambiar nada
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.panaderia WHERE nombre ILIKE '%casa del pan%';
  IF n <> 1 THEN
    RAISE EXCEPTION 'Se esperaba una sola panadería "La Casa del Pan de Maíz" y hay %', n;
  END IF;
END $$;

-- 2 a 5. Parámetros de prueba
INSERT INTO public.parametro_inventario (
  panaderia_id, materia_prima_id, costo_ordenar_s, tasa_mantenimiento_anual, dias_seguridad,
  lead_time_dias, consumo_semanal_declarado, vida_util_dias, modo_reposicion
)
SELECT m.panaderia_id, m.id, 5000, 0.24, 2, 0,
       CASE WHEN m.codigo IN ('MP-016', 'MP-041') THEN 500 END,
       CASE WHEN m.codigo = 'MP-009' THEN 7 END,
       CASE WHEN m.codigo = 'MP-017' THEN 'al_uso' ELSE 'periodica' END
FROM public.materia_prima m
JOIN public.panaderia p ON p.id = m.panaderia_id AND p.nombre ILIKE '%casa del pan%'
WHERE m.activa AND m.controla_inventario
ON CONFLICT (panaderia_id, materia_prima_id) WHERE activo DO UPDATE SET
  costo_ordenar_s           = EXCLUDED.costo_ordenar_s,
  tasa_mantenimiento_anual  = EXCLUDED.tasa_mantenimiento_anual,
  dias_seguridad            = EXCLUDED.dias_seguridad,
  lead_time_dias            = EXCLUDED.lead_time_dias,
  consumo_semanal_declarado = COALESCE(EXCLUDED.consumo_semanal_declarado, public.parametro_inventario.consumo_semanal_declarado),
  vida_util_dias            = COALESCE(EXCLUDED.vida_util_dias, public.parametro_inventario.vida_util_dias),
  modo_reposicion           = EXCLUDED.modo_reposicion;

\echo '--- Parámetros de prueba cargados ---'
SELECT count(*) AS insumos_con_parametros,
       count(*) FILTER (WHERE consumo_semanal_declarado IS NOT NULL) AS con_consumo_declarado,
       count(*) FILTER (WHERE modo_reposicion = 'al_uso') AS al_uso,
       count(*) FILTER (WHERE vida_util_dias IS NOT NULL) AS con_vida_util
FROM public.parametro_inventario WHERE activo;

\echo '--- Calendario de proveedores (debe haber al menos uno con días de entrega) ---'
SELECT nombre, dias_entrega, pedido_minimo FROM public.proveedor WHERE activo ORDER BY nombre;

:fin;
