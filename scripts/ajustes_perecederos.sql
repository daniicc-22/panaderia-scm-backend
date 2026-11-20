-- Ajustes de catálogo antes de la carga inicial (La Casa del Pan de Maíz).
-- Se puede correr varias veces sin problema. Un solo bloque: sirve en psql/pgAdmin (local) y en el SQL Editor de Supabase.

DO $$
DECLARE
  v_pan  uuid;
  v_fefo int;
  v_leche int;
BEGIN
  SELECT id INTO v_pan FROM panaderia WHERE nombre ILIKE '%Pan de Ma%z%' LIMIT 1;
  IF v_pan IS NULL THEN RAISE EXCEPTION 'No encontré la panadería La Casa del Pan de Maíz'; END IF;

  -- 1) Insumos perecederos: se manejan por vencimiento (FEFO), así la carga y las entradas exigen la fecha
  UPDATE materia_prima SET criterio_rotacion = 'FEFO', updated_at = now()
   WHERE panaderia_id = v_pan
     AND codigo IN ('MP-003','MP-004','MP-005','MP-006','MP-009','MP-010','MP-017','MP-023','MP-034','MP-035','MP-040');
  GET DIAGNOSTICS v_fefo = ROW_COUNT;

  -- 2) La leche se compra por litro: la presentación se llama «1 litro» (1 L ≈ 1 kg, que es como se lleva el inventario)
  UPDATE presentacion p SET nombre = '1 litro'
    FROM materia_prima m
   WHERE p.materia_prima_id = m.id AND p.panaderia_id = v_pan AND m.panaderia_id = v_pan
     AND m.codigo = 'MP-009' AND p.nombre <> '1 litro';
  GET DIAGNOSTICS v_leche = ROW_COUNT;

  RAISE NOTICE 'FEFO aplicado a % insumos; presentaciones de leche renombradas: %', v_fefo, v_leche;
END $$;

-- Verificación: debe listar los 11 insumos con FEFO y la leche como «1 litro»
SELECT m.codigo, m.nombre, m.criterio_rotacion, string_agg(p.nombre, ', ') AS presentaciones
  FROM materia_prima m
  LEFT JOIN presentacion p ON p.materia_prima_id = m.id AND p.activa
 WHERE m.criterio_rotacion = 'FEFO' OR m.codigo = 'MP-009'
 GROUP BY m.codigo, m.nombre, m.criterio_rotacion
 ORDER BY m.codigo;
