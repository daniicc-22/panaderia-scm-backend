-- Antes de cargar datos de prueba en Parámetros de reposición: guarda una copia de cómo están hoy.
-- Se ejecuta UNA vez; si la copia ya existe no la sobrescribe (así nunca se pierde el estado original).
-- Supabase:  psql "$cadena" -f scripts/demo_parametros_respaldo.sql
\encoding UTF8
CREATE TABLE IF NOT EXISTS public.respaldo_parametro_inventario_demo AS TABLE public.parametro_inventario;

SELECT count(*) AS filas_respaldadas, now() AS al_momento FROM public.respaldo_parametro_inventario_demo;
