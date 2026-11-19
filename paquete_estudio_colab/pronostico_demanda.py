#!/usr/bin/env python3
"""Prototipo del modelo predictivo de demanda (Sprint 8, HU-32 y base de HU-35).

IMPORTANTE: los datos de este script son SIMULADOS. Todavía no hay historial real de consumo; este
prototipo sirve para tener el método, la validación y las métricas listos y probados. Con el historial
del pre-test se reemplaza `simular_serie` por la lectura de `consumo_produccion` y no cambia nada más.

Qué hace
  1. Genera series semanales de consumo de un insumo en cuatro escenarios (estable, con tendencia,
     con picos por fechas especiales y con cambio de nivel).
  2. Pronostica la demanda de la semana siguiente con varios métodos, con validación de origen móvil
     (rolling-origin): en cada semana solo se usa lo que ya había ocurrido, nunca el futuro.
  3. Compara contra las dos líneas base del proyecto: el consumo declarado por el administrador y el
     promedio de las últimas 12 semanas (lo que el sistema usa hoy como consumo real).
  4. Compara el stock de seguridad fijo en días (como hoy) con el estadístico calculado a partir del
     error del pronóstico: z · σ_error · √(semanas de protección).

Uso:   python prediccion/pronostico_demanda.py            (genera informe y gráficas en prediccion/)
Pruebas: python prediccion/test_pronostico.py

Solo necesita numpy y matplotlib. El SARIMA (statsmodels) queda como siguiente paso.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

# ----------------------------------------------------------------------------- parámetros
SEMANAS = 52  # largo de cada serie simulada
HISTORIAL_MINIMO = 8  # semanas de historia antes de pronosticar (regla del proyecto)
ERRORES_MINIMOS = 4  # errores observados antes de calcular un stock de seguridad estadístico
Z_95 = 1.6449  # mismo valor que zParaNivelDeServicio(0.95) del sistema
DIAS_SEGURIDAD_ACTUAL = 2  # los días de seguridad de la demostración
NIVEL_BASE_KG = 679.0  # semanal; es la demanda de harina que muestra el sistema (orden de magnitud)
REPETICIONES = 100
SEMILLA = 20261102
MARCADO_SIMULACION = "Datos simulados: no son datos de la panadería"

METODOS = ["declarada", "prom12", "mm4", "ses", "holt", "ar2"]
ETIQUETAS = {
    "declarada": "Consumo declarado",
    "prom12": "Promedio 12 sem. (sistema hoy)",
    "mm4": "Promedio móvil 4 sem.",
    "ses": "Suavizado exponencial",
    "holt": "Holt amortiguado",
    "ar2": "Autorregresivo AR(2)",
}
ESCENARIOS = {
    "estable": "Estable con ruido",
    "tendencia": "Con tendencia (+0,8 % semanal)",
    "fechas": "Picos por fechas especiales",
    "cambio": "Cambio de nivel (+20 %)",
}


# ----------------------------------------------------------------------------- simulación
def simular_serie(escenario: str, rng: np.random.Generator, semanas: int = SEMANAS, nivel: float = NIVEL_BASE_KG) -> np.ndarray:
    """Consumo semanal simulado (kg). Ruido autocorrelacionado AR(1) con coeficiente 0,3."""
    cv = {"estable": 0.10, "tendencia": 0.08, "fechas": 0.08, "cambio": 0.08}[escenario]
    t = np.arange(semanas)
    media = np.full(semanas, nivel, dtype=float)
    if escenario == "tendencia":
        media = nivel * (1 + 0.008 * t)
    elif escenario == "fechas":
        for semana in (9, 26, 46):  # picos de una semana (+30 %)
            media[semana] *= 1.30
    elif escenario == "cambio":
        media[26:] *= 1.20
    phi = 0.3
    eps = rng.normal(0.0, cv * np.sqrt(1 - phi**2), semanas)
    ruido = np.zeros(semanas)
    ruido[0] = rng.normal(0.0, cv)
    for i in range(1, semanas):
        ruido[i] = phi * ruido[i - 1] + eps[i]
    return np.maximum(media * (1 + ruido), 0.0)


# ----------------------------------------------------------------------------- métodos
# Cada función recibe SOLO la historia disponible (hist) y devuelve el pronóstico para h semanas adelante.
def pron_declarada(hist: np.ndarray, h: int, declarada: float) -> float:
    return float(declarada)


def pron_promedio(hist: np.ndarray, h: int, n: int) -> float:
    return float(np.mean(hist[-n:]))


def pron_ses(hist: np.ndarray, h: int) -> float:
    """Suavizado exponencial simple; alfa elegido minimizando el error cuadrático de un paso en la historia."""
    alfas = np.arange(0.05, 0.951, 0.05)
    nivel = np.full(alfas.shape, hist[0], dtype=float)
    sse = np.zeros(alfas.shape)
    for y in hist[1:]:
        e = y - nivel
        sse += e * e
        nivel = nivel + alfas * e
    return float(nivel[int(np.argmin(sse))])


def pron_holt(hist: np.ndarray, h: int) -> float:
    """Holt con tendencia amortiguada; parámetros por búsqueda en malla sobre el error de un paso."""
    a, b, p = np.meshgrid([0.1, 0.3, 0.5, 0.7], [0.05, 0.1, 0.2], [0.9, 0.98], indexing="ij")
    a, b, p = a.ravel(), b.ravel(), p.ravel()
    nivel = np.full(a.shape, hist[0], dtype=float)
    tend = np.zeros(a.shape)
    sse = np.zeros(a.shape)
    for y in hist[1:]:
        previsto = nivel + p * tend
        sse += (y - previsto) ** 2
        nuevo = a * y + (1 - a) * previsto
        tend = b * (nuevo - nivel) + (1 - b) * p * tend
        nivel = nuevo
    i = int(np.argmin(sse))
    amort = sum(p[i] ** k for k in range(1, h + 1))
    return float(nivel[i] + amort * tend[i])


def pron_ar2(hist: np.ndarray, h: int) -> float:
    """AR(2) con constante por mínimos cuadrados; pronóstico recursivo."""
    x = np.column_stack([np.ones(len(hist) - 2), hist[1:-1], hist[:-2]])
    coef, *_ = np.linalg.lstsq(x, hist[2:], rcond=None)
    c, a1, a2 = coef
    y1, y2 = hist[-1], hist[-2]
    for _ in range(h):
        y1, y2 = c + a1 * y1 + a2 * y2, y1
    return float(y1)


def pronosticar(metodo: str, hist: np.ndarray, h: int, declarada: float) -> float:
    if metodo == "declarada":
        return pron_declarada(hist, h, declarada)
    if metodo == "prom12":
        return pron_promedio(hist, h, 12)
    if metodo == "mm4":
        return pron_promedio(hist, h, 4)
    if metodo == "ses":
        return pron_ses(hist, h)
    if metodo == "holt":
        return pron_holt(hist, h)
    if metodo == "ar2":
        return pron_ar2(hist, h)
    raise ValueError(metodo)


# ----------------------------------------------------------------------------- métricas
def metricas(real: np.ndarray, previsto: np.ndarray) -> dict:
    """WAPE (error absoluto ponderado), MAE, RMSE y sesgo relativo."""
    e = real - previsto
    return {
        "wape": float(np.sum(np.abs(e)) / np.sum(real)),
        "mae": float(np.mean(np.abs(e))),
        "rmse": float(np.sqrt(np.mean(e * e))),
        "sesgo": float(np.mean(e) / np.mean(real)),
    }


# ----------------------------------------------------------------------------- validación de origen móvil
def origen_movil(y: np.ndarray, horizontes=(1, 2)) -> dict:
    """Pronósticos de cada método desde cada semana t >= HISTORIAL_MINIMO, usando solo y[:t].

    Devuelve {método: {h: (reales, previstos)}}. La declarada es el promedio de las primeras
    HISTORIAL_MINIMO semanas: lo que el administrador sabía al empezar y no vuelve a actualizar.
    """
    declarada = float(np.mean(y[:HISTORIAL_MINIMO]))
    salida = {m: {h: ([], []) for h in horizontes} for m in METODOS}
    for t in range(HISTORIAL_MINIMO, len(y)):
        hist = y[:t]
        for h in horizontes:
            if t + h - 1 >= len(y):
                continue
            real = y[t + h - 1]
            for m in METODOS:
                salida[m][h][0].append(real)
                salida[m][h][1].append(pronosticar(m, hist, h, declarada))
    return {m: {h: (np.array(r), np.array(p)) for h, (r, p) in d.items()} for m, d in salida.items()}


# ----------------------------------------------------------------------------- stock de seguridad
def evaluar_stock_seguridad(y: np.ndarray, z: float = Z_95) -> dict:
    """Compara políticas de pronóstico + stock de seguridad (protección de 1 semana: revisión semanal, plazo 0).

    Política = (pronóstico de la semana, stock de seguridad). El servicio observado es la fracción de
    semanas en que lo consumido no superó pronóstico + stock de seguridad. El σ del error sale solo de
    errores ya observados (nunca del futuro) y se exige un mínimo de ERRORES_MINIMOS errores.
    """
    declarada = float(np.mean(y[:HISTORIAL_MINIMO]))
    politicas = {
        "dias_fijos": ("prom12", None),  # como hoy: promedio 12 sem. + 2 días de consumo
        "estadistico_prom12": ("prom12", "z"),  # mismo pronóstico, stock de seguridad desde el error
        "estadistico_ses": ("ses", "z"),  # pronóstico por suavizado exponencial + error
    }
    errores = {m: [] for m in ("prom12", "ses")}
    filas = {k: {"cubierto": [], "ss": [], "objetivo": [], "demanda": []} for k in politicas}
    for t in range(HISTORIAL_MINIMO, len(y)):
        hist = y[:t]
        previstos = {m: pronosticar(m, hist, 1, declarada) for m in errores}
        for nombre, (metodo, tipo) in politicas.items():
            f = previstos[metodo]
            if tipo is None:
                ss = DIAS_SEGURIDAD_ACTUAL / 7 * f
                utilizable = len(errores[metodo]) >= ERRORES_MINIMOS  # mismas semanas para comparar
            else:
                utilizable = len(errores[metodo]) >= ERRORES_MINIMOS
                ss = z * float(np.sqrt(np.mean(np.square(errores[metodo])))) if utilizable else 0.0
            if utilizable:
                filas[nombre]["cubierto"].append(y[t] <= f + ss)
                filas[nombre]["ss"].append(ss)
                filas[nombre]["objetivo"].append(f + ss)
                filas[nombre]["demanda"].append(y[t])
        for m in errores:  # después de decidir, se conoce lo ocurrido y entra al historial de errores
            errores[m].append(y[t] - previstos[m])
    return {
        k: {
            "servicio": float(np.mean(v["cubierto"])),
            "ss_relativo": float(np.mean(v["ss"]) / np.mean(v["demanda"])),
            "objetivo_relativo": float(np.mean(v["objetivo"]) / np.mean(v["demanda"])),
            "semanas": len(v["cubierto"]),
        }
        for k, v in filas.items()
    }


# ----------------------------------------------------------------------------- experimento completo
def correr_experimento(repeticiones: int = REPETICIONES, semilla: int = SEMILLA) -> dict:
    """Repite cada escenario con series simuladas distintas (misma semilla = mismo resultado)."""
    resultado = {}
    for k, esc in enumerate(ESCENARIOS):
        por_metodo = {m: {h: [] for h in (1, 2)} for m in METODOS}
        stock = {p: {"servicio": [], "ss_relativo": [], "objetivo_relativo": []} for p in ("dias_fijos", "estadistico_prom12", "estadistico_ses")}
        for r in range(repeticiones):
            rng = np.random.default_rng([semilla, k, r])
            y = simular_serie(esc, rng)
            om = origen_movil(y)
            for m in METODOS:
                for h in (1, 2):
                    real, prev = om[m][h]
                    por_metodo[m][h].append(metricas(real, prev))
            ss = evaluar_stock_seguridad(y)
            for p, v in ss.items():
                for campo in stock[p]:
                    stock[p][campo].append(v[campo])
        resultado[esc] = {"metodos": por_metodo, "stock": stock}
    return resultado


def resumir(valores: list[float]) -> tuple[float, float, float]:
    a = np.array(valores)
    return float(np.mean(a)), float(np.percentile(a, 10)), float(np.percentile(a, 90))


if __name__ == "__main__":
    # El informe y las gráficas se generan en informe_pronostico.py (importa este módulo).
    sys.exit("Ejecute prediccion/informe_pronostico.py")
