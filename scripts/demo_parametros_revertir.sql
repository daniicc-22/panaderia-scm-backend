-- Devuelve parametro_inventario a como estaba cuando se hizo el respaldo (demo_parametros_respaldo.sql).
-- ¡Úsalo ANTES de empezar a cargar los datos reales del piloto! Después borraría también lo real.
--
-- Ensayo (no cambia nada):  psql "$cadena" -v fin=ROLLBACK -f scripts/demo_parametros_revertir.sql
-- Real:                     psql "$cadena" -v fin=COMMIT   -f scripts/demo_parametros_revertir.sql
-- Al terminar, si todo quedó bien:  DROP TABLE public.respaldo_parametro_inventario_demo;
\encoding UTF8
\if :{?fin}
\else
  \echo 'Falta -v fin=ROLLBACK (ensayo) o -v fin=COMMIT (real)'
  \quit
\endif

BEGIN;

\echo '--- Filas que se van a borrar (creadas después del respaldo) ---'
SELECT count(*) AS filas_nuevas FROM public.parametro_inventario p
WHERE NOT EXISTS (SELECT 1 FROM public.respaldo_parametro_inventario_demo r WHERE r.id = p.id);

DELETE FROM public.parametro_inventario p
WHERE NOT EXISTS (SELECT 1 FROM public.respaldo_parametro_inventario_demo r WHERE r.id = p.id);

UPDATE public.parametro_inventario p SET
  costo_ordenar_s = r.costo_ordenar_s, costo_mantener_h = r.costo_mantener_h, stock_minimo = r.stock_minimo,
  punto_reorden = r.punto_reorden, stock_maximo = r.stock_maximo, rango_original_observaciones = r.rango_original_observaciones,
  lead_time_dias = r.lead_time_dias, porcentaje_perdida_tolerable = r.porcentaje_perdida_tolerable,
  dias_seguridad = r.dias_seguridad, vida_util_dias = r.vida_util_dias, consumo_semanal_declarado = r.consumo_semanal_declarado,
  tasa_mantenimiento_anual = r.tasa_mantenimiento_anual, modo_reposicion = r.modo_reposicion,
  activo = r.activo, vigente_desde = r.vigente_desde
FROM public.respaldo_parametro_inventario_demo r
WHERE r.id = p.id;

\echo '--- Resultado: filas de parametro_inventario vs respaldo (deben ser iguales) ---'
SELECT (SELECT count(*) FROM public.parametro_inventario) AS ahora,
       (SELECT count(*) FROM public.respaldo_parametro_inventario_demo) AS respaldo;

:fin;
