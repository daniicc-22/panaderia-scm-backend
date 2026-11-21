#!/usr/bin/env python3
"""
Genera scripts/sim_panaderias_cargar.sql: datos SIMULADOS (no reales) para La Espiga y Vendimia.
Toma el catálogo y las recetas del piloto (prisma/catalogo_piloto.json) y simula ~10 semanas de operación:
compras con lote, producción con pesaje, consumos FIFO/FEFO, mermas, vencimientos y conteos físicos.
Todo lote lleva el prefijo SIM- y toda nota el texto [SIM], para reconocerlos y borrarlos después.

Uso:  python3 generar_sim.py ruta/catalogo_piloto.json salida.sql
"""
import json, math, random, sys, uuid
from datetime import date, datetime, timedelta

CATALOGO, SALIDA = sys.argv[1], sys.argv[2]
CLAVES = sys.argv[3] if len(sys.argv) > 3 else 'V'  # V = Vendimia (piloto del pre-test); E = La Espiga
cat = json.load(open(CATALOGO, encoding='utf-8'))
MP = {m['codigo']: m for m in cat['materias_primas']}
PROD = {p['nombre']: p for p in cat['productos']}

INICIO, FIN = date(2026, 9, 14), date(2026, 11, 20)
FESTIVOS = {date(2026, 10, 12), date(2026, 11, 2), date(2026, 11, 16)}
NS = uuid.UUID('6d1c7f0e-5a1b-4c3e-9f00-2026112100aa')

# Vida útil aproximada (días) y criterio por insumo; el resto 180 días
VIDA = {'MP-009': 6, 'MP-017': 8, 'MP-034': 12, 'MP-035': 6, 'MP-005': 20, 'MP-006': 25, 'MP-004': 60,
        'MP-003': 120, 'MP-040': 120, 'MP-041': 120, 'MP-033': 120, 'MP-001': 150, 'MP-021': 120, 'MP-022': 120,
        'MP-023': 45, 'MP-036': 180, 'MP-010': 240, 'MP-002': 365, 'MP-007': 720, 'MP-027': 20, 'MP-026': 90,
        'MP-029': 150, 'MP-025': 180, 'MP-028': 365}
PERECEDEROS = {'MP-009', 'MP-017', 'MP-034', 'MP-035', 'MP-005', 'MP-006', 'MP-004', 'MP-023', 'MP-027'}


def q(v):
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(round(v, 4)) if isinstance(v, float) else str(v)
    if isinstance(v, (datetime,)):
        return "'" + v.strftime('%Y-%m-%d %H:%M:%S') + "-05'"
    if isinstance(v, date):
        return "'" + v.isoformat() + "'"
    if isinstance(v, list):
        return "'{" + ','.join(str(x) for x in v) + "}'"
    return "'" + str(v).replace("'", "''") + "'"


def r3(x):
    return round(x + 1e-12, 3)


# ---------------------------------------------------------------- perfiles
PERFILES = {
    'E': dict(
        nombre='La Espiga', semilla=1107, patron='%espiga%',
        productos={  # nombre: (días de la semana 0=lun..6=dom, tandas mín, tandas máx, precio de venta)
            'Pan pequeño': ([0, 1, 2, 3, 4, 5], 2, 3, 300), 'Pan de leche': ([0, 1, 2, 3, 4, 5], 1, 2, 400),
            'Pan mantequilla': ([0, 1, 2, 3, 4, 5], 1, 2, 500), 'Pan mantequilla y queso': ([0, 2, 4, 5], 1, 1, 700),
            'Pan integral': ([1, 3, 5], 1, 1, 600), 'Rosca 1000': ([0, 2, 4, 5], 1, 2, 1000),
            'Palanqueta 1000': ([1, 3, 5], 1, 2, 1000), 'Pan bocadillo': ([0, 1, 2, 3, 4, 5], 1, 1, 500),
            'Pan hamburguesa': ([3, 4, 5], 1, 2, 800), 'Pan perro': ([4, 5], 1, 2, 800),
            'Tostada normal': ([1, 4], 1, 1, 200), 'Pan de coco': ([2, 5], 1, 1, 400),
        },
        ajuste_receta=(0.94, 1.07), pesado=0.78, sd=0.028, atipico=0.02, falta_dia=0.03,
        cobertura=(1.08, 1.25), cobertura_perec=(1.1, 1.35), merma_venc_rapida=0.9,
        quemado=0.03, pasada=0.022, huevo_roto=0.45, derrame=0.12, prob_dosif=0.25,
        proveedores=[
            dict(clave='H', nombre='Distribuidora Harinas del Sur', contacto='Ana Lucía Bravo', tel='3164408821',
                 dias=[1, 4], hora='16:00', minimo=150000, plazo=1, factor=(0.97, 1.03),
                 mps=['MP-001', 'MP-002', 'MP-007', 'MP-021', 'MP-022', 'MP-028', 'MP-029', 'MP-025']),
            dict(clave='L', nombre='Lácteos y Huevos El Ejido', contacto='Óscar Muñoz', tel='3007126654',
                 dias=[1, 3, 5], hora='18:00', minimo=50000, plazo=1, factor=(0.98, 1.06),
                 mps=['MP-005', 'MP-009', 'MP-017', 'MP-004', 'MP-010', 'MP-023']),
            dict(clave='C', nombre='Comercializadora Insumos Panaderos La 16', contacto='Jaime Rosero', tel='3158890231',
                 dias=[2], hora='12:00', minimo=200000, plazo=2, factor=(0.95, 1.04), mps='*'),
            dict(clave='U', nombre='Supermercado del barrio (compras de urgencia)', contacto=None, tel=None,
                 dias=[], hora=None, minimo=None, plazo=0, factor=(1.12, 1.22), mps='urgencia'),
        ],
        costo_pedido=6000, tasa=0.24, dias_seg=2, fichas=0.75,
        conteos=[(16, 'aplicado'), (37, 'aplicado'), (55, 'aplicado')], conteo_err=(0.006, 0.025), conteo_exacto=0.45,
    ),
    'V': dict(
        nombre='Vendimia', semilla=2211, patron='%vendimia%',
        productos={
            'Croissant chocolate': ([0, 1, 2, 3, 4, 5, 6], 1, 2, 3500), 'Croissant hawaiano': ([1, 3, 4, 5, 6], 1, 2, 3800),
            'Croissant bocadillo y queso': ([0, 2, 4, 5, 6], 1, 2, 3200), 'Rollo de queso': ([0, 1, 2, 3, 4, 5, 6], 1, 2, 2800),
            'Pan de leche': ([0, 1, 2, 3, 4, 5], 1, 1, 450), 'Pan fruta': ([1, 3, 5], 1, 1, 500),
            'Pambaso': ([0, 2, 4, 5], 1, 1, 500), 'Concha mexicana': ([2, 4, 5, 6], 1, 2, 2500),
            'Palanqueta Milenium': ([4, 5, 6], 1, 1, 2000), 'Panetón': ([3, 5, 6], 1, 2, 9000),
        },
        ajuste_receta=(0.9, 1.12), pesado=0.48, sd=0.055, atipico=0.05, falta_dia=0.07,
        cobertura=(1.15, 1.45), cobertura_perec=(1.3, 1.75), merma_venc_rapida=0.55,
        quemado=0.035, pasada=0.03, huevo_roto=0.2, derrame=0.08, prob_dosif=0.3,
        proveedores=[
            dict(clave='M', nombre='Mayorista San Andrés', contacto='Luz Dary Ortega', tel='3116672093',
                 dias=[2, 5], hora='15:00', minimo=120000, plazo=1, factor=(0.99, 1.07),
                 mps=['MP-001', 'MP-002', 'MP-007', 'MP-021', 'MP-028', 'MP-029', 'MP-030']),
            dict(clave='Q', nombre='Quesos y Lácteos de Nariño', contacto='Fabián Guerrero', tel='3205581147',
                 dias=[1, 4, 6], hora='17:30', minimo=40000, plazo=1, factor=(1.0, 1.08),
                 mps=['MP-005', 'MP-009', 'MP-017', 'MP-004', 'MP-010', 'MP-034', 'MP-023']),
            dict(clave='R', nombre='Repostería Total Pasto', contacto=None, tel='3012239876',
                 dias=[3], hora=None, minimo=None, plazo=3, factor=(0.97, 1.08), mps='*'),
            dict(clave='U', nombre='Tienda La Esquina (urgencias)', contacto=None, tel=None,
                 dias=[], hora=None, minimo=None, plazo=0, factor=(1.15, 1.28), mps='urgencia'),
        ],
        costo_pedido=4000, tasa=0.30, dias_seg=1, fichas=0.35,
        conteos=[(28, 'aplicado'), (58, 'enviado')], conteo_err=(0.04, 0.3), conteo_exacto=0.18,
    ),
}

# Cambio de receta a mitad de periodo en Vendimia (versión 2)
CAMBIO_V2 = {'V': ('Rollo de queso', date(2026, 10, 19), 'Se aumentó el queso y se bajó la margarina por quejas de los clientes')}

PROC = {
    'Pan pequeño': 'Mezclar secos, agregar grasas y líquidos; amasar 12 min; dividir en piezas de 45 g; fermentar 90 min; hornear.',
    'Pan de leche': 'Amasar con leche tibia hasta punto de velo; reposo 20 min; bolear; fermentar 80 min; barnizar con huevo.',
    'Pan mantequilla': 'Amasado mixto; incorporar la mantequilla al final; formar; fermentar 75 min; hornear hasta dorar.',
    'Pan integral': 'Hidratar el salvado 15 min; amasar con la harina; fermentar en bloque 40 min; formar y hornear.',
    'Rosca 1000': 'Amasar; dividir; trenzar; fermentar 70 min; decorar con azúcar; hornear.',
    'Pan hamburguesa': 'Masa suave; bolear piezas de 70 g; aplanar; fermentar; barnizar y ajonjolí opcional.',
    'Croissant chocolate': 'Laminar con hojaldrina (3 vueltas sencillas); cortar triángulos; rellenar; fermentar 60 min a 28 °C.',
    'Pan bocadillo': 'Dividir en piezas de 50 g; rellenar con bocadillo; cerrar; fermentar 80 min; hornear.',
    'Rollo de queso': 'Estirar la masa; esparcir queso; enrollar; cortar; fermentar 60 min; hornear.',
    'Croissant hawaiano': 'Laminar con hojaldrina; cortar; rellenar con jamón y piña escurrida; enrollar; fermentar 60 min; barnizar.',
    'Croissant bocadillo y queso': 'Laminar; cortar triángulos; rellenar con bocadillo y queso; enrollar; fermentar 60 min; hornear.',
    'Pan fruta': 'Amasar; incorporar la fruta al final sin romperla; dividir; fermentar 80 min; hornear.',
    'Pambaso': 'Amasar; dividir piezas de 60 g; formar; fermentar 75 min; hornear hasta dorar.',
    'Concha mexicana': 'Bolear la masa; cubrir con la galleta de concha; marcar; fermentar 70 min; hornear.',
    'Palanqueta Milenium': 'Amasar; formar barras; fermentar 70 min; cortar la superficie; hornear.',
    'Panetón': 'Masa con fruta y pasas; reposo 30 min; formar en moldes; fermentar 2 h; hornear a fuego bajo.',
}
TIEMPOS = {'Croissant': (40, 18, 190), 'Panetón': (60, 45, 170), 'Concha': (35, 20, 180)}


def construir(clave):
    P = PERFILES[clave]
    rnd = random.Random(P['semilla'])
    ids = {}

    def nid(*partes):
        return str(uuid.uuid5(NS, clave + '|' + '|'.join(str(p) for p in partes)))

    # Insumos usados por los productos elegidos
    mps_usados = []
    for pn in P['productos']:
        for ing in PROD[pn]['ingredientes']:
            if ing['mp'] not in mps_usados:
                mps_usados.append(ing['mp'])
    if clave == 'V':
        mps_usados.append('MP-016')  # vainilla comprada pero sin receta (consumo declarado)
    mps_usados.sort()

    # Proveedor de cada insumo
    prov_de = {}
    for pv in P['proveedores']:
        if isinstance(pv['mps'], list):
            for m in pv['mps']:
                if m in mps_usados:
                    prov_de[m] = pv['clave']
    for m in mps_usados:
        prov_de.setdefault(m, next(p['clave'] for p in P['proveedores'] if p['mps'] == '*'))
    provs = {p['clave']: p for p in P['proveedores']}

    # Presentaciones y precios (variación propia de cada panadería)
    pres = {}
    for m in mps_usados:
        dato = MP[m]
        pr = dato['presentaciones'][0]
        f = rnd.uniform(*provs[prov_de[m]]['factor'])
        pres[m] = dict(id=nid('pres', m), contenido=pr['gramos'], precio=round(pr['precio'] * f / 50) * 50,
                       pp=nid('pp', m, prov_de[m]), pp_urg=nid('pp', m, 'U'),
                       precio_urg=round(pr['precio'] * rnd.uniform(*provs['U']['factor']) / 50) * 50)
    controla = {m: MP[m].get('controla_inventario', True) for m in mps_usados}
    criterio = {}
    for m in mps_usados:
        if clave == 'E':
            criterio[m] = 'FEFO' if m in PERECEDEROS else 'FIFO'
        else:
            criterio[m] = 'FEFO' if m in ('MP-009', 'MP-017') else None

    # Recetas propias: la del piloto con ajustes de cada panadería
    recetas = {}
    for pn in P['productos']:
        base = PROD[pn]
        lineas = []
        for ing in base['ingredientes']:
            g = ing['gramos'] * rnd.uniform(*P['ajuste_receta'])
            g = round(g) if g >= 20 else round(g, 1)
            lineas.append((ing['mp'], max(g, 0.5)))
        rend = max(1, round(base['rendimiento'] * rnd.uniform(0.95, 1.05)))
        recetas[pn] = [dict(version=1, lineas=lineas, rend=rend, desde=INICIO - timedelta(days=rnd.randint(20, 60)))]
    if clave in CAMBIO_V2:
        pn, dia_cambio, motivo = CAMBIO_V2[clave]
        v1 = recetas[pn][0]
        nuevas = [(m, round(g * (1.25 if m == 'MP-017' else 0.85 if m in ('MP-003', 'MP-040') else 1.0), 1)) for m, g in v1['lineas']]
        recetas[pn].append(dict(version=2, lineas=nuevas, rend=v1['rend'], desde=dia_cambio, motivo=motivo))

    # ------------------------------------------------ plan de producción
    dias = []
    d = INICIO
    while d <= FIN:
        dias.append(d)
        d += timedelta(days=1)
    plan = []  # (dia, hora, producto, tandas)
    sin_registro = set()
    for d in dias:
        wd = d.weekday()
        if wd == 6 and clave == 'E':
            continue
        if rnd.random() < P['falta_dia'] and d < FIN - timedelta(days=2):
            sin_registro.add(d)
            continue
        f = 1.0
        if wd == 5: f = 1.3
        if wd == 0: f = 0.85
        if wd == 6: f = 0.7
        if d in FESTIVOS: f *= 0.7
        if d.day in (15, 30, 1, 16): f *= 1.15
        hora = datetime(d.year, d.month, d.day, 4, rnd.randint(0, 40))
        for pn, (dsem, tmin, tmax, _) in P['productos'].items():
            if wd not in dsem:
                continue
            if rnd.random() < 0.06:  # ese día no se hizo
                continue
            t = rnd.randint(tmin, tmax)
            if f > 1.1 and rnd.random() < 0.5: t += 1
            if f < 0.8 and t > 1 and rnd.random() < 0.6: t -= 1
            hora = hora + timedelta(minutes=rnd.randint(18, 55))
            plan.append((d, hora, pn, t))
        # Error de registro: producción anotada dos veces (Vendimia, pocas veces)
        if clave == 'V' and rnd.random() < 0.03 and plan and plan[-1][0] == d:
            dd, hh, pn, t = plan[-1]
            plan.append((d, hh + timedelta(minutes=3), pn, t))

    def receta_vigente(pn, d):
        vs = [v for v in recetas[pn] if v['desde'] <= d]
        return vs[-1]

    # Pesos reales decididos de antemano (para que las compras sepan lo que viene)
    eventos = []
    for (d, hora, pn, t) in plan:
        rec = receta_vigente(pn, d)
        lineas = []
        for m, g in rec['lineas']:
            est = r3(g * t)
            pesado = rnd.random() < P['pesado']
            real = est
            if pesado:
                dev = rnd.gauss(0, P['sd'])
                if rnd.random() < P['atipico']:
                    dev = rnd.choice([-1, 1]) * rnd.uniform(0.15, 0.35)
                real = round(est * (1 + dev)) if est >= 50 else round(est * (1 + dev), 1)
                real = max(real, 0.1)
                if abs(real - est) < 1e-9:
                    real = est
            lineas.append(dict(mp=m, est=est, real=r3(real), pesado=pesado))
        eventos.append(dict(dia=d, hora=hora, producto=pn, tandas=t, rec=rec, lineas=lineas))

    necesidad = {}  # (dia, mp) -> gramos
    for e in eventos:
        for l in e['lineas']:
            if controla[l['mp']]:
                necesidad[(e['dia'], l['mp'])] = necesidad.get((e['dia'], l['mp']), 0) + l['real']

    # ------------------------------------------------ simulación día a día
    lotes = {}       # id -> dict
    lotes_mp = {m: [] for m in mps_usados}
    compras, dcompras, recepciones, producciones, consumos, movs, pesajes, mermas = [], [], [], [], [], [], [], []
    conteos, dconteos = [], []
    seq_lote = {}
    stock = lambda m: sum(lotes[i]['disp'] for i in lotes_mp[m])

    def vigente(l, d):
        return l['venc'] is None or l['venc'] >= d

    def stock_util(m, d):
        return sum(lotes[i]['disp'] for i in lotes_mp[m] if vigente(lotes[i], d))

    def disponible_a(m, d, hora):
        return sum(lotes[i]['disp'] for i in lotes_mp[m] if vigente(lotes[i], d) and lotes[i]['creado'] <= hora)

    def comprar(d, hora, pvc, items, parcial_prob=0.0):
        if not items:
            return
        cid = nid('compra', d, pvc, hora.strftime('%H%M'))
        parcial = False
        for (m, n) in items:
            precio = pres[m]['precio_urg'] if pvc == 'U' else pres[m]['precio']
            ppid = pres[m]['pp_urg'] if pvc == 'U' else pres[m]['pp']
            recibido = n
            if n >= 2 and rnd.random() < parcial_prob:
                recibido = n - 1
                parcial = True
            dcid = nid('dc', cid, m)
            dcompras.append(dict(id=dcid, compra=cid, pp=ppid, pedida=n, precio=precio))
            drid = nid('dr', dcid)
            recepciones.append(dict(id=drid, dc=dcid, fecha=d, recibida=recibido))
            k = seq_lote.get(d, 0) + 1
            seq_lote[d] = k
            cont = pres[m]['contenido']
            vida = VIDA.get(m, 180)
            venc = d + timedelta(days=max(2, round(vida * rnd.uniform(0.85, 1.1))))
            if criterio[m] is None and m not in PERECEDEROS and rnd.random() < 0.5:
                venc = None  # en Vendimia a veces no anotan el vencimiento
            lid = nid('lote', drid)
            lote = dict(id=lid, mp=m, dr=drid, ini=r3(recibido * cont), disp=r3(recibido * cont),
                        costo=round(precio / cont, 4), venc=venc, codigo=f"SIM-{d.strftime('%Y%m%d')}-{k:03d}",
                        creado=hora + timedelta(minutes=k), llegada=hora)
            lotes[lid] = lote
            lotes_mp[m].append(lid)
        compras.append(dict(id=cid, prov=pvc, fecha=d, creado=hora, estado='parcial' if parcial else 'completa'))

    def mov(d_hora, lote_id, tipo, cant, consumo=None, desp=None, obs=None):
        cant = r3(cant)
        if cant <= 0:
            return None
        signo = 1 if tipo in ('ajuste_entrada', 'entrada') else -1
        l = lotes[lote_id]
        nuevo = r3(l['disp'] + signo * cant)
        assert nuevo >= -1e-9, (lote_id, l['disp'], cant, tipo)
        l['disp'] = max(nuevo, 0.0)
        mid = nid('mov', lote_id, tipo, d_hora.isoformat(), len(movs))
        movs.append(dict(id=mid, lote=lote_id, tipo=tipo, cant=cant, consumo=consumo, desp=desp, fecha=d_hora, obs=obs))
        return mid

    def merma_lote(d_hora, lote_id, causa, cant, etapa, prod=None):
        l = lotes[lote_id]
        cant = r3(min(cant, l['disp']))
        if cant <= 0:
            return
        did = nid('desp', lote_id, causa, d_hora.isoformat())
        mermas.append(dict(id=did, lote=lote_id, prod=prod, causa=causa, cant=cant, etapa=etapa,
                           costo=round(l['costo'] * cant, 2), fecha=d_hora))
        mov(d_hora, lote_id, 'salida_merma', cant, desp=did)

    # Días de entrega por proveedor (0=domingo .. 6=sábado)
    def es_entrega(pv, d):
        return ((d.weekday() + 1) % 7) in pv['dias']

    def proxima_entrega(pv, d):
        k = 1
        while k < 15:
            if es_entrega(pv, d + timedelta(days=k)):
                return d + timedelta(days=k)
            k += 1
        return d + timedelta(days=7)

    pendientes_venc = {}  # lote -> día en que se dará de baja (Vendimia demora)
    eventos_por_dia = {}
    for e in eventos:
        eventos_por_dia.setdefault(e['dia'], []).append(e)

    for d in dias:
        # 1. Recepciones programadas del día (06:00-08:00)
        for pv in P['proveedores']:
            if pv['clave'] == 'U' or not es_entrega(pv, d):
                continue
            sig = proxima_entrega(pv, d)
            horizonte = (sig - d).days + 1 + P['dias_seg']
            items = []
            for m in mps_usados:
                if prov_de[m] != pv['clave'] or not controla[m]:
                    continue
                req = sum(necesidad.get((d + timedelta(days=k), m), 0) for k in range(horizonte))
                if m == 'MP-016':
                    req = 0 if stock(m) > 0 else 1
                cobertura = rnd.uniform(*(P['cobertura_perec'] if m in PERECEDEROS else P['cobertura']))
                falta = req * cobertura - stock_util(m, d)
                if falta > 0:
                    n = math.ceil(falta / pres[m]['contenido'])
                    items.append((m, n))
            hora = datetime(d.year, d.month, d.day, rnd.randint(5, 6), rnd.randint(0, 59))
            comprar(d, hora, pv['clave'], items, parcial_prob=0.05 if clave == 'E' else 0.09)

        # 2. Producción del día
        for e in eventos_por_dia.get(d, []):
            # compra de urgencia si no alcanza (al supermercado / tienda)
            urg = []
            for l in e['lineas']:
                m = l['mp']
                if not controla[m]:
                    continue
                hay = disponible_a(m, d, e['hora'])
                if hay < l['real'] - 1e-6:
                    urg.append((m, math.ceil((l['real'] - hay) / pres[m]['contenido'] + 0.0001)))
            if urg:  # se compró la tarde anterior en la tienda del barrio
                ayer = d - timedelta(days=1)
                comprar(ayer, datetime(ayer.year, ayer.month, ayer.day, 19, rnd.randint(0, 50)), 'U', urg)
            pid = nid('prod', e['dia'], e['hora'].isoformat(), e['producto'])
            plan_c = r3(e['rec']['rend'] * e['tandas'])
            prod = dict(id=pid, producto=e['producto'], version=e['rec']['version'], fecha=e['hora'],
                        planificada=plan_c, producida=None, estado='finalizada')
            producciones.append(prod)
            for l in e['lineas']:
                pesajes.append(dict(prod=pid, mp=l['mp'], est=l['est'], real=l['real'], pesado=l['pesado'],
                                    creado=e['hora']))
                m = l['mp']
                if not controla[m]:
                    continue
                pend = l['real']
                orden = [lotes[i] for i in lotes_mp[m] if lotes[i]['disp'] > 0 and vigente(lotes[i], d) and lotes[i]['creado'] <= e['hora']]
                if criterio[m] == 'FEFO':
                    orden.sort(key=lambda x: (x['venc'] or date(2100, 1, 1), x['creado']))
                else:
                    orden.sort(key=lambda x: x['creado'])
                for lt in orden:
                    if pend <= 1e-9:
                        break
                    toma = r3(min(pend, lt['disp']))
                    cid = nid('cons', pid, lt['id'])
                    consumos.append(dict(id=cid, prod=pid, lote=lt['id'], cant=toma))
                    mov(e['hora'], lt['id'], 'salida_produccion', toma, consumo=cid)
                    pend = r3(pend - toma)
                assert pend <= 1e-6, ('faltó', clave, d, m, pend)
            # cierre y mermas de producción
            masa = sum(l['real'] for l in e['lineas'])
            factor = rnd.gauss(0.975, 0.025)
            cierre = e['hora'] + timedelta(minutes=rnd.randint(150, 260))
            x = rnd.random()
            if x < P['quemado']:
                frac = rnd.uniform(0.15, 0.6)
                factor *= (1 - frac)
                mermas.append(dict(id=nid('desp', pid, 'q'), lote=None, prod=pid, causa='quemado',
                                   cant=r3(round(masa * frac * 0.85)), etapa='produccion', costo=None, fecha=cierre))
            elif x < P['quemado'] + P['pasada']:
                frac = rnd.uniform(0.1, 0.35)
                factor *= (1 - frac)
                mermas.append(dict(id=nid('desp', pid, 'p'), lote=None, prod=pid, causa='masa_pasada',
                                   cant=r3(round(masa * frac)), etapa='produccion', costo=None, fecha=cierre))
            elif any(l['pesado'] and abs(l['real'] - l['est']) / l['est'] > 0.2 for l in e['lineas']) and rnd.random() < P['prob_dosif']:
                frac = rnd.uniform(0.08, 0.25)
                factor *= (1 - frac)
                mermas.append(dict(id=nid('desp', pid, 'd'), lote=None, prod=pid, causa='error_dosificacion',
                                   cant=r3(round(masa * frac)), etapa='produccion', costo=None, fecha=cierre))
            prod['producida'] = max(1, round(plan_c * min(factor, 1.04)))
            prod['cierre'] = cierre

        # 3. Mermas de bodega: huevos rotos, derrames
        hora_tarde = datetime(d.year, d.month, d.day, 14, rnd.randint(0, 59))
        if d in eventos_por_dia:
            for m, prob, rango in (('MP-005', P['huevo_roto'], (55, 260)), ('MP-001', P['derrame'], (300, 2500)),
                                   ('MP-002', P['derrame'] * 0.6, (200, 1500)), ('MP-009', P['derrame'] * 0.8, (200, 1000))):
                if m in mps_usados and rnd.random() < prob:
                    vivos = [lotes[i] for i in lotes_mp[m] if lotes[i]['disp'] > 0]
                    if vivos:
                        lt = min(vivos, key=lambda x: x['creado'])
                        merma_lote(hora_tarde, lt['id'], 'derrame', round(rnd.uniform(*rango)),
                                   'almacenamiento' if rnd.random() < 0.7 else 'produccion')
            if clave == 'V' and rnd.random() < 0.02:  # devolución de producto por mal estado de un insumo
                m = rnd.choice([x for x in ('MP-017', 'MP-034', 'MP-004') if x in mps_usados])
                vivos = [lotes[i] for i in lotes_mp[m] if lotes[i]['disp'] > 0]
                if vivos:
                    merma_lote(hora_tarde, vivos[0]['id'], 'devolucion', round(vivos[0]['disp'] * rnd.uniform(0.1, 0.3)), 'almacenamiento')

        # 4. Bajas por vencimiento
        for m in mps_usados:
            for i in lotes_mp[m]:
                lt = lotes[i]
                if lt['disp'] <= 0 or lt['venc'] is None or lt['venc'] >= d:
                    continue
                if i not in pendientes_venc:
                    if rnd.random() < P['merma_venc_rapida']:
                        pendientes_venc[i] = d
                    else:
                        pendientes_venc[i] = d + timedelta(days=rnd.randint(2, 9))
                    if clave == 'V' and d >= FIN - timedelta(days=8) and rnd.random() < 0.6:
                        pendientes_venc[i] = FIN + timedelta(days=1)  # quedó vencido en bodega sin dar de baja
                if pendientes_venc[i] <= d and d != FIN:
                    hh = datetime(d.year, d.month, d.day, 17, rnd.randint(0, 59))
                    merma_lote(hh, i, 'vencimiento', lt['disp'], 'almacenamiento')

        # 5. Conteos físicos (al final de la jornada)
        for (n_dia, estado) in P['conteos']:
            if (d - INICIO).days != n_dia:
                continue
            numero = len(conteos) + 1
            cid = nid('conteo', numero)
            inicio = datetime(d.year, d.month, d.day, 18, rnd.randint(0, 30))
            clase_a = [m for m in ('MP-001', 'MP-002', 'MP-003', 'MP-004', 'MP-040', 'MP-041', 'MP-005', 'MP-006', 'MP-017', 'MP-036')
                       if m in mps_usados and controla[m]]
            dets = []
            for m in clase_a:
                for i in lotes_mp[m]:
                    lt = lotes[i]
                    if lt['disp'] <= 0:
                        continue
                    sist = lt['disp']
                    if rnd.random() < P['conteo_exacto']:
                        cont = sist
                    else:
                        e = rnd.uniform(*P['conteo_err'])
                        signo = -1 if rnd.random() < 0.8 else 1
                        cont = r3(round(sist * (1 + signo * e)))
                        cont = max(cont, 0)
                    motivo, obs = None, None
                    if abs(cont - sist) > 1e-9:
                        motivo = rnd.choice(['error_registro', 'error_registro', 'perdida_dano', 'error_produccion', 'otro'])
                        obs = rnd.choice([None, None, 'Bulto abierto sin anotar', 'Se usó para una prueba', 'Diferencia de báscula', 'No se anotó una salida'])
                    dets.append(dict(id=nid('dc', cid, i), lote=i, sist=sist, cont=cont, motivo=motivo, obs=obs,
                                     at=inicio + timedelta(minutes=len(dets) * 2 + 3)))
            cierre = inicio + timedelta(minutes=len(dets) * 2 + 15)
            conteos.append(dict(id=cid, numero=numero, estado=estado, creado=inicio, enviado=cierre,
                                resuelto=(cierre + timedelta(hours=rnd.randint(1, 14))) if estado == 'aplicado' else None))
            for x in dets:
                x['conteo'] = cid
                x['mov'] = None
                dif = r3(x['cont'] - x['sist'])
                if estado == 'aplicado' and abs(dif) > 1e-9:
                    etiqueta = {'error_registro': 'Error de registro (entrada o salida mal anotada)',
                                'error_produccion': 'Error en una producción', 'perdida_dano': 'Pérdida o daño',
                                'otro': 'Otro'}[x['motivo']]
                    nota = f"Conteo n.º {numero}: {etiqueta}" + (f" ({x['obs']})" if x['obs'] else '') + ' [SIM]'
                    x['mov'] = mov(conteos[-1]['resuelto'], x['lote'], 'ajuste_entrada' if dif > 0 else 'ajuste_salida', abs(dif), obs=nota)
                dconteos.append(x)

    # Producciones que el operario dejó abiertas (Vendimia, las dos últimas del penúltimo día)
    if clave == 'V':
        penult = [p for p in producciones if p['fecha'].date() == FIN - timedelta(days=1)]
        for p in penult[-1:]:
            p['estado'] = 'en_curso'
            p['producida'] = None

    # Parámetros de inventario
    params = []
    for m in mps_usados:
        if not controla[m]:
            continue
        if clave == 'V' and rnd.random() < 0.3:
            continue  # Vendimia no tiene configurados todos los insumos
        params.append(dict(mp=m, s=P['costo_pedido'], tasa=P['tasa'], seg=P['dias_seg'],
                           lead=provs[prov_de[m]]['plazo'], vida=VIDA.get(m) if m in PERECEDEROS else None,
                           modo='al_uso' if m in ('MP-017', 'MP-034') else 'periodica',
                           semanal=500 if m == 'MP-016' else None))

    return dict(P=P, mps=mps_usados, pres=pres, controla=controla, criterio=criterio, prov_de=prov_de, provs=provs,
                recetas=recetas, lotes=lotes, compras=compras, dcompras=dcompras, recepciones=recepciones,
                producciones=producciones, consumos=consumos, movs=movs, pesajes=pesajes, mermas=mermas,
                conteos=conteos, dconteos=dconteos, params=params, sin_registro=sin_registro, nid=nid)


# ---------------------------------------------------------------- SQL
def bloque(tabla, cols, filas, sel, extra=''):
    """INSERT … SELECT desde VALUES unidos al contexto (panadería y usuarios) en lotes de 400 filas."""
    out = []
    for i in range(0, len(filas), 400):
        parte = filas[i:i + 400]
        vals = ',\n'.join('(' + ','.join(q(v) for v in f) + ')' for f in parte)
        out.append(f"INSERT INTO public.{tabla} ({', '.join(cols)})\nSELECT {sel}\nFROM (VALUES\n{vals}\n) v({', '.join('c' + str(k) for k in range(len(parte[0])))})\n{extra};\n")
    return '\n'.join(out)


def sql_panaderia(clave, D):
    P = D['P']
    ctx = f"CROSS JOIN _sim_ctx x WHERE x.k = '{clave}'"
    s = [f"\n-- =====================================================================\n-- {P['nombre']}  (clave {clave})\n-- =====================================================================\n"]
    nid = D['nid']
    # Proveedores
    filas = []
    for pv in P['proveedores']:
        filas.append([nid('prov', pv['clave']), pv['nombre'], pv['contacto'], pv['tel'], pv['dias'], pv['hora'], pv['minimo']])
    s.append(bloque('proveedor', ['id', 'panaderia_id', 'nombre', 'contacto', 'telefono', 'dias_entrega', 'hora_limite_pedido', 'pedido_minimo', 'activo', 'created_at'],
                    filas, "v.c0::uuid, x.pan, v.c1, v.c2, v.c3, v.c4::smallint[], v.c5, v.c6::numeric, true, x.alta", ctx))
    # Materias primas
    filas = []
    for m in D['mps']:
        dato = MP[m]
        filas.append([nid('mp', m), m, dato['nombre'], dato['categoria'], D['criterio'][m],
                      D['provs'][D['prov_de'][m]]['plazo'], D['controla'][m]])
    s.append(bloque('materia_prima', ['id', 'panaderia_id', 'categoria_id', 'codigo', 'nombre', 'unidad_base_id', 'criterio_rotacion', 'lead_time_dias', 'controla_inventario', 'created_at'],
                    filas, "v.c0::uuid, x.pan, (SELECT c.id FROM public.categoria_materia_prima c WHERE c.nombre = v.c3 LIMIT 1), v.c1, v.c2, x.g, v.c4::criterio_rotacion_enum, v.c5::numeric, v.c6, x.alta", ctx))
    # Presentaciones y ofertas
    filas, ofertas = [], []
    for m in D['mps']:
        p = D['pres'][m]
        g = p['contenido']
        nombre = f"{g / 1000:g} kg" if g >= 1000 and g % 1000 == 0 else f"{g:g} g"
        filas.append([p['id'], nid('mp', m), nombre, g])
        ofertas.append([p['pp'], p['id'], nid('prov', D['prov_de'][m]), p['precio'], D['provs'][D['prov_de'][m]]['plazo']])
        ofertas.append([p['pp_urg'], p['id'], nid('prov', 'U'), p['precio_urg'], 0])
    s.append(bloque('presentacion', ['id', 'panaderia_id', 'materia_prima_id', 'nombre', 'contenido', 'unidad_contenido_id'],
                    filas, "v.c0::uuid, x.pan, v.c1::uuid, v.c2, v.c3::numeric, x.g", ctx))
    s.append(bloque('presentacion_proveedor', ['id', 'panaderia_id', 'presentacion_id', 'proveedor_id', 'precio_referencia', 'tiempo_entrega_dias'],
                    ofertas, "v.c0::uuid, x.pan, v.c1::uuid, v.c2::uuid, v.c3::numeric, v.c4::numeric", ctx))
    # Parámetros
    filas = [[nid('mp', a['mp']), a['s'], a['tasa'], a['seg'], a['lead'], a['vida'], a['modo'], a['semanal']] for a in D['params']]
    s.append(bloque('parametro_inventario', ['panaderia_id', 'materia_prima_id', 'costo_ordenar_s', 'tasa_mantenimiento_anual', 'dias_seguridad', 'lead_time_dias', 'vida_util_dias', 'modo_reposicion', 'consumo_semanal_declarado', 'vigente_desde', 'rango_original_observaciones'],
                    filas, "x.pan, v.c0::uuid, v.c1::numeric, v.c2::numeric, v.c3::numeric, v.c4::numeric, v.c5::numeric, v.c6, v.c7::numeric, x.alta::date, '[SIM] parámetro de simulación'", ctx))
    # Productos y formulaciones
    rnd = random.Random(P['semilla'] + 7)
    prods, forms, dets = [], [], []
    for pn, (_, _, _, precio) in P['productos'].items():
        prods.append([nid('producto', pn), pn, precio])
        vers = D['recetas'][pn]
        for i, v in enumerate(vers):
            activa = i == len(vers) - 1
            hasta = vers[i + 1]['desde'] - timedelta(days=1) if not activa else None
            con_ficha = rnd.random() < P['fichas']
            tiempos = next((t for k, t in TIEMPOS.items() if pn.startswith(k)), (rnd.choice([25, 30, 35]), rnd.choice([15, 18, 20, 25]), rnd.choice([170, 180, 190, 200])))
            forms.append([nid('form', pn, v['version']), nid('producto', pn), v['version'], activa, v['desde'], hasta, v['rend'],
                          v.get('motivo'), PROC.get(pn) if con_ficha else None,
                          tiempos[0] if con_ficha else None, tiempos[1] if con_ficha else None, tiempos[2] if con_ficha else None,
                          round(rnd.uniform(8, 14), 1) if con_ficha else None])
            for m, g in v['lineas']:
                dets.append([nid('form', pn, v['version']), nid('mp', m), g, 3 if con_ficha else None])
    s.append(bloque('producto', ['id', 'panaderia_id', 'nombre', 'unidad_produccion_id', 'es_intermedio', 'precio_venta', 'created_at'],
                    prods, "v.c0::uuid, x.pan, v.c1, x.un, false, v.c2::numeric, x.alta", ctx))
    s.append(bloque('formulacion', ['id', 'panaderia_id', 'producto_id', 'version', 'activa', 'vigente_desde', 'vigente_hasta', 'rendimiento_esperado', 'motivo_cambio', 'procedimiento', 'tiempo_preparacion_min', 'tiempo_horneado_min', 'temperatura_horneado_c', 'merma_horneado_pct'],
                    forms, "v.c0::uuid, x.pan, v.c1::uuid, v.c2::int, v.c3, v.c4::date, v.c5::date, v.c6::numeric, v.c7, v.c8, v.c9::int, v.c10::int, v.c11::int, v.c12::numeric", ctx))
    s.append(bloque('detalle_formulacion', ['formulacion_id', 'materia_prima_id', 'cantidad_estandar', 'unidad_id', 'tolerancia_porcentaje'],
                    dets, "v.c0::uuid, v.c1::uuid, v.c2::numeric, x.g, v.c3::numeric", ctx))
    # Compras → recepciones → lotes
    usr = lambda: 'x.adm'
    s.append(bloque('compra', ['id', 'panaderia_id', 'proveedor_id', 'usuario_id', 'fecha_pedido', 'estado', 'created_at'],
                    [[c['id'], nid('prov', c['prov']), c['fecha'], c['estado'], c['creado']] for c in D['compras']],
                    "v.c0::uuid, x.pan, v.c1::uuid, x.adm, v.c2::date, v.c3::estado_compra_enum, v.c4::timestamptz", ctx))
    s.append(bloque('detalle_compra', ['id', 'compra_id', 'panaderia_id', 'presentacion_proveedor_id', 'cantidad_pedida', 'precio_unitario_pactado'],
                    [[x['id'], x['compra'], x['pp'], x['pedida'], x['precio']] for x in D['dcompras']],
                    "v.c0::uuid, v.c1::uuid, x.pan, v.c2::uuid, v.c3::numeric, v.c4::numeric", ctx))
    s.append(bloque('detalle_recepcion', ['id', 'detalle_compra_id', 'usuario_id', 'panaderia_id', 'fecha_recepcion', 'cantidad_recibida'],
                    [[x['id'], x['dc'], x['fecha'], x['recibida']] for x in D['recepciones']],
                    "v.c0::uuid, v.c1::uuid, x.ope, x.pan, v.c2::date, v.c3::numeric", ctx))
    s.append(bloque('lote', ['id', 'panaderia_id', 'materia_prima_id', 'detalle_recepcion_id', 'cantidad_inicial', 'cantidad_disponible', 'costo_unitario', 'fecha_vencimiento', 'codigo_lote', 'created_at'],
                    [[l['id'], nid('mp', l['mp']), l['dr'], l['ini'], l['costo'], l['venc'], l['codigo'], l['creado']] for l in D['lotes'].values()],
                    "v.c0::uuid, x.pan, v.c1::uuid, v.c2::uuid, v.c3::numeric, v.c3::numeric, v.c4::numeric, v.c5::date, v.c6, v.c7::timestamptz", ctx))
    # Producción (se insertan ya cerradas: el disparador de inmutabilidad solo actúa en UPDATE)
    s.append(bloque('produccion', ['id', 'panaderia_id', 'producto_id', 'formulacion_id', 'usuario_id', 'fecha', 'estado', 'origen_planificacion', 'cantidad_planificada', 'cantidad_producida'],
                    [[p['id'], nid('producto', p['producto']), nid('form', p['producto'], p['version']), p['fecha'], p['estado'], p['planificada'], p['producida']] for p in D['producciones']],
                    "v.c0::uuid, x.pan, v.c1::uuid, v.c2::uuid, x.ope, v.c3::timestamptz, v.c4::estado_produccion_enum, 'sin_registro', v.c5::numeric, v.c6::numeric", ctx))
    s.append(bloque('pesaje_produccion', ['panaderia_id', 'produccion_id', 'materia_prima_id', 'peso_estandar', 'peso_real', 'pesado', 'created_at'],
                    [[w['prod'], nid('mp', w['mp']), w['est'], w['real'], w['pesado'], w['creado']] for w in D['pesajes']],
                    "x.pan, v.c0::uuid, v.c1::uuid, v.c2::numeric, v.c3::numeric, v.c4, v.c5::timestamptz", ctx))
    s.append(bloque('consumo_produccion', ['id', 'panaderia_id', 'produccion_id', 'lote_id', 'cantidad_consumida'],
                    [[c['id'], c['prod'], c['lote'], c['cant']] for c in D['consumos']],
                    "v.c0::uuid, x.pan, v.c1::uuid, v.c2::uuid, v.c3::numeric", ctx))
    s.append(bloque('desperdicio', ['id', 'panaderia_id', 'lote_id', 'produccion_id', 'causa_id', 'usuario_id', 'cantidad', 'etapa', 'costo_estimado', 'fecha'],
                    [[m['id'], m['lote'], m['prod'], m['causa'], m['cant'], m['etapa'], m['costo'], m['fecha']] for m in D['mermas']],
                    "v.c0::uuid, x.pan, v.c1::uuid, v.c2::uuid, (SELECT c.id FROM public.causa_desperdicio c WHERE c.panaderia_id = x.pan AND c.codigo = v.c3), x.ope, v.c4::numeric, v.c5::etapa_desperdicio_enum, v.c6::numeric, v.c7::timestamptz", ctx))
    # Conteos (antes que sus movimientos no importa: el detalle apunta al movimiento y se inserta después)
    s.append(bloque('conteo_fisico', ['id', 'panaderia_id', 'numero', 'estado', 'creado_por', 'observaciones', 'created_at', 'enviado_at', 'resuelto_por', 'resuelto_at'],
                    [[c['id'], c['numero'], c['estado'], c['creado'], c['enviado'], c['resuelto']] for c in D['conteos']],
                    "v.c0::uuid, x.pan, v.c1::int, v.c2::estado_conteo_enum, x.ope, 'Conteo de insumos clase A [SIM]', v.c3::timestamptz, v.c4::timestamptz, CASE WHEN v.c5 IS NULL THEN NULL ELSE x.adm END, v.c5::timestamptz", ctx))
    # Movimientos en orden cronológico (el disparador descuenta del lote)
    movs = D['movs']  # ya están en el orden en que ocurrieron
    s.append(bloque('movimiento_inventario', ['id', 'panaderia_id', 'lote_id', 'tipo_movimiento_id', 'cantidad', 'consumo_produccion_id', 'desperdicio_id', 'usuario_id', 'fecha', 'observaciones'],
                    [[m['id'], m['lote'], m['tipo'], m['cant'], m['consumo'], m['desp'], m['fecha'], m['obs'] or '[SIM]', i] for i, m in enumerate(movs)],
                    "v.c0::uuid, x.pan, v.c1::uuid, (SELECT t.id FROM public.tipo_movimiento_inventario t WHERE t.codigo::text = v.c2), v.c3::numeric, v.c4::uuid, v.c5::uuid, CASE WHEN v.c2 LIKE 'ajuste%' THEN x.adm ELSE x.ope END, v.c6::timestamptz, v.c7", ctx + ' ORDER BY v.c8'))
    s.append(bloque('detalle_conteo', ['id', 'panaderia_id', 'conteo_id', 'lote_id', 'cantidad_sistema', 'cantidad_contada', 'motivo', 'observaciones', 'contado_por', 'contado_at', 'movimiento_id'],
                    [[x['id'], x['conteo'], x['lote'], x['sist'], x['cont'], x['motivo'], x['obs'], x['at'], x['mov']] for x in D['dconteos']],
                    "v.c0::uuid, x.pan, v.c1::uuid, v.c2::uuid, v.c3::numeric, v.c4::numeric, v.c5, v.c6, x.ope, v.c7::timestamptz, v.c8::uuid", ctx))
    # Verificación: el stock que deja la base debe ser el que calculó la simulación
    esperado = ',\n'.join(f"('{l['id']}'::uuid, {r3(l['disp'])})" for l in D['lotes'].values())
    s.append(f"""
CREATE TEMP TABLE _sim_esperado_{clave} (lote uuid, disp numeric) ON COMMIT DROP;
INSERT INTO _sim_esperado_{clave} VALUES
{esperado};
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM _sim_esperado_{clave} e JOIN public.lote l ON l.id = e.lote
  WHERE abs(l.cantidad_disponible - e.disp) > 0.002;
  IF n > 0 THEN
    RAISE EXCEPTION '[SIM] {P['nombre']}: % lotes no quedaron con el stock esperado. No se guardó nada.', n;
  END IF;
END $$;
""")
    return '\n'.join(s)


def main():
    datos = {k: construir(k) for k in CLAVES}
    patrones = ', '.join(f"('{k}', '{PERFILES[k]['patron']}')" for k in CLAVES)
    nombres = ' y '.join(f"«{PERFILES[k]['nombre']}»" for k in CLAVES)
    partes = [f"""-- =====================================================================
-- DATOS SIMULADOS de PRE-TEST para {nombres}.
-- NO son datos reales: muestran cómo se vería la línea base (pre-test) mientras se recogen los datos reales.
-- Generado por scripts/sim/generar_sim.py a partir del catálogo y las recetas del piloto.
-- Periodo simulado: {INICIO} a {FIN}. Todo lote empieza por «SIM-» y las notas llevan «[SIM]».
-- Para quitarlo todo: scripts/sim_panaderias_limpiar.sql
--
-- Ensayo (no guarda nada):  psql "$cadena" -v fin=ROLLBACK -f scripts/sim_panaderias_cargar.sql
-- Real:                     psql "$cadena" -v fin=COMMIT   -f scripts/sim_panaderias_cargar.sql
-- =====================================================================
\\encoding UTF8
\\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE _sim_ctx (k text, pan uuid, adm uuid, ope uuid, g uuid, un uuid, alta timestamptz) ON COMMIT DROP;

DO $$
DECLARE
  r record; n integer; v_pan uuid; v_adm uuid; v_ope uuid;
BEGIN
  FOR r IN SELECT * FROM (VALUES {patrones}) AS t(k, patron) LOOP
    SELECT count(*) INTO n FROM public.panaderia WHERE nombre ILIKE r.patron AND activa;
    IF n <> 1 THEN RAISE EXCEPTION '[SIM] Se esperaba una sola panadería activa que coincida con % y hay %', r.patron, n; END IF;
    SELECT id INTO v_pan FROM public.panaderia WHERE nombre ILIKE r.patron AND activa;

    -- Solo se cargan en una panadería vacía: nunca se mezclan con datos que ya existan
    IF EXISTS (SELECT 1 FROM public.materia_prima WHERE panaderia_id = v_pan)
       OR EXISTS (SELECT 1 FROM public.producto WHERE panaderia_id = v_pan)
       OR EXISTS (SELECT 1 FROM public.proveedor WHERE panaderia_id = v_pan) THEN
      RAISE EXCEPTION '[SIM] La panadería % ya tiene catálogo; no se carga nada.', r.patron;
    END IF;
    IF (SELECT count(*) FROM public.causa_desperdicio WHERE panaderia_id = v_pan) < 7 THEN
      RAISE EXCEPTION '[SIM] La panadería % no tiene sus 7 causas de merma.', r.patron;
    END IF;

    SELECT up.usuario_id INTO v_adm FROM public.usuario_panaderia up
      JOIN public.usuario u ON u.id = up.usuario_id JOIN public.rol ro ON ro.id = u.rol_id
      WHERE up.panaderia_id = v_pan AND up.activo AND ro.codigo = 'administrador' ORDER BY up.fecha_asignacion LIMIT 1;
    SELECT up.usuario_id INTO v_ope FROM public.usuario_panaderia up
      JOIN public.usuario u ON u.id = up.usuario_id JOIN public.rol ro ON ro.id = u.rol_id
      WHERE up.panaderia_id = v_pan AND up.activo AND ro.codigo = 'operario' ORDER BY up.fecha_asignacion LIMIT 1;
    IF v_adm IS NULL THEN RAISE EXCEPTION '[SIM] La panadería % no tiene un administrador asignado.', r.patron; END IF;
    v_ope := coalesce(v_ope, v_adm);  -- si no hay operario, el administrador registra todo

    INSERT INTO _sim_ctx VALUES (r.k, v_pan, v_adm, v_ope,
      (SELECT id FROM public.unidad_medida WHERE codigo = 'g'),
      (SELECT id FROM public.unidad_medida WHERE codigo = 'un'),
      '{INICIO - timedelta(days=21)} 09:00:00-05');
  END LOOP;
  IF EXISTS (SELECT 1 FROM _sim_ctx WHERE g IS NULL OR un IS NULL) THEN
    RAISE EXCEPTION '[SIM] Faltan las unidades g o un en el catálogo.';
  END IF;
END $$;
"""]
    resumen = []
    for k, D in datos.items():
        partes.append(sql_panaderia(k, D))
        prods = D['producciones']
        merma_lote = sum(m['cant'] for m in D['mermas'] if m['lote'])
        merma_prod = sum(m['cant'] for m in D['mermas'] if not m['lote'])
        entrada = sum(l['ini'] for l in D['lotes'].values())
        resumen.append(dict(panaderia=D['P']['nombre'], insumos=len(D['mps']), productos=len(D['P']['productos']),
                            proveedores=len(D['P']['proveedores']), compras=len(D['compras']), lotes=len(D['lotes']),
                            producciones=len(prods), movimientos=len(D['movs']), mermas=len(D['mermas']),
                            conteos=len(D['conteos']), kg_entrada=round(entrada / 1000, 1),
                            kg_merma_lote=round(merma_lote / 1000, 1), kg_merma_prod=round(merma_prod / 1000, 1),
                            merma_pct=round(100 * (merma_lote + merma_prod) / entrada, 2),
                            dias_sin_registro=len(D['sin_registro']),
                            lotes_vencidos_sin_baja=sum(1 for l in D['lotes'].values() if l['disp'] > 0 and l['venc'] and l['venc'] < FIN)))
    partes.append("""
\\echo '--- Resumen de lo cargado (simulación) ---'
SELECT p.nombre,
  (SELECT count(*) FROM public.materia_prima m WHERE m.panaderia_id = p.id) AS insumos,
  (SELECT count(*) FROM public.lote l WHERE l.panaderia_id = p.id AND l.codigo_lote LIKE 'SIM-%') AS lotes,
  (SELECT count(*) FROM public.produccion r WHERE r.panaderia_id = p.id) AS producciones,
  (SELECT count(*) FROM public.desperdicio d WHERE d.panaderia_id = p.id) AS mermas,
  (SELECT count(*) FROM public.conteo_fisico c WHERE c.panaderia_id = p.id) AS conteos
FROM public.panaderia p JOIN _sim_ctx x ON x.pan = p.id ORDER BY p.nombre;

:fin;
""")
    open(SALIDA, 'w', encoding='utf-8', newline='\r\n').write('\n'.join(partes))
    print(json.dumps(resumen, ensure_ascii=False, indent=1))


main()
