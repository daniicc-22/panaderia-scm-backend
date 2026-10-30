\encoding UTF8
-- Auditoría del Sprint 7: calendario de entrega y parámetros de reposición (SOLO LECTURA: no modifica nada).
-- Uso:  psql "$cadena" -f scripts/auditoria_sprint7.sql
-- Cada control cuenta filas con problemas: el resultado esperado es 0 en todos, salvo los marcados «informativo» (I...).
-- Los controles C... solo funcionan después de ejecutar prisma/sql/2026-10-29_reposicion.sql.

SELECT control, hallazgos, CASE WHEN control LIKE 'I%' THEN 'INFO' WHEN hallazgos = 0 THEN 'OK' ELSE 'REVISAR' END AS estado
FROM (
  -- 1. Días de entrega: solo 0 (domingo) a 6 (sábado), sin repetidos
  SELECT 'C1 proveedores con días de entrega inválidos o repetidos' AS control, count(*)::int AS hallazgos
  FROM proveedor p
  WHERE NOT (p.dias_entrega <@ ARRAY[0,1,2,3,4,5,6]::smallint[])
     OR cardinality(p.dias_entrega) <> (SELECT count(DISTINCT d) FROM unnest(p.dias_entrega) d)

  UNION ALL
  -- 2. Hora límite con formato HH:MM
  SELECT 'C2 proveedores con hora límite mal escrita', count(*)::int
  FROM proveedor WHERE hora_limite_pedido IS NOT NULL AND hora_limite_pedido !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'

  UNION ALL
  -- 3. Un solo parámetro activo por insumo
  SELECT 'C3 insumos con más de un parámetro activo', count(*)::int
  FROM (SELECT 1 FROM parametro_inventario WHERE activo GROUP BY panaderia_id, materia_prima_id HAVING count(*) > 1) x

  UNION ALL
  -- 4. Valores fuera de rango (las filas anteriores a la restricción pueden haber quedado así)
  SELECT 'C4 parámetros con valores fuera de rango', count(*)::int
  FROM parametro_inventario
  WHERE (dias_seguridad < 0) OR (vida_util_dias <= 0) OR (consumo_semanal_declarado < 0)
     OR (tasa_mantenimiento_anual <= 0 OR tasa_mantenimiento_anual > 5)
     OR (costo_ordenar_s < 0) OR (costo_mantener_h <= 0) OR (stock_minimo < 0) OR (stock_maximo <= 0)

  UNION ALL
  -- 5. El stock mínimo no puede superar al máximo
  SELECT 'C5 parámetros con stock mínimo mayor que el máximo', count(*)::int
  FROM parametro_inventario WHERE stock_minimo IS NOT NULL AND stock_maximo IS NOT NULL AND stock_minimo > stock_maximo

  UNION ALL
  -- 6. Parámetros que apuntan a un insumo de otra panadería (no debería poder pasar por la llave compuesta)
  SELECT 'C6 parámetros de un insumo de otra panadería', count(*)::int
  FROM parametro_inventario pi JOIN materia_prima mp ON mp.id = pi.materia_prima_id WHERE mp.panaderia_id <> pi.panaderia_id

  UNION ALL
  -- Informativos: qué falta por completar para que el cálculo de reposición decida
  SELECT 'I1 proveedores activos sin días de entrega definidos', count(*)::int
  FROM proveedor WHERE activo AND cardinality(dias_entrega) = 0

  UNION ALL
  SELECT 'I2 insumos con inventario sin parámetros activos', count(*)::int
  FROM materia_prima mp
  WHERE mp.activa AND mp.controla_inventario
    AND NOT EXISTS (SELECT 1 FROM parametro_inventario pi WHERE pi.materia_prima_id = mp.id AND pi.activo)

  UNION ALL
  SELECT 'I3 insumos con parámetros pero sin consumo declarado', count(*)::int
  FROM parametro_inventario WHERE activo AND consumo_semanal_declarado IS NULL

  UNION ALL
  SELECT 'I4 insumos con parámetros pero sin stock de seguridad (días ni mínimo)', count(*)::int
  FROM parametro_inventario WHERE activo AND dias_seguridad IS NULL AND stock_minimo IS NULL

  UNION ALL
  SELECT 'I5 ofertas vigentes sin tiempo de entrega', count(*)::int
  FROM presentacion_proveedor WHERE vigente AND tiempo_entrega_dias IS NULL
) t
ORDER BY control;
