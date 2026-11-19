// Validación independiente (HU-33), lado "sistema".
//
// Ejecuta las MISMAS funciones puras que usa la API (ABC, expansión de recetas, elección de precio,
// EOQ y política de reposición) sobre el catálogo piloto y escribe el resultado en JSON.
// El script de Python (validar_abc_eoq.py) recalcula todo por su cuenta y compara.
//
//   npx ts-node --transpile-only validacion/sistema_abc_eoq.ts
//
// No usa base de datos ni red: entra el catálogo de prisma/catalogo_piloto.json.

import * as fs from 'fs';
import * as path from 'path';
import { clasificarAbc, type FilaAbc } from '../src/utils/abc';
import { demandaAnualPorMateria, type FormulacionDemanda, type LineaReceta } from '../src/utils/intermedios';
import { elegirPrecio } from '../src/utils/precios';
import {
  calcularCostoMantener,
  recomendarReposicion,
  resolverDemanda,
  SEMANAS_POR_ANIO,
} from '../src/utils/reposicion';

const RAIZ = path.resolve(__dirname, '..');
const leer = (ruta: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, ruta), 'utf-8'));

const catalogo = leer('prisma/catalogo_piloto.json');
const frecuencias: Record<string, number> = leer('prisma/frecuencia_lotes.json');

const LOTES_POR_DEFECTO = 6; // igual que routes/abc.ts
const CODIGO_AGUA = 'MP-008'; // no se compra ni se guarda: no entra al ABC (H-04)

// ------------------------------------------------------------------ costos
const nombrePorMp = new Map<string, string>();
const costoG = new Map<string, number | null>();
for (const m of catalogo.materias_primas) {
  nombrePorMp.set(m.codigo, m.nombre);
  const elegido = elegirPrecio(
    m.presentaciones.map((p: { gramos: number; precio: number }, i: number) => ({
      id: `${m.codigo}-${i}`,
      contenido: p.gramos,
      activa: true,
      ofertas: [{ id: `${m.codigo}-${i}-o`, precio: p.precio, vigente: true, proveedor_activo: true }],
    })),
  );
  costoG.set(m.codigo, elegido ? elegido.costo_por_unidad_base : null);
}

// ------------------------------------------------------------------ recetas
// Cada producto es su propio id. El intermedio «extra» (masa añadida) no tiene receta en el catálogo.
const recetas = new Map<string, LineaReceta[]>();
const formulaciones: FormulacionDemanda[] = [];
for (const p of catalogo.productos) {
  const lineas: LineaReceta[] = p.ingredientes.map((i: { mp: string; gramos: number }) => ({
    materia_prima_id: i.mp,
    producto_intermedio_id: null,
    cantidad: i.gramos,
  }));
  if (p.extra_intermedio) {
    lineas.push({ materia_prima_id: null, producto_intermedio_id: p.extra_intermedio.nombre, cantidad: p.extra_intermedio.gramos });
  }
  recetas.set(p.nombre, lineas);
  formulaciones.push({
    producto_id: p.nombre,
    es_intermedio: p.es_intermedio,
    lotes_por_semana: frecuencias[p.nombre] ?? LOTES_POR_DEFECTO,
    lineas,
  });
}

// ------------------------------------------------------------------ ABC
const calculo = demandaAnualPorMateria(formulaciones, recetas, SEMANAS_POR_ANIO);

function abcConFiltro(excluirAgua: boolean) {
  const filas: FilaAbc[] = [...calculo.demanda.entries()]
    .filter(([codigo]) => !(excluirAgua && codigo === CODIGO_AGUA))
    .map(([codigo, g]) => {
      const c = costoG.get(codigo) ?? 0;
      return { codigo, nombre: nombrePorMp.get(codigo) ?? codigo, demanda_anual_g: g, costo_por_g: c, valor_anual: g * c };
    });
  return clasificarAbc(filas);
}
const abc = abcConFiltro(true);
const abcConAgua = abcConFiltro(false);

// ------------------------------------------------------------------ caso con productos intermedios
// El catálogo inicial no trae ningún intermedio con receta que otro producto use, así que esa parte
// del cálculo se prueba con un caso pequeño, resuelto también a mano en el script de Python:
//   «Pan A» (6 lotes/sem): 1000 g de MP-001 + 500 g de «Masa X» por lote.
//   «Masa X» (intermedio con receta MP-001 600 g + MP-002 400 g; 2 lotes/sem por su cuenta).
//   «Pan B» (3 lotes/sem): 200 g de «Masa Y», un intermedio que no tiene receta.
const recetasSint = new Map<string, LineaReceta[]>([
  ['Pan A', [{ materia_prima_id: 'MP-001', producto_intermedio_id: null, cantidad: 1000 }, { materia_prima_id: null, producto_intermedio_id: 'Masa X', cantidad: 500 }]],
  ['Masa X', [{ materia_prima_id: 'MP-001', producto_intermedio_id: null, cantidad: 600 }, { materia_prima_id: 'MP-002', producto_intermedio_id: null, cantidad: 400 }]],
  ['Pan B', [{ materia_prima_id: null, producto_intermedio_id: 'Masa Y', cantidad: 200 }]],
]);
const formulacionesSint: FormulacionDemanda[] = [
  { producto_id: 'Pan A', es_intermedio: false, lotes_por_semana: 6, lineas: recetasSint.get('Pan A')! },
  { producto_id: 'Masa X', es_intermedio: true, lotes_por_semana: 2, lineas: recetasSint.get('Masa X')! },
  { producto_id: 'Pan B', es_intermedio: false, lotes_por_semana: 3, lineas: recetasSint.get('Pan B')! },
];
const sint = demandaAnualPorMateria(formulacionesSint, recetasSint, SEMANAS_POR_ANIO);
const casoIntermedios = { demanda: Object.fromEntries(sint.demanda), sin_receta: [...sint.sin_receta] };

// ------------------------------------------------------------------ EOQ y reposición
const COSTO_PEDIDO = 5000; // S declarado por el administrador de La Casa del Pan de Maíz
const TASA_ANUAL = 0.24; // supuesto de diseño
const DIAS_SEGURIDAD = 2; // solo de demostración
const PLAZO_DIAS = 0;
const HOY = '2026-10-30';

interface Escenario {
  id: string;
  descripcion: string;
  dias_entrega: number[];
  vida_util_dias: number | null;
  stock_maximo_dias: number | null; // el máximo se expresa en días de demanda de cada insumo
}
const escenarios: Escenario[] = [
  { id: 'A', descripcion: 'Entrega semanal (miércoles), sin límite de vida útil', dias_entrega: [3], vida_util_dias: null, stock_maximo_dias: null },
  { id: 'B', descripcion: 'Entrega semanal (miércoles), vida útil de 7 días', dias_entrega: [3], vida_util_dias: 7, stock_maximo_dias: null },
  { id: 'C', descripcion: 'Dos entregas por semana (martes y viernes), sin límite', dias_entrega: [2, 5], vida_util_dias: null, stock_maximo_dias: null },
  { id: 'D', descripcion: 'Entrega semanal (miércoles), stock máximo de 10 días de demanda', dias_entrega: [3], vida_util_dias: null, stock_maximo_dias: 10 },
];

const reposicion: Record<string, unknown>[] = [];
for (const esc of escenarios) {
  for (const [codigo, g] of calculo.demanda) {
    if (codigo === CODIGO_AGUA) continue;
    const c = costoG.get(codigo);
    if (c == null) continue;
    const demanda = resolverDemanda({ estimadaSemanal: g / SEMANAS_POR_ANIO });
    if (!demanda) continue;
    const r = recomendarReposicion({
      hoy: HOY,
      existencia: 0,
      demanda,
      costoPedido: COSTO_PEDIDO,
      costoMantener: calcularCostoMantener(TASA_ANUAL, c),
      stockSeguridad: demanda.diaria * DIAS_SEGURIDAD,
      calendario: { diasEntrega: esc.dias_entrega, plazoDias: PLAZO_DIAS },
      vidaUtilDias: esc.vida_util_dias,
      stockMaximo: esc.stock_maximo_dias === null ? null : demanda.diaria * esc.stock_maximo_dias,
      multiploCompra: null,
    });
    reposicion.push({
      escenario: esc.id,
      codigo,
      demanda_anual_g: g,
      costo_por_g: c,
      eoq: r.eoq,
      ciclo_economico_dias: r.ciclo_economico_dias,
      costo_anual_eoq: r.costo_anual_eoq,
      costo_total_anual: r.costo_total_anual,
      ciclos_elegidos: r.ciclos_elegidos,
      cantidad_politica: r.cantidad_politica,
      punto_reorden_clasico: r.punto_reorden_clasico,
      punto_reorden_calendario: r.punto_reorden_calendario,
      nivel_objetivo: r.nivel_objetivo,
      advertencias: r.advertencias,
    });
  }
}

const salida = {
  generado_con: 'funciones del sistema (TypeScript)',
  supuestos: {
    semanas_al_anio: SEMANAS_POR_ANIO,
    lotes_por_semana_por_defecto: LOTES_POR_DEFECTO,
    costo_pedido: COSTO_PEDIDO,
    tasa_anual: TASA_ANUAL,
    dias_seguridad: DIAS_SEGURIDAD,
    plazo_dias: PLAZO_DIAS,
    hoy: HOY,
    excluye: CODIGO_AGUA,
  },
  escenarios,
  intermedios_sin_receta: [...calculo.sin_receta],
  abc: { total: abc.total, resumen: abc.resumen, items: abc.items },
  abc_con_agua: { total: abcConAgua.total, resumen: abcConAgua.resumen },
  demanda_anual_g: Object.fromEntries(calculo.demanda),
  caso_intermedios: casoIntermedios,
  reposicion,
};

const destino = path.join(RAIZ, 'validacion', 'salida_sistema.json');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, JSON.stringify(salida, null, 1), 'utf-8');
console.log(`Escrito ${destino}: ${abc.items.length} insumos en el ABC, ${reposicion.length} filas de reposición.`);
