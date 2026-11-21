-- Borra SOLO los dos lotes de prueba del 26-oct-2026 (Harina y Azúcar, 150.000 g cada uno) y su cadena de entrada
-- (movimiento, recepción, detalle de compra, compra). Un solo bloque: sirve en el SQL Editor de Supabase.
-- Se detiene sin borrar nada si lo que encuentra no coincide exactamente con lo esperado.

DO $$
DECLARE
  v_lotes  uuid[];
  v_rec    uuid[];
  v_dc     uuid[];
  v_compra uuid[];
  v_n      int;
  v_otros  int;
BEGIN
  -- 1) Identificar los lotes: MP-001 / MP-002, creados el 2026-10-26 (hora Colombia), 150000 de cantidad inicial, sin gastar
  SELECT array_agg(l.id) INTO v_lotes
    FROM lote l JOIN materia_prima m ON m.id = l.materia_prima_id
   WHERE m.codigo IN ('MP-001','MP-002')
     AND (l.created_at AT TIME ZONE 'America/Bogota')::date = DATE '2026-10-26'
     AND l.cantidad_inicial = 150000
     AND l.cantidad_disponible = 150000;

  v_n := COALESCE(array_length(v_lotes, 1), 0);
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Esperaba 2 lotes de prueba y encontré %. No borré nada.', v_n;
  END IF;

  -- 2) Seguridad: ninguno fue consumido, descartado ni contado
  SELECT (SELECT count(*) FROM consumo_produccion WHERE lote_id = ANY(v_lotes))
       + (SELECT count(*) FROM desperdicio        WHERE lote_id = ANY(v_lotes))
       + (SELECT count(*) FROM detalle_conteo     WHERE lote_id = ANY(v_lotes))
    INTO v_otros;
  IF v_otros > 0 THEN
    RAISE EXCEPTION 'Los lotes tienen % consumos/mermas/conteos asociados. No borré nada; revisemos antes.', v_otros;
  END IF;

  -- 3) Cadena de la entrada
  SELECT array_agg(DISTINCT detalle_recepcion_id) INTO v_rec FROM lote WHERE id = ANY(v_lotes) AND detalle_recepcion_id IS NOT NULL;
  SELECT array_agg(DISTINCT detalle_compra_id)    INTO v_dc  FROM detalle_recepcion WHERE id = ANY(COALESCE(v_rec, '{}'));
  SELECT array_agg(DISTINCT compra_id)            INTO v_compra FROM detalle_compra WHERE id = ANY(COALESCE(v_dc, '{}'));

  -- 4) Borrar en orden
  DELETE FROM movimiento_inventario WHERE lote_id = ANY(v_lotes);
  DELETE FROM lote WHERE id = ANY(v_lotes);
  DELETE FROM detalle_recepcion WHERE id = ANY(COALESCE(v_rec, '{}'))
     AND NOT EXISTS (SELECT 1 FROM lote x WHERE x.detalle_recepcion_id = detalle_recepcion.id);
  DELETE FROM detalle_compra WHERE id = ANY(COALESCE(v_dc, '{}'))
     AND NOT EXISTS (SELECT 1 FROM detalle_recepcion x WHERE x.detalle_compra_id = detalle_compra.id);
  DELETE FROM compra WHERE id = ANY(COALESCE(v_compra, '{}'))
     AND NOT EXISTS (SELECT 1 FROM detalle_compra x WHERE x.compra_id = compra.id);

  RAISE NOTICE 'Listo: 2 lotes de prueba borrados con su cadena de entrada.';
END $$;

-- Control: no debe quedar ningún lote con existencias
SELECT count(*) AS lotes_con_existencias FROM lote WHERE cantidad_disponible > 0;
