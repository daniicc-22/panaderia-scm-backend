-- Limpia los datos de prueba creados desde una fecha: producciones, mermas, entradas (compras y lotes) y
-- sus movimientos. Deja las demás tablas (materias primas, recetas, proveedores, usuarios) como están.
-- Si una merma o producción de prueba tocó un lote ANTERIOR a la fecha, devuelve ese stock a como estaba.
--
-- Ensayo (no cambia nada):  psql "$cadena" -v desde=2026-10-26 -v fin=ROLLBACK -f scripts/limpiar_pruebas.sql
-- Limpieza real:            psql "$cadena" -v desde=2026-10-26 -v fin=COMMIT   -f scripts/limpiar_pruebas.sql
\if :{?desde}
\else
  \echo 'Falta -v desde=AAAA-MM-DD'
  \quit
\endif
\if :{?fin}
\else
  \echo 'Falta -v fin=ROLLBACK (ensayo) o -v fin=COMMIT (real)'
  \quit
\endif

BEGIN;

CREATE TEMP TABLE _desde ON COMMIT DROP AS SELECT (:'desde' || ' 00:00 America/Bogota')::timestamptz AS d;
CREATE TEMP TABLE _prod ON COMMIT DROP AS SELECT id FROM produccion WHERE fecha >= (SELECT d FROM _desde);
CREATE TEMP TABLE _desp ON COMMIT DROP AS
  SELECT id FROM desperdicio WHERE fecha >= (SELECT d FROM _desde) OR produccion_id IN (SELECT id FROM _prod);
CREATE TEMP TABLE _lote ON COMMIT DROP AS
  SELECT id, detalle_recepcion_id FROM lote
  WHERE created_at >= (SELECT d FROM _desde) OR produccion_origen_id IN (SELECT id FROM _prod);
CREATE TEMP TABLE _cons ON COMMIT DROP AS
  SELECT id FROM consumo_produccion WHERE produccion_id IN (SELECT id FROM _prod) OR lote_id IN (SELECT id FROM _lote);
CREATE TEMP TABLE _rec ON COMMIT DROP AS
  SELECT r.id, r.detalle_compra_id FROM detalle_recepcion r WHERE r.id IN (SELECT detalle_recepcion_id FROM _lote);
CREATE TEMP TABLE _dc ON COMMIT DROP AS
  SELECT d.id, d.compra_id FROM detalle_compra d WHERE d.id IN (SELECT detalle_compra_id FROM _rec);

\echo '--- Lo que se va a borrar ---'
SELECT (SELECT count(*) FROM _prod) AS producciones, (SELECT count(*) FROM _desp) AS mermas,
       (SELECT count(*) FROM _lote) AS lotes, (SELECT count(*) FROM _cons) AS consumos,
       (SELECT count(*) FROM _dc) AS compras_detalle;

-- 1. Stock de lotes anteriores a la fecha que las pruebas gastaron: se devuelve
UPDATE lote l SET cantidad_disponible = l.cantidad_disponible - s.neto
FROM (
  SELECT m.lote_id, sum(m.cantidad * t.efecto_signo) AS neto
  FROM movimiento_inventario m
  JOIN tipo_movimiento_inventario t ON t.id = m.tipo_movimiento_id
  WHERE (m.desperdicio_id IN (SELECT id FROM _desp) OR m.consumo_produccion_id IN (SELECT id FROM _cons))
    AND m.lote_id NOT IN (SELECT id FROM _lote)
  GROUP BY m.lote_id
) s
WHERE l.id = s.lote_id;

-- 2. Conteos de los lotes de prueba
DELETE FROM detalle_conteo WHERE lote_id IN (SELECT id FROM _lote);
DELETE FROM conteo_fisico c
WHERE c.created_at >= (SELECT d FROM _desde)
  AND NOT EXISTS (SELECT 1 FROM detalle_conteo x WHERE x.conteo_id = c.id);

-- 3. Movimientos, mermas, pesajes, consumos
DELETE FROM movimiento_inventario
WHERE lote_id IN (SELECT id FROM _lote)
   OR desperdicio_id IN (SELECT id FROM _desp)
   OR consumo_produccion_id IN (SELECT id FROM _cons);
DELETE FROM desperdicio WHERE id IN (SELECT id FROM _desp);
DELETE FROM pesaje_produccion WHERE produccion_id IN (SELECT id FROM _prod);
DELETE FROM consumo_produccion WHERE id IN (SELECT id FROM _cons);

-- 4. Lotes y la cadena de la entrada (recepción → detalle de compra → compra)
DELETE FROM lote WHERE id IN (SELECT id FROM _lote);
DELETE FROM detalle_recepcion WHERE id IN (SELECT id FROM _rec);
DELETE FROM detalle_compra WHERE id IN (SELECT id FROM _dc);
DELETE FROM compra WHERE id IN (SELECT compra_id FROM _dc)
  AND NOT EXISTS (SELECT 1 FROM detalle_compra x WHERE x.compra_id = compra.id);

-- 5. Producciones
DELETE FROM produccion WHERE id IN (SELECT id FROM _prod);

\echo '--- Control: debe quedar todo en 0 desde la fecha ---'
SELECT (SELECT count(*) FROM produccion WHERE fecha >= (SELECT d FROM _desde)) AS producciones,
       (SELECT count(*) FROM desperdicio WHERE fecha >= (SELECT d FROM _desde)) AS mermas,
       (SELECT count(*) FROM lote WHERE created_at >= (SELECT d FROM _desde)) AS lotes,
       (SELECT count(*) FROM movimiento_inventario WHERE fecha >= (SELECT d FROM _desde)) AS movimientos,
       (SELECT count(*) FROM compra WHERE created_at >= (SELECT d FROM _desde)) AS compras;
\echo '--- Stock que queda por insumo (debe ser como antes de las pruebas) ---'
SELECT m.nombre, sum(l.cantidad_disponible) AS stock
FROM lote l JOIN materia_prima m ON m.id = l.materia_prima_id
WHERE l.cantidad_disponible > 0 GROUP BY m.nombre ORDER BY m.nombre;

:fin;
