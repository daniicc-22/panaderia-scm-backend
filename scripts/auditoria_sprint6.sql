\encoding UTF8
-- Auditoría de consistencia del Sprint 6 (SOLO LECTURA: no modifica nada).
-- Uso:  psql "$cadena" -f scripts/auditoria_sprint6.sql
-- Cada control cuenta filas con problemas: el resultado esperado es 0 en todos, salvo los marcados «informativo».

SELECT control, hallazgos, CASE WHEN control LIKE 'I%' THEN 'INFO' WHEN hallazgos = 0 THEN 'OK' ELSE 'REVISAR' END AS estado
FROM (
  -- 1. Ningún lote con existencias negativas
  SELECT 'L1 lotes con cantidad negativa' AS control, count(*)::int AS hallazgos
  FROM lote WHERE cantidad_disponible < 0

  UNION ALL
  -- 2. El stock de cada lote debe ser lo inicial más los movimientos con su signo
  SELECT 'L2 lotes cuyo stock no cuadra con sus movimientos', count(*)::int
  FROM (
    SELECT l.id
    FROM lote l
    LEFT JOIN movimiento_inventario m ON m.lote_id = l.id
    LEFT JOIN tipo_movimiento_inventario t ON t.id = m.tipo_movimiento_id
    GROUP BY l.id, l.cantidad_inicial, l.cantidad_disponible
    HAVING abs(l.cantidad_inicial + COALESCE(sum(m.cantidad * t.efecto_signo), 0) - l.cantidad_disponible) > 0.0005
  ) x

  UNION ALL
  -- 3. Producciones cerradas sin cantidad producida
  SELECT 'P1 producciones finalizadas sin cantidad producida', count(*)::int
  FROM produccion WHERE estado = 'finalizada' AND (cantidad_producida IS NULL OR cantidad_producida <= 0)

  UNION ALL
  -- 4. Lo descontado de inventario debe ser el peso real pesado (solo insumos que controlan inventario)
  SELECT 'P2 producciones donde lo descontado no es el peso real', count(*)::int
  FROM (
    SELECT pe.produccion_id, pe.materia_prima_id
    FROM pesaje_produccion pe
    JOIN materia_prima mp ON mp.id = pe.materia_prima_id
    LEFT JOIN (
      SELECT c.produccion_id, l.materia_prima_id, sum(c.cantidad_consumida) AS consumido
      FROM consumo_produccion c JOIN lote l ON l.id = c.lote_id
      GROUP BY c.produccion_id, l.materia_prima_id
    ) k ON k.produccion_id = pe.produccion_id AND k.materia_prima_id = pe.materia_prima_id
    WHERE mp.controla_inventario AND abs(COALESCE(k.consumido, 0) - pe.peso_real) > 0.0005
  ) x

  UNION ALL
  -- 5. Cada consumo de producción debe tener su movimiento de salida
  SELECT 'P3 consumos sin movimiento de salida', count(*)::int
  FROM consumo_produccion c
  WHERE NOT EXISTS (SELECT 1 FROM movimiento_inventario m WHERE m.consumo_produccion_id = c.id)

  UNION ALL
  -- 6. Pesajes que no deberían existir: no pesado con peso distinto del estándar (la base ya lo impide)
  SELECT 'P4 pesajes no pesados con peso distinto al estándar', count(*)::int
  FROM pesaje_produccion WHERE NOT pesado AND peso_real <> peso_estandar

  UNION ALL
  -- 7. Mermas sin origen (ni lote ni producción)
  SELECT 'M1 mermas sin lote ni producción', count(*)::int
  FROM desperdicio WHERE lote_id IS NULL AND produccion_id IS NULL

  UNION ALL
  -- 8. Merma de lote (sin producción) debe tener su movimiento salida_merma
  SELECT 'M2 mermas de lote sin movimiento', count(*)::int
  FROM desperdicio d
  WHERE d.lote_id IS NOT NULL AND d.produccion_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM movimiento_inventario m WHERE m.desperdicio_id = d.id)

  UNION ALL
  -- 9. Movimientos de merma sin su registro de desperdicio
  SELECT 'M3 movimientos de merma sin desperdicio', count(*)::int
  FROM movimiento_inventario m
  JOIN tipo_movimiento_inventario t ON t.id = m.tipo_movimiento_id
  WHERE t.codigo = 'salida_merma' AND m.desperdicio_id IS NULL

  UNION ALL
  -- 10. Merma de una producción que pertenece a otra panadería (no debería poder ocurrir)
  SELECT 'M4 mermas ligadas a producción de otra panadería', count(*)::int
  FROM desperdicio d JOIN produccion p ON p.id = d.produccion_id
  WHERE p.panaderia_id <> d.panaderia_id

  UNION ALL
  -- 11. Causas con caracteres dañados (problema de codificación)
  SELECT 'C1 causas con caracteres dañados', count(*)::int
  FROM causa_desperdicio WHERE nombre ~ '[ÃÂ]' OR COALESCE(descripcion, '') ~ '[ÃÂ]'

  UNION ALL
  -- 12. Panaderías sin las 7 causas iniciales activas
  SELECT 'C2 panaderías con menos de 7 causas activas', count(*)::int
  FROM panaderia p
  WHERE (SELECT count(*) FROM causa_desperdicio c WHERE c.panaderia_id = p.id AND c.activo) < 7

  UNION ALL
  -- 13. Seguridad: tablas nuevas sin RLS
  SELECT 'S1 tablas del sprint sin RLS', count(*)::int
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename IN ('pesaje_produccion', 'causa_desperdicio', 'desperdicio') AND NOT rowsecurity

  UNION ALL
  -- 14. Informativo: producciones anteriores al peso real (sin pesaje)
  SELECT 'I1 (informativo) producciones sin pesaje', count(*)::int
  FROM produccion p WHERE NOT EXISTS (SELECT 1 FROM pesaje_produccion pe WHERE pe.produccion_id = p.id)

  UNION ALL
  -- 15. Informativo: datos de prueba que quedan (productos o insumos que empiezan por ZZ)
  SELECT 'I2 (informativo) productos de prueba ZZ', count(*)::int
  FROM producto WHERE nombre ILIKE 'ZZ%'
) r
ORDER BY control;
