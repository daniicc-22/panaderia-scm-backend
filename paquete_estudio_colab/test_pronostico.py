#!/usr/bin/env python3
"""Pruebas del prototipo de pronóstico. Ejecutar: python prediccion/test_pronostico.py"""
import numpy as np
import pronostico_demanda as P

fallos = []
def prueba(nombre, cond):
    print(("OK   " if cond else "FALLA"), nombre)
    if not cond: fallos.append(nombre)
cerca = lambda a, b, t=1e-9: abs(a - b) <= t

# Métricas con valores calculados a mano: real [10,20], previsto [12,18] -> e=[-2,2]
m = P.metricas(np.array([10., 20.]), np.array([12., 18.]))
prueba("WAPE = 4/30", cerca(m["wape"], 4 / 30)); prueba("MAE = 2", cerca(m["mae"], 2.0))
prueba("RMSE = 2", cerca(m["rmse"], 2.0)); prueba("sesgo = 0", cerca(m["sesgo"], 0.0))
m2 = P.metricas(np.array([10., 10.]), np.array([8., 8.]))
prueba("WAPE usa el real como denominador (4/20)", cerca(m2["wape"], 0.2))
prueba("sesgo positivo si se pronostica de menos", cerca(m2["sesgo"], 0.2))

# Series constantes: todos los métodos deben devolver la constante
c = np.full(20, 100.0)
for met in P.METODOS:
    prueba(f"constante -> constante ({met})", cerca(P.pronosticar(met, c, 1, 100.0), 100.0, 1e-6))
# Promedios con valores conocidos
h = np.arange(1., 21.)
prueba("prom12 = media de las últimas 12", cerca(P.pronosticar("prom12", h, 1, 0), np.mean(h[-12:])))
prueba("mm4 = media de las últimas 4", cerca(P.pronosticar("mm4", h, 1, 0), 18.5))
# Tendencia lineal exacta: AR(2) y Holt deben seguirla mejor que el promedio
prueba("AR(2) sigue una recta exacta", cerca(P.pronosticar("ar2", h, 1, 0), 21.0, 1e-6))
prueba("Holt sigue la recta mejor que prom12", abs(P.pronosticar("holt", h, 1, 0) - 21) < abs(P.pronosticar("prom12", h, 1, 0) - 21))

# Sin mirar el futuro: cambiar valores posteriores no altera los pronósticos de semanas anteriores
rng = np.random.default_rng(1)
y = P.simular_serie("estable", rng); y2 = y.copy(); y2[30:] *= 3
a, b = P.origen_movil(y), P.origen_movil(y2)
n = 30 - P.HISTORIAL_MINIMO
prueba("origen móvil no usa el futuro", all(np.allclose(a[m][1][1][:n], b[m][1][1][:n]) for m in P.METODOS))
prueba("el pronóstico de la semana t usa solo y[:t]", cerca(a["prom12"][1][1][0], np.mean(y[P.HISTORIAL_MINIMO - 12:P.HISTORIAL_MINIMO]) if False else np.mean(y[:P.HISTORIAL_MINIMO][-12:])))
prueba("declarada = media de las primeras 8 semanas", cerca(a["declarada"][1][1][0], np.mean(y[:P.HISTORIAL_MINIMO])))
prueba("h=2 tiene una observación menos que h=1", len(a["ses"][2][0]) == len(a["ses"][1][0]) - 1)

# Simulación: determinista, no negativa, escenarios con el comportamiento descrito
s1 = P.simular_serie("tendencia", np.random.default_rng(5)); s2 = P.simular_serie("tendencia", np.random.default_rng(5))
prueba("simulación determinista con la misma semilla", np.array_equal(s1, s2))
prueba("simulación sin valores negativos", all((P.simular_serie(e, np.random.default_rng(3)) >= 0).all() for e in P.ESCENARIOS))
big = [np.mean(P.simular_serie("cambio", np.random.default_rng(i))[30:]) / np.mean(P.simular_serie("cambio", np.random.default_rng(i))[:26]) for i in range(40)]
prueba("cambio de nivel ≈ +20 %", 1.15 < np.mean(big) < 1.25)

# Stock de seguridad: requiere errores mínimos y mide servicio entre 0 y 1
ss = P.evaluar_stock_seguridad(P.simular_serie("estable", np.random.default_rng(2)))
prueba("servicio dentro de [0,1]", all(0 <= v["servicio"] <= 1 for v in ss.values()))
prueba("semanas evaluadas = 52-8-4 (mínimo de errores)", all(v["semanas"] == P.SEMANAS - P.HISTORIAL_MINIMO - P.ERRORES_MINIMOS for v in ss.values()))
prueba("2 días fijos = 2/7 de la demanda", cerca(ss["dias_fijos"]["ss_relativo"], 2 / 7 * ss["dias_fijos"]["objetivo_relativo"] / (1 + 2 / 7), 0.05))
# Demanda constante: error 0 -> stock estadístico 0 y servicio completo
cte = np.full(30, 100.0); sc = P.evaluar_stock_seguridad(cte)
prueba("demanda constante: SS estadístico = 0, servicio 100 %", cerca(sc["estadistico_prom12"]["ss_relativo"], 0) and cerca(sc["estadistico_prom12"]["servicio"], 1))
# Reproducibilidad del experimento
r1 = P.correr_experimento(3, 7); r2 = P.correr_experimento(3, 7)
prueba("experimento reproducible", r1["estable"]["metodos"]["ses"][1][0]["wape"] == r2["estable"]["metodos"]["ses"][1][0]["wape"])
prueba("z del 95 % coincide con el sistema (1,6449)", cerca(P.Z_95, 1.6449))

print(f"\n{len(fallos)} fallas")
raise SystemExit(1 if fallos else 0)
