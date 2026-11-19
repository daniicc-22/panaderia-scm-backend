import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Factory, Layers, Truck } from 'lucide-react';
import { getRecomendaciones } from '../../services/reposicionService';
import { getInventario } from '../../services/inventarioService';
import { resumirMerma, resumirProduccion, useAbcInicio, useMermasInicio, useProduccionesInicio } from './datosInicio';
import type { ClaseAbc } from '../../types/abc.types';
import type { OrigenDemanda } from '../../types/reposicion.types';
import {
  DIAS_LABORABLES_ANIO,
  PERIODOS,
  cantidad,
  esDomingo,
  guardarAbierto,
  infoPeriodo,
  leerAbierto,
  pesos,
  porcentaje,
  rangoPeriodo,
  type Periodo,
} from './periodos';

// Colores ABC del sistema de diseño (iguales a los de la página de clasificación)
const COLOR_CLASE: Record<ClaseAbc, string> = {
  A: 'bg-azul-noche',
  B: 'bg-trigo',
  C: 'bg-clase-c',
};

// ---------------------------------------------------------------------------
// Selector de período

export function SelectorPeriodo({ periodo, onCambiar }: { periodo: Periodo; onCambiar: (p: Periodo) => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-tarjeta border border-linea bg-tabla p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-azul-noche">Ver los valores por</p>
        <p className="text-xs text-gris-texto">
          Año laboral de {DIAS_LABORABLES_ANIO} días (lunes a sábado): mes = 26 días, quincena = 13.
        </p>
      </div>
      <div role="group" aria-label="Período" className="inline-flex overflow-hidden rounded-lg border border-pizarra">
        {PERIODOS.map((p) => {
          const activo = p.id === periodo;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={activo}
              onClick={() => onCambiar(p.id)}
              className={`min-h-11 px-4 text-sm font-semibold transition-colors ${
                activo ? 'bg-trigo text-grafito' : 'bg-white text-pizarra hover:bg-azul-suave'
              }`}
            >
              {p.etiqueta}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Piezas comunes

type ColorBloque = 'pizarra' | 'terracota' | 'verde';
const CABECERA: Record<ColorBloque, string> = {
  pizarra: 'bg-pizarra',
  terracota: 'bg-terracota',
  verde: 'bg-verde-bosque',
};

interface PlegableProps {
  id: string;
  titulo: string;
  descripcion: string;
  icono: ReactNode;
  color: ColorBloque;
  periodo: Periodo;
  // Si el visor nunca lo abrió ni cerró
  abiertoPorDefecto?: boolean;
  children: ReactNode;
}

function Plegable({ id, titulo, descripcion, icono, color, periodo, abiertoPorDefecto = true, children }: PlegableProps) {
  const [abierto, setAbierto] = useState(() => leerAbierto(id, abiertoPorDefecto));
  const panelId = `bloque-inicio-${id}`;
  const cambiar = () => {
    const nuevo = !abierto;
    setAbierto(nuevo);
    guardarAbierto(id, nuevo);
  };

  return (
    <section className="animate-entra overflow-hidden rounded-tarjeta border border-linea bg-tabla" aria-label={titulo}>
      <h2>
        <button
          type="button"
          onClick={cambiar}
          aria-expanded={abierto}
          aria-controls={panelId}
          className={`flex w-full items-center gap-3 px-4 py-3 text-left text-white sm:px-5 ${CABECERA[color]} focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-trigo`}
        >
          <span className="shrink-0" aria-hidden="true">
            {icono}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-semibold">{titulo}</span>
            <span className="block text-xs text-white/80">{descripcion}</span>
          </span>
          <span className="hidden rounded-full bg-white/15 px-3 py-1 text-xs font-semibold sm:inline">
            {infoPeriodo(periodo).etiqueta}
          </span>
          <ChevronDown
            size={20}
            aria-hidden="true"
            className={`shrink-0 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`}
          />
          <span className="sr-only">{abierto ? 'Plegar' : 'Desplegar'}</span>
        </button>
      </h2>
      {abierto && (
        <div id={panelId} className="flex flex-col gap-4 p-4 sm:p-5">
          {children}
        </div>
      )}
    </section>
  );
}

type Origen = 'real' | 'estimado' | 'hoy';
// Fondo casi blanco: se lee igual sobre cualquier color sólido
const CHIP_ORIGEN: Record<Origen, { clase: string; texto: string }> = {
  real: { clase: 'bg-white/90 text-exito-texto', texto: 'Real' },
  estimado: { clase: 'bg-white/90 text-atencion-texto', texto: 'Estimado' },
  hoy: { clase: 'bg-white/90 text-azul-noche', texto: 'Hoy' },
};

// Bloques sólidos de la paleta (nivel de color 2), como las tarjetas del Inicio
type Tono = 'azul' | 'pizarra' | 'verde' | 'terracota' | 'trigo';
const TONO: Record<Tono, { caja: string; etiqueta: string; cifra: string }> = {
  azul: { caja: 'bg-azul-noche', etiqueta: 'text-niebla', cifra: 'text-white' },
  pizarra: { caja: 'bg-pizarra', etiqueta: 'text-niebla', cifra: 'text-white' },
  verde: { caja: 'bg-verde-bosque', etiqueta: 'text-verde-suave', cifra: 'text-white' },
  terracota: { caja: 'bg-terracota', etiqueta: 'text-terracota-suave', cifra: 'text-white' },
  trigo: { caja: 'bg-trigo', etiqueta: 'text-[#4a3509]', cifra: 'text-grafito' },
};
// Tarjetas por clase (la C usa pizarra: su color propio es muy claro para un bloque sólido)
const TONO_CLASE: Record<ClaseAbc, Tono> = { A: 'azul', B: 'trigo', C: 'pizarra' };

function ChipOrigen({ origen }: { origen: Origen }) {
  const c = CHIP_ORIGEN[origen];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.clase}`}>{c.texto}</span>;
}

interface CifraProps {
  etiqueta: string;
  valor: string;
  detalle?: string;
  origen: Origen;
  tono: Tono;
}

function Cifra({ etiqueta, valor, detalle, origen, tono }: CifraProps) {
  const t = TONO[tono];
  return (
    <div
      className={`flex animate-entra flex-col gap-1 rounded-tarjeta p-4 transition-[transform,box-shadow] duration-200 hover:-translate-y-[2px] hover:shadow-elevada ${t.caja}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs font-medium sm:text-sm ${t.etiqueta}`}>{etiqueta}</p>
        <ChipOrigen origen={origen} />
      </div>
      <p className={`cifras font-display text-2xl font-semibold ${t.cifra}`}>{valor}</p>
      {detalle && <p className={`text-xs ${t.etiqueta}`}>{detalle}</p>}
    </div>
  );
}

function Cargando() {
  return <p className="text-sm text-gris-texto">Cargando…</p>;
}

function ErrorCarga({ que, onReintentar }: { que: string; onReintentar: () => void }) {
  return (
    <div className="rounded-tarjeta border border-[#f0c3c0] bg-critico-fondo px-4 py-3 text-sm text-critico-texto">
      No se pudo cargar {que}.{' '}
      <button type="button" className="font-medium underline" onClick={onReintentar}>
        Reintentar
      </button>
    </div>
  );
}

function Nota({ children }: { children: ReactNode }) {
  return <p className="text-xs text-gris-texto">{children}</p>;
}

// ---------------------------------------------------------------------------
// Bloque SCM: flujo de materiales (inventario, producción y mermas)

export function BloqueScm({ periodo }: { periodo: Periodo }) {
  const info = infoPeriodo(periodo);
  const inventario = useQuery({ queryKey: ['inicio', 'inventario'], queryFn: getInventario });
  const producciones = useProduccionesInicio();
  const mermas = useMermasInicio();
  const abc = useAbcInicio();
  const r = rangoPeriodo(periodo);

  const valorInventario = inventario.data?.items.reduce((s, i) => s + (i.valor ?? 0), 0) ?? 0;
  const conExistencias = inventario.data?.items.filter((i) => i.stock > 0).length ?? 0;
  const prod = resumirProduccion(producciones.data ?? [], r);
  const merma = resumirMerma(mermas.data ?? [], abc.data, r);
  const causas = merma.porCausa.slice(0, 3);
  const maxCausa = causas[0]?.costo || 1;

  return (
    <Plegable
      id="scm"
      titulo="Cadena de suministro (SCM)"
      descripcion="Lo que entra, se transforma y se pierde"
      icono={<Factory size={22} />}
      color="pizarra"
      periodo={periodo}
    >
      {periodo === 'dia' && esDomingo() && (
        <Nota>Hoy es domingo: la panadería descansa, así que es normal que no haya producción ni mermas.</Nota>
      )}

      {inventario.isError ? (
        <ErrorCarga que="el inventario" onReintentar={() => inventario.refetch()} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Cifra
            tono="azul"
            etiqueta="Valor del inventario"
            valor={inventario.data ? pesos.format(valorInventario) : '—'}
            detalle="Lo que hay hoy en bodega, a costo de compra"
            origen="hoy"
          />
          <Cifra
            tono="pizarra"
            etiqueta="Insumos con existencias"
            valor={inventario.data ? `${conExistencias} de ${inventario.data.items.length}` : '—'}
            detalle="Materias primas que se controlan en bodega"
            origen="hoy"
          />
          <Cifra
            tono="trigo"
            etiqueta={`Consumo estimado ${info.corto}`}
            valor={merma.consumoKg != null ? `${cantidad(merma.consumoKg)} kg` : '—'}
            detalle="Materia prima que se transforma, según la demanda del ABC"
            origen="estimado"
          />
        </div>
      )}

      {producciones.isError || mermas.isError ? (
        <ErrorCarga
          que="la producción o las mermas"
          onReintentar={() => {
            producciones.refetch();
            mermas.refetch();
          }}
        />
      ) : producciones.isPending || mermas.isPending ? (
        <Cargando />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Cifra
            tono="verde"
            etiqueta="Producciones finalizadas"
            valor={String(prod.finalizadas)}
            detalle={prod.rendimiento != null ? `Rendimiento medio ${porcentaje(prod.rendimiento)}` : `Registradas ${info.ventana}`}
            origen="real"
          />
          <Cifra tono="azul" etiqueta="Unidades producidas" valor={cantidad(prod.unidades)} detalle={`Registradas ${info.ventana}`} origen="real" />
          <Cifra
            tono="terracota"
            etiqueta="Merma registrada"
            valor={`${cantidad(merma.kg)} kg`}
            detalle={`${merma.registros} registros ${info.ventana}${merma.pct != null ? ` · ${porcentaje(merma.pct)} de lo consumido` : ''}`}
            origen="real"
          />
          <Cifra tono="pizarra" etiqueta="Costo de las mermas" valor={pesos.format(merma.costo)} detalle="Valor estimado de lo perdido" origen="real" />
        </div>
      )}

      {causas.length > 0 && (
        <div className="rounded-tarjeta border border-linea bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-azul-noche">Por qué se pierde materia prima ({info.ventana})</h3>
          <ul className="flex flex-col gap-2">
            {causas.map((c) => (
              <li key={c.causa} className="grid grid-cols-[8rem_1fr] items-center gap-3 text-sm sm:grid-cols-[12rem_1fr_6rem_7rem]">
                <span className="truncate text-grafito">{c.causa}</span>
                <div className="h-3 rounded-xs bg-arena">
                  <div className="h-3 rounded-r-[4px] bg-terracota" style={{ width: `${(c.costo / maxCausa) * 100}%` }} />
                </div>
                <span className="cifras hidden text-right text-gris-texto sm:block">{c.veces} veces</span>
                <span className="cifras hidden text-right font-semibold text-grafito sm:block">{pesos.format(c.costo)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Nota>
        «Real» suma lo registrado {info.ventana}; «Hoy» no depende del período.{' '}
        <Link to="/produccion" className="font-semibold text-pizarra hover:underline">
          Ver producción
        </Link>{' '}
        ·{' '}
        <Link to="/mermas" className="font-semibold text-pizarra hover:underline">
          Ver mermas
        </Link>
      </Nota>
    </Plegable>
  );
}

// ---------------------------------------------------------------------------
// Bloque ABC: dónde está el dinero del consumo

export function BloqueAbc({ periodo }: { periodo: Periodo }) {
  const info = infoPeriodo(periodo);
  // Misma clave que el resto del Inicio: comparten la caché
  const abc = useAbcInicio();
  const d = info.divisor;

  const origenTexto = abc.data
    ? abc.data.fuente === 'real'
      ? 'Con el consumo real registrado'
      : `Estimado con ${abc.data.supuestos.lotes_por_semana_por_defecto} lotes por semana por producto`
    : '';
  const top = abc.data?.items.slice(0, 5) ?? [];
  const maximo = top[0]?.valor_anual || 1;

  return (
    <Plegable
      id="abc"
      titulo="Clasificación ABC"
      descripcion="Qué insumos concentran el valor del consumo"
      icono={<Layers size={22} />}
      color="terracota"
      periodo={periodo}
      abiertoPorDefecto={false}
    >
      {abc.isError ? (
        <ErrorCarga que="la clasificación ABC" onReintentar={() => abc.refetch()} />
      ) : !abc.data ? (
        <Cargando />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Cifra
              tono="terracota"
              etiqueta={`Consumo valorado ${info.corto}`}
              valor={pesos.format(abc.data.total_valor_anual / d)}
              detalle={origenTexto}
              origen="estimado"
            />
            {abc.data.resumen.map((r) => (
              <Cifra
                key={r.clase}
                tono={TONO_CLASE[r.clase]}
                etiqueta={`Clase ${r.clase} · ${r.insumos} insumos`}
                valor={pesos.format(r.valor_anual / d)}
                detalle={`${porcentaje(r.porcentaje)} del valor`}
                origen="estimado"
              />
            ))}
          </div>

          <div
            className="flex h-6 gap-0.5 overflow-hidden rounded-md"
            role="img"
            aria-label="Distribución del valor por clase ABC"
          >
            {abc.data.resumen.map((r) => (
              <div
                key={r.clase}
                className={COLOR_CLASE[r.clase]}
                style={{ width: `${r.porcentaje}%` }}
                title={`Clase ${r.clase}: ${porcentaje(r.porcentaje)}`}
              />
            ))}
          </div>

          <div className="rounded-tarjeta border border-linea bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-azul-noche">Los 5 insumos que más pesan ({info.corto})</h3>
              <Link to="/clasificacion-abc" className="text-sm font-semibold text-pizarra hover:underline">
                Ver tabla completa →
              </Link>
            </div>
            <ul className="flex flex-col gap-2">
              {top.map((i) => (
                <li
                  key={i.codigo}
                  className="grid grid-cols-[1.5rem_7rem_1fr] items-center gap-3 text-sm sm:grid-cols-[1.5rem_11rem_1fr_7rem_8rem]"
                >
                  <span className={`grid h-6 w-6 place-items-center rounded-xs text-xs font-bold ${COLOR_CLASE[i.clase]} ${i.clase === 'A' ? 'text-white' : 'text-grafito'}`}>
                    {i.clase}
                  </span>
                  <span className="truncate text-grafito">{i.nombre}</span>
                  <div className="h-3 rounded-xs bg-arena">
                    <div className={`h-3 rounded-r-[4px] ${COLOR_CLASE[i.clase]}`} style={{ width: `${(i.valor_anual / maximo) * 100}%` }} />
                  </div>
                  <span className="cifras hidden text-right text-gris-texto sm:block">{cantidad(i.demanda_anual_kg / d)} kg</span>
                  <span className="cifras hidden text-right font-semibold text-grafito sm:block">{pesos.format(i.valor_anual / d)}</span>
                </li>
              ))}
            </ul>
          </div>

          <Nota>
            El valor anual del modelo ABC se divide entre {d === 1 ? '1 (año completo)' : d} para mostrarlo {info.corto}.
            {abc.data.insumos_sin_costo.length > 0 &&
              ` ${abc.data.insumos_sin_costo.length} insumos no tienen precio y quedan en clase C con valor 0.`}
          </Nota>
        </>
      )}
    </Plegable>
  );
}

// ---------------------------------------------------------------------------
// Bloque EOQ: cuánto y cada cuánto pedir

const TEXTO_ORIGEN: Record<OrigenDemanda, string> = {
  real: 'Real',
  declarada: 'Declarada',
  estimada: 'Estimada',
};
const ORDEN_CLASE: Record<string, number> = { A: 0, B: 1, C: 2 };

export function BloqueEoq({ periodo }: { periodo: Periodo }) {
  const info = infoPeriodo(periodo);
  const d = info.divisor;
  // Misma clave que «Requiere atención»: comparten la caché
  const rec = useQuery({ queryKey: ['reposicion', 'recomendaciones'], queryFn: getRecomendaciones });

  // Por insumo: N = D/Q pedidos al año; costo de pedir = N·S; costo de mantener = Q/2·H
  const filas = (rec.data?.items ?? [])
    .flatMap((i) => {
      const m = i.modelo;
      const q = i.eoq;
      if (!m || !q || q <= 0 || m.demanda_anual <= 0) return [];
      const n = m.demanda_anual / q;
      return [{
        id: i.materia_prima_id,
        nombre: i.nombre,
        unidad: i.unidad,
        clase: i.clase_abc,
        origen: i.demanda_origen,
        q,
        n,
        demanda: m.demanda_anual,
        pedir: n * m.costo_pedido,
        mantener: (q / 2) * m.costo_mantener,
        total: m.costo_anual_eoq,
      }];
    })
    .sort((a, b) => (ORDEN_CLASE[a.clase ?? 'C'] ?? 3) - (ORDEN_CLASE[b.clase ?? 'C'] ?? 3) || b.total - a.total);

  const pedidosAnio = filas.reduce((s, f) => s + f.n, 0);
  const costoPedir = filas.reduce((s, f) => s + f.pedir, 0);
  const costoMantener = filas.reduce((s, f) => s + f.mantener, 0);
  const sinDatos = rec.data?.resumen.datos_insuficientes ?? 0;

  return (
    <Plegable
      id="eoq"
      titulo="Modelo EOQ"
      descripcion="Cuánto pedir y cada cuánto, al menor costo"
      icono={<Truck size={22} />}
      color="verde"
      periodo={periodo}
      abiertoPorDefecto={false}
    >
      {rec.isError ? (
        <ErrorCarga que="las recomendaciones de compra" onReintentar={() => rec.refetch()} />
      ) : !rec.data ? (
        <Cargando />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Cifra
              tono="verde"
              etiqueta={`Pedidos ${info.corto}`}
              valor={cantidad(pedidosAnio / d)}
              detalle={`${filas.length} insumos con EOQ calculado${sinDatos ? ` · ${sinDatos} sin datos suficientes` : ''}`}
              origen="estimado"
            />
            <Cifra tono="azul" etiqueta={`Costo de pedir ${info.corto}`} valor={pesos.format(costoPedir / d)} detalle="Pedidos × costo de cada pedido" origen="estimado" />
            <Cifra tono="trigo" etiqueta={`Costo de mantener ${info.corto}`} valor={pesos.format(costoMantener / d)} detalle="Stock medio × costo de guardarlo" origen="estimado" />
            <Cifra
              tono="terracota"
              etiqueta={`Costo total de inventario ${info.corto}`}
              valor={pesos.format((costoPedir + costoMantener) / d)}
              detalle="Pedir + mantener, pidiendo el EOQ"
              origen="estimado"
            />
          </div>

          {filas.length > 0 && (
            <div className="overflow-x-auto rounded-tarjeta border border-linea bg-white">
              <table className="w-full min-w-[44rem] text-sm">
                <caption className="sr-only">Modelo EOQ por insumo, {info.corto}</caption>
                <thead className="bg-verde-bosque text-left text-white">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">Insumo</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Demanda {info.corto}</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Cantidad por pedido (EOQ)</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Pedidos {info.corto}</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Frecuencia</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Costo {info.corto}</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.slice(0, 8).map((f, i) => (
                    <tr key={f.id} className={i % 2 ? 'bg-verde-suave/40' : ''}>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          {f.clase && (
                            <span className={`grid h-5 w-5 place-items-center rounded-xs text-[11px] font-bold ${COLOR_CLASE[f.clase]} ${f.clase === 'A' ? 'text-white' : 'text-grafito'}`}>
                              {f.clase}
                            </span>
                          )}
                          <span className="text-grafito">{f.nombre}</span>
                          {f.origen && <span className="text-[11px] text-gris-texto">· {TEXTO_ORIGEN[f.origen]}</span>}
                        </span>
                      </td>
                      <td className="cifras px-3 py-2 text-right">{cantidad(f.demanda / d)} {f.unidad}</td>
                      <td className="cifras px-3 py-2 text-right">{cantidad(f.q)} {f.unidad}</td>
                      <td className="cifras px-3 py-2 text-right">{cantidad(f.n / d)}</td>
                      <td className="cifras px-3 py-2 text-right">cada {cantidad(DIAS_LABORABLES_ANIO / f.n)} días</td>
                      <td className="cifras px-3 py-2 text-right font-semibold">{pesos.format(f.total / d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Nota>
            Los costos anuales del EOQ se dividen entre {d === 1 ? '1 (año completo)' : d}; la frecuencia usa {DIAS_LABORABLES_ANIO} días
            laborables al año. La cantidad por pedido no cambia con el período.{' '}
            <Link to="/reposicion/eoq" className="font-semibold text-pizarra hover:underline">
              Ver análisis EOQ
            </Link>
          </Nota>
        </>
      )}
    </Plegable>
  );
}
