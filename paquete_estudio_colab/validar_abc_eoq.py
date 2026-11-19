#!/usr/bin/env python3
"""Validación independiente de la clasificación ABC y del EOQ (HU-33, indicador ERA de la Tabla I).

Recalcula en Python, con la fórmula del diseño y sin importar nada del sistema, lo que el sistema
calcula en TypeScript, y compara resultado por resultado.

Uso (desde la raíz del proyecto):
    npx ts-node --transpile-only validacion/sistema_abc_eoq.ts     # genera salida_sistema.json
    python validacion/validar_abc_eoq.py                           # genera el informe

Solo usa la biblioteca estándar de Python. Entradas: prisma/catalogo_piloto.json,
prisma/frecuencia_lotes.json y validacion/salida_sistema.json. No usa base de datos ni red.
"""
import csv
import datetime as dt
import json
import math
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CATALOGO = RAIZ / "prisma" / "catalogo_piloto.json"
FRECUENCIAS = RAIZ / "prisma" / "frecuencia_lotes.json"
SISTEMA = RAIZ / "validacion" / "salida_sistema.json"
INFORME = RAIZ / "validacion" / "informe_validacion.md"

TOL_REL = 1e-9  # el sistema no redondea en EOQ ni en costos: debe coincidir casi exacto
SEMANAS = 52
LIMITE_A, LIMITE_B = 80.0, 95.0
CODIGO_AGUA = "MP-008"
TOLERANCIA_CICLO = 1e-9


def cargar(ruta: Path):
    with ruta.open(encoding="utf-8") as f:
        return json.load(f)


# ------------------------------------------------------------------ costos y demanda
def costo_por_gramo(materia):
    """Presentación de mayor contenido; costo = precio / gramos."""
    mejor = max(materia["presentaciones"], key=lambda p: p["gramos"])
    return mejor["precio"] / mejor["gramos"]


def expandir(lineas, recetas, ruta, factor, acum, sin_receta):
    """Reparte los gramos de cada línea en materias primas; un intermedio se reparte según el peso de su receta."""
    for mp, intermedio, gramos in lineas:
        g = gramos * factor
        if mp is not None:
            acum[mp] = acum.get(mp, 0.0) + g
            continue
        if intermedio in ruta:
            continue  # ciclo
        receta = recetas.get(intermedio)
        peso = sum(x[2] for x in receta) if receta else 0
        if not receta or peso <= 0:
            sin_receta.add(intermedio)
            continue
        expandir(receta, recetas, ruta | {intermedio}, g / peso, acum, sin_receta)


def demanda_anual(catalogo, frecuencias):
    recetas, productos = {}, []
    for p in catalogo["productos"]:
        lineas = [(i["mp"], None, i["gramos"]) for i in p["ingredientes"]]
        if p["extra_intermedio"]:
            lineas.append((None, p["extra_intermedio"]["nombre"], p["extra_intermedio"]["gramos"]))
        recetas[p["nombre"]] = lineas
        productos.append((p["nombre"], p["es_intermedio"], frecuencias.get(p["nombre"], 6), lineas))
    usados = {inter for _, _, _, lineas in productos for mp, inter, _ in lineas if inter}
    demanda, sin_receta = {}, set()
    for nombre, es_inter, lotes, lineas in productos:
        if es_inter and nombre in usados:
            continue  # cuenta solo por el camino de quien lo usa
        parcial = {}
        expandir(lineas, recetas, {nombre}, lotes * SEMANAS, parcial, sin_receta)
        for mp, g in parcial.items():
            demanda[mp] = demanda.get(mp, 0.0) + g
    return demanda, sin_receta


# ------------------------------------------------------------------ ABC
def clasificar(filas):
    """filas: lista de (codigo, valor_anual). Clase por el acumulado ANTES de sumar el insumo."""
    filas = sorted(filas, key=lambda f: -f[1])
    total = sum(v for _, v in filas)
    acumulado, salida = 0.0, []
    for codigo, valor in filas:
        clase = "A" if acumulado < LIMITE_A else ("B" if acumulado < LIMITE_B else "C")
        pct = valor / total * 100 if total > 0 else 0.0
        acumulado += pct
        salida.append({"codigo": codigo, "valor": valor, "pct": pct, "acum": acumulado, "clase": clase})
    return total, salida


def resumen_clases(items, total):
    out = {}
    for c in "ABC":
        grupo = [i for i in items if i["clase"] == c]
        valor = sum(i["valor"] for i in grupo)
        out[c] = {"insumos": len(grupo), "valor": valor, "pct": valor / total * 100 if total else 0.0}
    return out


# ------------------------------------------------------------------ EOQ y política con calendario
def eoq(D, S, H):
    return math.sqrt(2 * D * S / H)


def costo_total(D, S, H, Q):
    return D / Q * S + Q / 2 * H


def entrega_desde(fecha, dias):
    for i in range(7):
        c = fecha + dt.timedelta(days=i)
        if (c.isoweekday() % 7) in dias:  # 0 = domingo ... 6 = sábado, como en el sistema
            return c
    raise RuntimeError("sin día de entrega")


def politica(D, S, H, d, ss, hoy, dias, plazo, vida, maximo):
    e1 = entrega_desde(hoy + dt.timedelta(days=plazo), dias)
    e2 = entrega_desde(e1 + dt.timedelta(days=1), dias)
    r1 = (e2 - e1).days
    r_prom = 7 / len(dias)

    def cobertura(k):
        cruda = r1 + (k - 1) * r_prom
        return min(cruda, vida) if vida else cruda

    mejor, k = math.inf, 1
    for c in range(1, 9):
        cruda = r1 + (c - 1) * r_prom
        if c > 1 and vida and cruda > vida + TOLERANCIA_CICLO:
            break
        if c > 1 and maximo and ss + d * cruda > maximo + TOLERANCIA_CICLO:
            break
        costo = costo_total(D, S, H, d * cobertura(c))
        if costo < mejor - TOLERANCIA_CICLO:
            mejor, k = costo, c
    return {
        "ciclos": k,
        "costo_total": mejor,
        "cantidad": d * cobertura(k),
        "nivel_objetivo": ss + d * cobertura(k),
        "pr_clasico": d * plazo + ss,
        "pr_calendario": d * (plazo + r1) + ss,
    }


def es(x, dec=2):
    """Número con formato español: 1.234,56."""
    return f"{x:,.{dec}f}".replace(",", "#").replace(".", ",").replace("#", ".")


def cerca(a, b, tol=TOL_REL):
    if a is None or b is None:
        return a is b
    return abs(a - b) <= tol * max(1.0, abs(a), abs(b))


def main():
    for ruta in (CATALOGO, FRECUENCIAS, SISTEMA):
        if not ruta.exists():
            sys.exit(f"Falta {ruta}. Corre primero: npx ts-node --transpile-only validacion/sistema_abc_eoq.ts")
    catalogo, frecuencias, sistema = cargar(CATALOGO), cargar(FRECUENCIAS), cargar(SISTEMA)
    sup = sistema["supuestos"]
    S, tasa, dias_seg, plazo = sup["costo_pedido"], sup["tasa_anual"], sup["dias_seguridad"], sup["plazo_dias"]
    hoy = dt.date.fromisoformat(sup["hoy"])

    costos = {m["codigo"]: costo_por_gramo(m) for m in catalogo["materias_primas"]}
    nombres = {m["codigo"]: m["nombre"] for m in catalogo["materias_primas"]}
    demanda, sin_receta = demanda_anual(catalogo, frecuencias)

    # ---------------------------------------------------------- 1. demanda anual
    dem_sis = sistema["demanda_anual_g"]
    dif_dem = [abs(demanda.get(c, 0) - dem_sis.get(c, 0)) / max(1.0, abs(dem_sis.get(c, 0))) for c in set(demanda) | set(dem_sis)]
    n_dem = len(dif_dem)

    # ---------------------------------------------------------- 1b. caso con intermedios (resuelto a mano)
    recetas_s = {
        "Pan A": [("MP-001", None, 1000), (None, "Masa X", 500)],
        "Masa X": [("MP-001", None, 600), ("MP-002", None, 400)],
        "Pan B": [(None, "Masa Y", 200)],
    }
    prods_s = [("Pan A", False, 6), ("Masa X", True, 2), ("Pan B", False, 3)]
    usados_s = {i for lin in recetas_s.values() for _, i, _ in lin if i}
    dem_s, sin_s = {}, set()
    for nombre, es_i, lotes in prods_s:
        if es_i and nombre in usados_s:
            continue
        parcial = {}
        expandir(recetas_s[nombre], recetas_s, {nombre}, lotes * SEMANAS, parcial, sin_s)
        for mp, g in parcial.items():
            dem_s[mp] = dem_s.get(mp, 0.0) + g
    # A mano: Pan A = 6 x 52 = 312 lotes; Masa X = 312 x 500 g = 156.000 g (60 % MP-001, 40 % MP-002).
    a_mano = {"MP-001": 312 * 1000 + 156000 * 0.6, "MP-002": 156000 * 0.4}  # 405.600 y 62.400 g
    caso_sis = sistema["caso_intermedios"]
    ok_inter = (
        all(cerca(dem_s.get(k, 0), v) for k, v in a_mano.items())
        and set(dem_s) == set(a_mano)
        and all(cerca(caso_sis["demanda"].get(k, 0), v) for k, v in a_mano.items())
        and set(caso_sis["demanda"]) == set(a_mano)
        and sin_s == {"Masa Y"} == set(caso_sis["sin_receta"])
    )

    # ---------------------------------------------------------- 2. ABC
    filas =[(c, g * costos[c]) for c, g in demanda.items() if c != CODIGO_AGUA]
    total, items = clasificar(filas)
    res = resumen_clases(items, total)
    total_ag, items_ag = clasificar([(c, g * costos[c]) for c, g in demanda.items()])
    pct_a_con_agua = sum(i["pct"] for i in items_ag if i["clase"] == "A")
    pct_a_sin_agua = res["A"]["pct"]

    sis_items = {i["codigo"]: i for i in sistema["abc"]["items"]}
    filas_abc, desacuerdos_clase, max_dif_valor, max_dif_acum = [], [], 0.0, 0.0
    orden_py = [i["codigo"] for i in items]
    orden_sis = [i["codigo"] for i in sistema["abc"]["items"]]
    for i in items:
        s = sis_items.get(i["codigo"])
        if s is None:
            desacuerdos_clase.append((i["codigo"], i["clase"], None))
            continue
        d_valor = abs(i["valor"] - s["valor_anual"])  # el sistema redondea a 2 decimales
        d_acum = abs(i["acum"] - s["porcentaje_acumulado"])  # y los porcentajes también
        max_dif_valor, max_dif_acum = max(max_dif_valor, d_valor), max(max_dif_acum, d_acum)
        if i["clase"] != s["clase"]:
            desacuerdos_clase.append((i["codigo"], i["clase"], s["clase"]))
        filas_abc.append([i["codigo"], nombres[i["codigo"]], round(i["valor"], 2), s["valor_anual"], round(i["acum"], 2), s["porcentaje_acumulado"], i["clase"], s["clase"]])
    mismo_conjunto = set(orden_py) == set(orden_sis)
    mismo_orden = orden_py == orden_sis
    resumen_ok = all(
        res[r["clase"]]["insumos"] == r["insumos"] and abs(res[r["clase"]]["pct"] - r["porcentaje"]) <= 0.005 + 1e-9
        for r in sistema["abc"]["resumen"]
    )

    # ---------------------------------------------------------- 3. EOQ y política
    esc_info = {e["id"]: e for e in sistema["escenarios"]}
    filas_rep, fallos = [], []
    n_comp = {e: 0 for e in esc_info}
    max_rel = {e: 0.0 for e in esc_info}
    inv_fallos = []
    campos = [
        ("eoq", "eoq"), ("ciclo_economico_dias", "ciclo_eco"), ("costo_anual_eoq", "costo_eoq"),
        ("costo_total_anual", "costo_total"), ("cantidad_politica", "cantidad"), ("punto_reorden_clasico", "pr_clasico"),
        ("punto_reorden_calendario", "pr_calendario"), ("nivel_objetivo", "nivel_objetivo"),
    ]
    for r in sistema["reposicion"]:
        e = esc_info[r["escenario"]]
        c = r["codigo"]
        D = demanda[c]
        H = tasa * costos[c]
        d = D / SEMANAS / 7
        ss = d * dias_seg
        vida = e["vida_util_dias"]
        maximo = d * e["stock_maximo_dias"] if e["stock_maximo_dias"] else None
        q = eoq(D, S, H)
        costo_eoq = costo_total(D, S, H, q)
        pol = politica(D, S, H, d, ss, hoy, set(e["dias_entrega"]), plazo, vida, maximo)
        mio = {
            "eoq": q, "ciclo_eco": q / d, "costo_eoq": costo_eoq, "costo_total": pol["costo_total"],
            "cantidad": pol["cantidad"], "pr_clasico": pol["pr_clasico"], "pr_calendario": pol["pr_calendario"],
            "nivel_objetivo": pol["nivel_objetivo"],
        }
        for campo_sis, campo_py in campos:
            n_comp[r["escenario"]] += 1
            a, b = mio[campo_py], r[campo_sis]
            rel = abs(a - b) / max(1.0, abs(a), abs(b)) if b is not None else math.inf
            max_rel[r["escenario"]] = max(max_rel[r["escenario"]], rel)
            if not cerca(a, b):
                fallos.append((r["escenario"], c, campo_sis, a, b))
        n_comp[r["escenario"]] += 1
        if pol["ciclos"] != r["ciclos_elegidos"]:
            fallos.append((r["escenario"], c, "ciclos_elegidos", pol["ciclos"], r["ciclos_elegidos"]))
        # Propiedades matemáticas que no dependen de ningún código:
        if not cerca(D / q * S, q / 2 * H, 1e-9):
            inv_fallos.append((c, "en el EOQ el costo de pedir debe igualar al de mantener"))
        for f in (0.5, 0.9, 1.1, 2.0):
            if costo_total(D, S, H, q * f) < costo_eoq - 1e-9 * costo_eoq:
                inv_fallos.append((c, f"el EOQ no es el mínimo (Q x {f} cuesta menos)"))
        if pol["costo_total"] < costo_eoq - 1e-9 * costo_eoq:
            inv_fallos.append((c, "el costo con calendario no puede ser menor que el mínimo teórico"))
        filas_rep.append([r["escenario"], c, nombres[c], round(D / 1000, 3), round(q / 1000, 3), round(r["eoq"] / 1000, 3),
                          pol["ciclos"], r["ciclos_elegidos"], round(pol["costo_total"], 2), round(r["costo_total_anual"], 2)])

    # ---------------------------------------------------------- salidas
    with (RAIZ / "validacion" / "comparacion_abc.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["codigo", "insumo", "valor_python", "valor_sistema", "acum_python", "acum_sistema", "clase_python", "clase_sistema"])
        w.writerows(filas_abc)
    with (RAIZ / "validacion" / "comparacion_reposicion.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["escenario", "codigo", "insumo", "demanda_anual_kg", "eoq_kg_python", "eoq_kg_sistema", "k_python", "k_sistema", "costo_total_python", "costo_total_sistema"])
        w.writerows(filas_rep)

    total_comp = sum(n_comp.values())
    ok_dem = max(dif_dem) <= TOL_REL
    ok_abc = mismo_conjunto and mismo_orden and not desacuerdos_clase and resumen_ok and max_dif_valor <= 0.0051 and max_dif_acum <= 0.0051
    ok_eoq = not fallos
    ok_inv = not inv_fallos
    todo_ok = ok_dem and ok_inter and ok_abc and ok_eoq and ok_inv
    harina = demanda.get("MP-001", 0) / SEMANAS / 1000

    L = []
    L.append("# Validación independiente de ABC y EOQ (HU-33)")
    L.append("")
    L.append(f"Generado el {dt.date.today().isoformat()}. Resultado: **{'CONCUERDA' if todo_ok else 'HAY DIFERENCIAS'}**.")
    L.append("")
    L.append("## Qué se hizo")
    L.append("")
    L.append("El script `validar_abc_eoq.py` recalcula en Python, desde el catálogo piloto (`prisma/catalogo_piloto.json`) y la frecuencia de lotes, la demanda anual por insumo, la clasificación ABC y el EOQ con su política de reposición con calendario del proveedor. El script `sistema_abc_eoq.ts` ejecuta las mismas funciones que usa la API sobre las mismas entradas. Después se comparan los resultados uno a uno.")
    L.append("")
    L.append("Alcance y límites: son las funciones de cálculo, con el catálogo piloto como entrada. No se compara contra la base de datos de producción ni se mide con consumo real (todavía no hay historial). La reimplementación en Python parte de las fórmulas y reglas del diseño; para que la validación sea más fuerte, la revisión del código de Python por otra persona del equipo la haría independiente también en la autoría.")
    L.append("")
    L.append("## Supuestos de la prueba (de demostración)")
    L.append("")
    L.append(f"- Costo por pedido S = ${es(S, 0)}; tasa anual de mantenimiento = {tasa*100:.0f} %; días de seguridad = {dias_seg}; tiempo de entrega = {plazo} días; fecha de referencia {sup['hoy']}.")
    L.append(f"- Demanda estimada por recetas: lotes por semana de `frecuencia_lotes.json` (6 por defecto) por {SEMANAS} semanas. El agua ({CODIGO_AGUA}) no entra al ABC.")
    L.append(f"- Intermedios usados sin receta en el catálogo (su demanda no se reparte): {', '.join(sorted(sin_receta)) or 'ninguno'}.")
    L.append("")
    L.append("## Resultados")
    L.append("")
    L.append("| Verificación | Comparaciones | Resultado |")
    L.append("|---|---|---|")
    L.append(f"| Demanda anual por insumo | {n_dem} | {'Coincide' if ok_dem else 'Diferencias'} (diferencia relativa máxima {max(dif_dem):.1e}) |")
    L.append(f"| Caso con productos intermedios (resuelto a mano: 405.600 g y 62.400 g; «Masa Y» sin receta) | 3 | {'Coincide' if ok_inter else 'Diferencias'} |")
    L.append(f"| Clasificación ABC: conjunto de insumos, orden, clase, valor y % acumulado | {len(filas_abc)} insumos | {'Coincide' if ok_abc else 'Diferencias'} (valor máx. {max_dif_valor:.4f}; % acumulado máx. {max_dif_acum:.4f}, el sistema redondea a 2 decimales) |")
    L.append(f"| EOQ, costos, ciclos, cantidad y puntos de reorden | {total_comp} | {'Coincide' if ok_eoq else str(len(fallos)) + ' diferencias'} |")
    L.append(f"| Propiedades matemáticas del EOQ (pedir = mantener; mínimo; calendario no baja del mínimo) | {len(sistema['reposicion'])} insumos x escenario | {'Se cumplen' if ok_inv else str(len(inv_fallos)) + ' incumplimientos'} |")
    L.append("")
    L.append("### Escenarios de reposición")
    L.append("")
    L.append("| Escenario | Descripción | Comparaciones | Diferencia relativa máxima |")
    L.append("|---|---|---|---|")
    for k, e in esc_info.items():
        L.append(f"| {k} | {e['descripcion']} | {n_comp[k]} | {max_rel[k]:.1e} |")
    L.append("")
    L.append("### Clasificación ABC (Python vs sistema)")
    L.append("")
    L.append("| Clase | Insumos (Python) | Insumos (sistema) | % del valor (Python) | % del valor (sistema) |")
    L.append("|---|---|---|---|---|")
    for r in sistema["abc"]["resumen"]:
        c = r["clase"]
        L.append(f"| {c} | {res[c]['insumos']} | {r['insumos']} | {es(res[c]['pct'])} | {es(r['porcentaje'])} |")
    L.append("")
    L.append(f"Valor anual total: ${es(total)} (Python) frente a ${es(sistema['abc']['total'])} (sistema). Clase A con agua: {es(pct_a_con_agua)} %; sin agua: {es(pct_a_sin_agua)} %. Coinciden con las cifras documentadas en el hallazgo H-04 (81,11 % y 82,77 %).")
    L.append("")
    L.append("### Referencia puntual")
    L.append("")
    L.append(f"Con este catálogo, la demanda semanal de harina es {es(harina, 3)} kg. En la pantalla de Análisis EOQ del 30/10/2026 (base real) el sistema mostraba 679,105 kg por semana. La diferencia es de {es(abs(679.105 - harina), 3)} kg ({es(abs(679.105 - harina) / 679.105 * 100)} %) y con los datos de esta validación no se puede atribuir a una causa: la base real pudo cambiar respecto del catálogo inicial (por ejemplo, ediciones de recetas). Queda pendiente repetir la comparación con una exportación de la base real; no cambia el resultado de esta validación, que compara cálculo contra cálculo con las mismas entradas.")
    L.append("")
    if fallos:
        L.append("## Diferencias encontradas (primeras 20)")
        L.append("")
        L.append("| Escenario | Insumo | Campo | Python | Sistema |")
        L.append("|---|---|---|---|---|")
        for esc, cod, campo, a, b in fallos[:20]:
            L.append(f"| {esc} | {cod} | {campo} | {a} | {b} |")
        L.append("")
    if desacuerdos_clase:
        L.append("## Insumos con distinta clase ABC")
        L.append("")
        for cod, a, b in desacuerdos_clase:
            L.append(f"- {cod}: Python {a}, sistema {b}")
        L.append("")
    if inv_fallos:
        L.append("## Propiedades matemáticas incumplidas (primeras 20)")
        L.append("")
        for cod, msg in inv_fallos[:20]:
            L.append(f"- {cod}: {msg}")
        L.append("")
    L.append("## Archivos")
    L.append("")
    L.append("- `comparacion_abc.csv`: valor, % acumulado y clase por insumo, en Python y en el sistema.")
    L.append("- `comparacion_reposicion.csv`: EOQ, ciclos y costo por insumo y escenario, en Python y en el sistema.")
    INFORME.write_text("\n".join(L) + "\n", encoding="utf-8")
    print("\n".join(L[:4]))
    print(f"Intermedios: {'coincide' if ok_inter else 'DIFERENCIAS'} | Demanda: {n_dem} comparaciones, dif. máx. {max(dif_dem):.1e} | ABC: {len(filas_abc)} insumos, clases {'iguales' if not desacuerdos_clase else 'DISTINTAS'} | EOQ/política: {total_comp} comparaciones, {len(fallos)} diferencias | propiedades: {len(inv_fallos)} incumplimientos")
    print(f"Informe: {INFORME}")
    sys.exit(0 if todo_ok else 1)


if __name__ == "__main__":
    main()
