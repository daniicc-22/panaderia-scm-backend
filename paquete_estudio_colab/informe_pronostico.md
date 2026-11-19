# Informe del prototipo de pronóstico de demanda (Sprint 8, HU-32)

> **Datos simulados: no son datos de la panadería.** Son series sintéticas con semilla fija (20261102); sirven para probar el método, no para concluir sobre la panadería. Cuando exista el historial real del pre-test, se reemplaza la simulación por `consumo_produccion` y el resto no cambia.

## Qué se compara

- Validación de **origen móvil**: cada semana se pronostica con lo ocurrido hasta ese momento (historia mínima 8 semanas). Nunca se usa el futuro.
- 100 series simuladas de 52 semanas por escenario; se reporta el promedio.
- Líneas base: **consumo declarado** (promedio de las primeras 8 semanas, sin actualizar) y **promedio de 12 semanas** (lo que el sistema usa hoy).
- Métodos candidatos: promedio móvil 4 semanas, suavizado exponencial simple, Holt amortiguado y AR(2).
- Métricas: WAPE (error absoluto ponderado), MAE (kg), RMSE (kg) y sesgo.

## Escenario: Estable con ruido

| Método | WAPE 1 sem. | WAPE 2 sem. | MAE 1 sem. (kg) | RMSE 1 sem. (kg) | Sesgo 1 sem. |
|---|---|---|---|---|---|
| Consumo declarado | 8,6 % | 8,6 % | 57,9 | 71,9 | 0,3 % |
| Promedio 12 sem. (sistema hoy) | 8,2 % | 8,4 % | 55,5 | 69,2 | 0,1 % |
| Promedio móvil 4 sem. | 8,6 % | 9,1 % | 58,2 | 72,2 | 0,0 % |
| Suavizado exponencial | 8,3 % | 8,8 % | 55,9 | 69,6 | 0,1 % |
| Holt amortiguado | 8,4 % | 9,0 % | 56,8 | 70,8 | 0,1 % |
| Autorregresivo AR(2) | 8,3 % | 8,4 % | 56,0 | 70,0 | 0,1 % |

Mejor candidato: **Suavizado exponencial**, 8,3 % frente a 8,2 % del promedio de 12 semanas (sin mejora apreciable sobre el método actual).

## Escenario: Con tendencia (+0,8 % semanal)

| Método | WAPE 1 sem. | WAPE 2 sem. | MAE 1 sem. (kg) | RMSE 1 sem. (kg) | Sesgo 1 sem. |
|---|---|---|---|---|---|
| Consumo declarado | 17,8 % | 18,0 % | 149,4 | 174,6 | 17,2 % |
| Promedio 12 sem. (sistema hoy) | 7,5 % | 7,9 % | 62,7 | 78,2 | 4,2 % |
| Promedio móvil 4 sem. | 7,1 % | 7,6 % | 59,5 | 74,5 | 1,7 % |
| Suavizado exponencial | 7,0 % | 7,7 % | 58,6 | 73,4 | 1,6 % |
| Holt amortiguado | 7,0 % | 7,7 % | 58,7 | 73,5 | 0,9 % |
| Autorregresivo AR(2) | 7,6 % | 8,7 % | 64,1 | 80,1 | 3,4 % |

Mejor candidato: **Suavizado exponencial**, 7,0 % frente a 7,5 % del promedio de 12 semanas (mejora relativa 6,5 %).

## Escenario: Picos por fechas especiales

| Método | WAPE 1 sem. | WAPE 2 sem. | MAE 1 sem. (kg) | RMSE 1 sem. (kg) | Sesgo 1 sem. |
|---|---|---|---|---|---|
| Consumo declarado | 8,5 % | 8,5 % | 58,7 | 80,1 | 1,8 % |
| Promedio 12 sem. (sistema hoy) | 8,2 % | 8,4 % | 56,6 | 78,7 | 0,4 % |
| Promedio móvil 4 sem. | 8,9 % | 9,4 % | 61,9 | 83,4 | 0,0 % |
| Suavizado exponencial | 8,5 % | 8,9 % | 58,7 | 81,3 | 0,1 % |
| Holt amortiguado | 8,6 % | 9,1 % | 59,3 | 82,0 | 0,0 % |
| Autorregresivo AR(2) | 8,9 % | 9,0 % | 61,8 | 86,7 | 0,1 % |

Mejor candidato: **Suavizado exponencial**, 8,5 % frente a 8,2 % del promedio de 12 semanas (sin mejora apreciable sobre el método actual).

## Escenario: Cambio de nivel (+20 %)

| Método | WAPE 1 sem. | WAPE 2 sem. | MAE 1 sem. (kg) | RMSE 1 sem. (kg) | Sesgo 1 sem. |
|---|---|---|---|---|---|
| Consumo declarado | 12,7 % | 12,8 % | 96,4 | 117,6 | 9,6 % |
| Promedio 12 sem. (sistema hoy) | 7,8 % | 8,2 % | 59,4 | 76,4 | 2,6 % |
| Promedio móvil 4 sem. | 7,5 % | 8,1 % | 56,6 | 72,1 | 1,0 % |
| Suavizado exponencial | 7,2 % | 8,1 % | 54,9 | 70,5 | 1,0 % |
| Holt amortiguado | 7,3 % | 8,3 % | 55,7 | 71,3 | 0,7 % |
| Autorregresivo AR(2) | 7,8 % | 8,9 % | 59,1 | 75,5 | 2,6 % |

Mejor candidato: **Suavizado exponencial**, 7,2 % frente a 7,8 % del promedio de 12 semanas (mejora relativa 7,5 %).

## Stock de seguridad desde el error del pronóstico

Se compara el stock de seguridad fijo de 2 días con `z·σ_error` (z = 1,6449 para 95 %), protegiendo 1 semana. El σ se calcula solo con errores ya observados y se exige un mínimo de 4. «Servicio» = fracción de semanas en que el consumo no superó pronóstico + stock de seguridad.

| Escenario | Política | Servicio | Stock de seguridad (% demanda semanal) |
|---|---|---|---|
| Estable con ruido | 2 días fijos (hoy) | 99,7 % | 28,6 % |
| Estable con ruido | Estadístico + prom. 12 sem. | 93,3 % | 16,3 % |
| Estable con ruido | Estadístico + suavizado | 93,9 % | 16,7 % |
| Con tendencia (+0,8 % semanal) | 2 días fijos (hoy) | 99,4 % | 27,3 % |
| Con tendencia (+0,8 % semanal) | Estadístico + prom. 12 sem. | 86,7 % | 14,0 % |
| Con tendencia (+0,8 % semanal) | Estadístico + suavizado | 90,5 % | 13,2 % |
| Picos por fechas especiales | 2 días fijos (hoy) | 97,1 % | 28,6 % |
| Picos por fechas especiales | Estadístico + prom. 12 sem. | 94,9 % | 19,7 % |
| Picos por fechas especiales | Estadístico + suavizado | 95,4 % | 21,0 % |
| Cambio de nivel (+20 %) | 2 días fijos (hoy) | 98,3 % | 27,8 % |
| Cambio de nivel (+20 %) | Estadístico + prom. 12 sem. | 87,9 % | 14,6 % |
| Cambio de nivel (+20 %) | Estadístico + suavizado | 90,5 % | 13,9 % |

## Lectura honesta

- Con demanda estable los métodos son casi iguales: el ruido domina y complicar el modelo no ayuda. La ganancia está donde la demanda **se mueve** (tendencia o cambio de nivel), y ahí la mayor mejora la logra cualquier método que se adapte, incluso el promedio móvil corto.
- El consumo declarado sin actualizar es la peor línea base cuando hay tendencia o cambio de nivel; eso respalda el uso de consumo real en el sistema.
- El stock de seguridad fijo de 2 días de una semana de protección sobreprotege cuando la demanda es estable (servicio cercano a 100 %) y el estadístico cuesta menos inventario con servicio cercano al objetivo. Es una comparación de **políticas distintas**, no de igual servicio: para decidir se debe fijar el servicio objetivo con la panadería.
- Con tendencia o cambio de nivel el estadístico queda por debajo del 95 % porque el σ histórico se desactualiza; en esos casos conviene reiniciar o ponderar el error reciente.
- Todo esto vale para datos simulados. El criterio de adopción sigue siendo: reemplaza al método actual solo si lo supera en WAPE, MAE y RMSE sobre datos reales.

## Reproducir

```
python prediccion/informe_pronostico.py
python prediccion/test_pronostico.py
```

Siguiente paso: SARIMA con `statsmodels` en el equipo de Daniel, y datos reales del pre-test.
