-- =====================================================================
-- Quita los DATOS SIMULADOS de «La Espiga» y «Vendimia» (los que cargó scripts/sim_panaderias_cargar.sql).
-- Deja la panadería, sus usuarios y sus causas de merma tal como estaban: queda lista para cargar los datos reales.
-- Se niega a borrar si la panadería ya tiene algún lote que NO sea de simulación (código distinto de «SIM-…»).
--
-- Ensayo (no borra nada):  psql "$cadena" -v fin=ROLLBACK -f scripts/sim_panaderias_limpiar.sql
-- Real:                    psql "$cadena" -v fin=COMMIT   -f scripts/sim_panaderias_limpiar.sql
-- =====================================================================
\encoding UTF8
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE _sim_pan (id uuid, nombre text) ON COMMIT DROP;

DO $$
DECLARE r record; n integer; v_pan uuid;
BEGIN
  FOR r IN SELECT * FROM (VALUES ('%espiga%'), ('%vendimia%')) AS t(patron) LOOP
    SELECT count(*) INTO n FROM public.panaderia WHERE nombre ILIKE r.patron;
    IF n <> 1 THEN RAISE EXCEPTION '[SIM] Se esperaba una sola panadería que coincida con % y hay %', r.patron, n; END IF;
    SELECT id INTO v_pan FROM public.panaderia WHERE nombre ILIKE r.patron;
    IF EXISTS (SELECT 1 FROM public.lote WHERE panaderia_id = v_pan AND (codigo_lote IS NULL OR codigo_lote NOT LIKE 'SIM-%')) THEN
      RAISE EXCEPTION '[SIM] La panadería % ya tiene lotes que no son de simulación. No se borra nada.', r.patron;
    END IF;
    INSERT INTO _sim_pan SELECT id, nombre FROM public.panaderia WHERE id = v_pan;
  END LOOP;
END $$;

\echo '--- Lo que se va a borrar ---'
SELECT s.nombre,
  (SELECT count(*) FROM public.lote l WHERE l.panaderia_id = s.id) AS lotes,
  (SELECT count(*) FROM public.produccion p WHERE p.panaderia_id = s.id) AS producciones,
  (SELECT count(*) FROM public.movimiento_inventario m WHERE m.panaderia_id = s.id) AS movimientos,
  (SELECT count(*) FROM public.materia_prima m WHERE m.panaderia_id = s.id) AS insumos
FROM _sim_pan s ORDER BY s.nombre;

-- Del registro más dependiente al catálogo
DELETE FROM public.detalle_conteo        WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.conteo_fisico         WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.movimiento_inventario WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.desperdicio           WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.consumo_produccion    WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.pesaje_produccion     WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.lote                  WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.produccion            WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.detalle_recepcion     WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.detalle_compra        WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.compra                WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.analisis_eoq          WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.clasificacion_abc     WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.parametro_inventario  WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.detalle_formulacion   WHERE formulacion_id IN (SELECT id FROM public.formulacion WHERE panaderia_id IN (SELECT id FROM _sim_pan));
DELETE FROM public.formulacion           WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.producto              WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.presentacion_proveedor WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.presentacion          WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.proveedor             WHERE panaderia_id IN (SELECT id FROM _sim_pan);
DELETE FROM public.materia_prima         WHERE panaderia_id IN (SELECT id FROM _sim_pan);

\echo '--- Después de borrar (todo debe quedar en 0; usuarios y causas se conservan) ---'
SELECT s.nombre,
  (SELECT count(*) FROM public.lote l WHERE l.panaderia_id = s.id) AS lotes,
  (SELECT count(*) FROM public.materia_prima m WHERE m.panaderia_id = s.id) AS insumos,
  (SELECT count(*) FROM public.usuario_panaderia u WHERE u.panaderia_id = s.id) AS usuarios,
  (SELECT count(*) FROM public.causa_desperdicio c WHERE c.panaderia_id = s.id) AS causas
FROM _sim_pan s ORDER BY s.nombre;

:fin;
