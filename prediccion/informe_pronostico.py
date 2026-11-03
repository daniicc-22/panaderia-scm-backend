#!/usr/bin/env python3
"""Genera prediccion/informe_pronostico.md y las gráficas a partir de pronostico_demanda.py (datos SIMULADOS)."""
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pronostico_demanda as P

SALIDA = Path(__file__).parent
AZUL, NARANJA, GRIS, TINTA, SUAVE = "#2a78d6", "#eb6834", "#9a9a95", "#0b0b0b", "#52514e"
plt.rcParams.update({"font.size": 9, "axes.spines.top": False, "axes.spines.right": False,
                     "axes.edgecolor": "#c9c8c3", "axes.labelcolor": SUAVE, "xtick.color": SUAVE, "ytick.color": SUAVE})
pct = lambda x: f"{100*x:.1f} %".replace(".", ",")

res = P.correr_experimento()

# 1) WAPE a 1 semana por método y escenario (barras horizontales, un panel por escenario)
fig, axs = plt.subplots(1, 4, figsize=(12, 3.4), sharex=True)
LIM = 1.18 * max(P.resumir([x["wape"] for x in res[e]["metodos"][m][1]])[0] * 100 for e in P.ESCENARIOS for m in P.METODOS)
for ax, (esc, nombre) in zip(axs, P.ESCENARIOS.items()):
    vals = [P.resumir([x["wape"] for x in res[esc]["metodos"][m][1]])[0] * 100 for m in P.METODOS]
    cols = [NARANJA if m == "prom12" else (GRIS if m == "declarada" else AZUL) for m in P.METODOS]
    y = np.arange(len(P.METODOS))
    ax.barh(y, vals, color=cols, height=0.55)
    for yi, v in zip(y, vals):
        ax.text(v + 0.2, yi, f"{v:.1f}".replace(".", ","), va="center", fontsize=8, color=TINTA)
    ax.set_yticks(y); ax.set_yticklabels([P.ETIQUETAS[m] if ax is axs[0] else "" for m in P.METODOS]); ax.invert_yaxis()
    ax.set_xlim(0, LIM); ax.set_title(nombre, fontsize=9, color=TINTA, loc="left"); ax.set_xlabel("WAPE (%)")
fig.suptitle("Error de pronóstico a 1 semana (menor es mejor) · naranja = método actual del sistema, gris = declarado · " + P.MARCADO_SIMULACION,
             fontsize=9, color=SUAVE, x=0.01, ha="left")
fig.tight_layout(rect=(0, 0, 1, 0.93)); fig.savefig(SALIDA / "grafica_error_por_metodo.png", dpi=160); plt.close(fig)

# 2) Una serie de ejemplo (cambio de nivel): real vs promedio 12 sem. vs suavizado exponencial
y = P.simular_serie("cambio", np.random.default_rng([P.SEMILLA, 9, 1]))
om = P.origen_movil(y, horizontes=(1,))
semanas = np.arange(P.HISTORIAL_MINIMO + 1, len(y) + 1)
fig, ax = plt.subplots(figsize=(8.5, 3.6))
ax.plot(np.arange(1, len(y) + 1), y, color=GRIS, lw=1.5, label="Consumo real")
ax.plot(semanas, om["prom12"][1][1], color=NARANJA, lw=2, label="Promedio 12 sem. (sistema hoy)")
ax.plot(semanas, om["ses"][1][1], color=AZUL, lw=2, label="Suavizado exponencial")
ax.axvline(27, color="#c9c8c3", lw=1, ls="--"); ax.text(27.3, y.max() * 0.99, "cambio de nivel", fontsize=8, color=SUAVE, va="top")
ax.set_xlabel("Semana"); ax.set_ylabel("kg por semana"); ax.legend(frameon=False, fontsize=8, loc="lower right")
ax.set_title("Cómo siguen un cambio de demanda · " + P.MARCADO_SIMULACION, fontsize=9, color=SUAVE, loc="left")
fig.tight_layout(); fig.savefig(SALIDA / "grafica_serie_ejemplo.png", dpi=160); plt.close(fig)

# 3) Stock de seguridad: servicio logrado vs stock de seguridad mantenido
nombres = {"dias_fijos": "2 días fijos (hoy)", "estadistico_prom12": "Estadístico + prom. 12 sem.", "estadistico_ses": "Estadístico + suavizado"}
fig, axs = plt.subplots(1, 2, figsize=(10, 3.2))
for ax, (cmp, tit) in zip(axs, [("servicio", "Servicio logrado (% de semanas cubiertas)"), ("ss_relativo", "Stock de seguridad (% de la demanda semanal)")]):
    vals = [np.mean([100 * v for v in res["estable"]["stock"][p][cmp]]) for p in nombres]
    ax.barh(np.arange(3), vals, color=[NARANJA, AZUL, AZUL], height=0.5)
    for i, v in enumerate(vals): ax.text(v + 1, i, f"{v:.0f} %", va="center", fontsize=8, color=TINTA)
    ax.set_yticks(np.arange(3)); ax.set_yticklabels(list(nombres.values()) if ax is axs[0] else [""] * 3); ax.invert_yaxis()
    ax.set_title(tit, fontsize=9, color=TINTA, loc="left"); ax.set_xlim(0, 125)
fig.suptitle("Escenario estable · objetivo de servicio 95 % · " + P.MARCADO_SIMULACION, fontsize=9, color=SUAVE, x=0.01, ha="left")
fig.tight_layout(rect=(0, 0, 1, 0.92)); fig.savefig(SALIDA / "grafica_stock_seguridad.png", dpi=160); plt.close(fig)

# 4) Informe
L = []
L += ["# Informe del prototipo de pronóstico de demanda (Sprint 8, HU-32)", "",
      f"> **{P.MARCADO_SIMULACION}.** Son series sintéticas con semilla fija ({P.SEMILLA}); sirven para probar el método, no para concluir sobre la panadería. "
      "Cuando exista el historial real del pre-test, se reemplaza la simulación por `consumo_produccion` y el resto no cambia.", "",
      "## Qué se compara", "",
      f"- Validación de **origen móvil**: cada semana se pronostica con lo ocurrido hasta ese momento (historia mínima {P.HISTORIAL_MINIMO} semanas). Nunca se usa el futuro.",
      f"- {P.REPETICIONES} series simuladas de {P.SEMANAS} semanas por escenario; se reporta el promedio.",
      "- Líneas base: **consumo declarado** (promedio de las primeras 8 semanas, sin actualizar) y **promedio de 12 semanas** (lo que el sistema usa hoy).",
      "- Métodos candidatos: promedio móvil 4 semanas, suavizado exponencial simple, Holt amortiguado y AR(2).",
      "- Métricas: WAPE (error absoluto ponderado), MAE (kg), RMSE (kg) y sesgo.", ""]
for esc, nombre in P.ESCENARIOS.items():
    L += [f"## Escenario: {nombre}", "", "| Método | WAPE 1 sem. | WAPE 2 sem. | MAE 1 sem. (kg) | RMSE 1 sem. (kg) | Sesgo 1 sem. |", "|---|---|---|---|---|---|"]
    for m in P.METODOS:
        d = res[esc]["metodos"][m]
        g = lambda h, k: np.mean([x[k] for x in d[h]])
        kg = lambda v: f"{v:.1f}".replace(".", ",")
        L.append(f"| {P.ETIQUETAS[m]} | {pct(g(1,'wape'))} | {pct(g(2,'wape'))} | {kg(g(1,'mae'))} | {kg(g(1,'rmse'))} | {pct(g(1,'sesgo'))} |")
    base = np.mean([x["wape"] for x in res[esc]["metodos"]["prom12"][1]])
    mejor = min((m for m in P.METODOS if m not in ("declarada", "prom12")), key=lambda m: np.mean([x["wape"] for x in res[esc]["metodos"][m][1]]))
    wm = np.mean([x["wape"] for x in res[esc]["metodos"][mejor][1]])
    rel = (base - wm) / base
    L += ["", f"Mejor candidato: **{P.ETIQUETAS[mejor]}**, {pct(wm)} frente a {pct(base)} del promedio de 12 semanas (" + (f"mejora relativa {pct(rel)}" if rel > 0.01 else "sin mejora apreciable sobre el método actual") + ").", ""]
L += ["## Stock de seguridad desde el error del pronóstico", "",
      f"Se compara el stock de seguridad fijo de {P.DIAS_SEGURIDAD_ACTUAL} días con `z·σ_error` (z = 1,6449 para 95 %), protegiendo 1 semana. "
      f"El σ se calcula solo con errores ya observados y se exige un mínimo de {P.ERRORES_MINIMOS}. «Servicio» = fracción de semanas en que el consumo no superó pronóstico + stock de seguridad.", "",
      "| Escenario | Política | Servicio | Stock de seguridad (% demanda semanal) |", "|---|---|---|---|"]
for esc, nombre in P.ESCENARIOS.items():
    for p, n in nombres.items():
        s = res[esc]["stock"][p]
        L.append(f"| {nombre} | {n} | {pct(np.mean(s['servicio']))} | {pct(np.mean(s['ss_relativo']))} |")
L += ["", "## Lectura honesta", "",
      "- Con demanda estable los métodos son casi iguales: el ruido domina y complicar el modelo no ayuda. La ganancia está donde la demanda **se mueve** (tendencia o cambio de nivel), y ahí la mayor mejora la logra cualquier método que se adapte, incluso el promedio móvil corto.",
      "- El consumo declarado sin actualizar es la peor línea base cuando hay tendencia o cambio de nivel; eso respalda el uso de consumo real en el sistema.",
      "- El stock de seguridad fijo de 2 días de una semana de protección sobreprotege cuando la demanda es estable (servicio cercano a 100 %) y el estadístico cuesta menos inventario con servicio cercano al objetivo. Es una comparación de **políticas distintas**, no de igual servicio: para decidir se debe fijar el servicio objetivo con la panadería.",
      "- Con tendencia o cambio de nivel el estadístico queda por debajo del 95 % porque el σ histórico se desactualiza; en esos casos conviene reiniciar o ponderar el error reciente.",
      "- Todo esto vale para datos simulados. El criterio de adopción sigue siendo: reemplaza al método actual solo si lo supera en WAPE, MAE y RMSE sobre datos reales.", "",
      "## Reproducir", "", "```", "python prediccion/informe_pronostico.py", "python prediccion/test_pronostico.py", "```", "",
      "Siguiente paso: SARIMA con `statsmodels` en el equipo de Daniel, y datos reales del pre-test."]
(SALIDA / "informe_pronostico.md").write_text("\n".join(L).replace("grafica", "grafica") + "\n", encoding="utf-8")
print("ok")
