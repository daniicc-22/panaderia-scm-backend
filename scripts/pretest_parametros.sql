-- PRE-TEST: parámetros de La Casa del Pan de Maíz según lo declarado por el administrador (19/11/2026).
-- Reemplaza los valores de demostración (plazo 0, costo por pedido $5.000).
--   * Plazo de entrega 1 día: el administrador dijo "el mismo día o al siguiente según la necesidad";
--     se planea con el caso prudente (pedir con un día de anticipación).
--   * Costo por pedido $20.000: estimación documentada (V4.5), NO confirmada por el administrador.
--   * Lácteos que no se guardan (Leche MP-009, Queso cuajada MP-017) y Piña (MP-035): se compran según la producción.
--   * Huevos (MP-005): se piden seguido y en cantidad; no se guardan más de 3 días (vida útil operativa 3).
--   * Vida útil operativa 14 días (~2 semanas, declarado): azúcar, margarina, vitina, levadura, chocolate.
-- Paso 1: correr solo la consulta de vista previa (ver al final del archivo). Paso 2: correr este script.
-- Deshacer: ver el bloque REVERTIR al final (usa la copia public.respaldo_parametros_pretest).
BEGIN;

CREATE TABLE IF NOT EXISTS public.respaldo_parametros_pretest AS TABLE public.parametro_inventario;

UPDATE public.parametro_inventario pi
SET lead_time_dias = 1,
    costo_ordenar_s = 20000
FROM public.panaderia p
WHERE p.id = pi.panaderia_id AND p.nombre ILIKE '%casa del pan%' AND pi.activo
  AND pi.lead_time_dias = 0 AND pi.costo_ordenar_s = 5000;

UPDATE public.parametro_inventario pi
SET modo_reposicion = 'al_uso'
FROM public.materia_prima m
WHERE m.id = pi.materia_prima_id AND pi.activo AND m.codigo IN ('MP-009', 'MP-017', 'MP-035');

UPDATE public.parametro_inventario pi
SET vida_util_dias = CASE WHEN m.codigo = 'MP-005' THEN 3 ELSE 14 END
FROM public.materia_prima m
WHERE m.id = pi.materia_prima_id AND pi.activo
  AND m.codigo IN ('MP-005', 'MP-002', 'MP-003', 'MP-040', 'MP-033', 'MP-006', 'MP-036');

COMMIT;

-- Verificación (debe verse después del COMMIT)
SELECT count(*) FILTER (WHERE lead_time_dias = 1) AS plazo_1,
       count(*) FILTER (WHERE costo_ordenar_s = 20000) AS costo_20000,
       count(*) FILTER (WHERE modo_reposicion = 'al_uso') AS al_uso,
       count(*) FILTER (WHERE vida_util_dias IS NOT NULL) AS con_vida_util
FROM public.parametro_inventario WHERE activo;

-- VISTA PREVIA (correr ANTES, sola; no cambia nada):
--   SELECT count(*) AS filas_con_valores_demo FROM public.parametro_inventario pi
--   JOIN public.panaderia p ON p.id = pi.panaderia_id AND p.nombre ILIKE '%casa del pan%'
--   WHERE pi.activo AND pi.lead_time_dias = 0 AND pi.costo_ordenar_s = 5000;

-- REVERTIR (solo si hace falta):
--   UPDATE public.parametro_inventario pi
--   SET lead_time_dias = r.lead_time_dias, costo_ordenar_s = r.costo_ordenar_s,
--       modo_reposicion = r.modo_reposicion, vida_util_dias = r.vida_util_dias
--   FROM public.respaldo_parametros_pretest r WHERE r.id = pi.id;
