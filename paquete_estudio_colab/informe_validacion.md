# Validación independiente de ABC y EOQ (HU-33)

Generado el 2026-11-02. Resultado: **CONCUERDA**.

## Qué se hizo

El script `validar_abc_eoq.py` recalcula en Python, desde el catálogo piloto (`prisma/catalogo_piloto.json`) y la frecuencia de lotes, la demanda anual por insumo, la clasificación ABC y el EOQ con su política de reposición con calendario del proveedor. El script `sistema_abc_eoq.ts` ejecuta las mismas funciones que usa la API sobre las mismas entradas. Después se comparan los resultados uno a uno.

Alcance y límites: son las funciones de cálculo, con el catálogo piloto como entrada. No se compara contra la base de datos de producción ni se mide con consumo real (todavía no hay historial). La reimplementación en Python parte de las fórmulas y reglas del diseño; para que la validación sea más fuerte, la revisión del código de Python por otra persona del equipo la haría independiente también en la autoría.

## Supuestos de la prueba (de demostración)

- Costo por pedido S = $5.000; tasa anual de mantenimiento = 24 %; días de seguridad = 2; tiempo de entrega = 0 días; fecha de referencia 2026-10-30.
- Demanda estimada por recetas: lotes por semana de `frecuencia_lotes.json` (6 por defecto) por 52 semanas. El agua (MP-008) no entra al ABC.
- Intermedios usados sin receta en el catálogo (su demanda no se reparte): Masa añadida (pan dulce).

## Resultados

| Verificación | Comparaciones | Resultado |
|---|---|---|
| Demanda anual por insumo | 39 | Coincide (diferencia relativa máxima 0.0e+00) |
| Caso con productos intermedios (resuelto a mano: 405.600 g y 62.400 g; «Masa Y» sin receta) | 3 | Coincide |
| Clasificación ABC: conjunto de insumos, orden, clase, valor y % acumulado | 38 insumos | Coincide (valor máx. 0.0048; % acumulado máx. 0.0050, el sistema redondea a 2 decimales) |
| EOQ, costos, ciclos, cantidad y puntos de reorden | 1368 | Coincide |
| Propiedades matemáticas del EOQ (pedir = mantener; mínimo; calendario no baja del mínimo) | 152 insumos x escenario | Se cumplen |

### Escenarios de reposición

| Escenario | Descripción | Comparaciones | Diferencia relativa máxima |
|---|---|---|---|
| A | Entrega semanal (miércoles), sin límite de vida útil | 342 | 1.8e-16 |
| B | Entrega semanal (miércoles), vida útil de 7 días | 342 | 1.7e-16 |
| C | Dos entregas por semana (martes y viernes), sin límite | 342 | 1.7e-16 |
| D | Entrega semanal (miércoles), stock máximo de 10 días de demanda | 342 | 1.7e-16 |

### Clasificación ABC (Python vs sistema)

| Clase | Insumos (Python) | Insumos (sistema) | % del valor (Python) | % del valor (sistema) |
|---|---|---|---|---|
| A | 8 | 8 | 82,77 | 82,77 |
| B | 8 | 8 | 12,32 | 12,32 |
| C | 22 | 22 | 4,91 | 4,91 |

Valor anual total: $234.436.871,15 (Python) frente a $234.436.871,15 (sistema). Clase A con agua: 81,11 %; sin agua: 82,77 %. Coinciden con las cifras documentadas en el hallazgo H-04 (81,11 % y 82,77 %).

### Referencia puntual

Con este catálogo, la demanda semanal de harina es 678,805 kg. En la pantalla de Análisis EOQ del 30/10/2026 (base real) el sistema mostraba 679,105 kg por semana. La diferencia es de 0,300 kg (0,04 %) y con los datos de esta validación no se puede atribuir a una causa: la base real pudo cambiar respecto del catálogo inicial (por ejemplo, ediciones de recetas). Queda pendiente repetir la comparación con una exportación de la base real; no cambia el resultado de esta validación, que compara cálculo contra cálculo con las mismas entradas.

## Archivos

- `comparacion_abc.csv`: valor, % acumulado y clase por insumo, en Python y en el sistema.
- `comparacion_reposicion.csv`: EOQ, ciclos y costo por insumo y escenario, en Python y en el sistema.
