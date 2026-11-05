import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  Boxes,
  CircleCheck,
  CookingPot,
  Flame,
  House,
  PackageOpen,
  Store,
  Trash2,
  Truck,
  Wheat,
} from 'lucide-react';
import { formatoCantidad, formatoFecha } from '../inventario/formatos';
import { getInventario, getLotesMateria } from '../../services/inventarioService';
import { getCausasMerma, getMermas, registrarMerma } from '../../services/mermasService';
import { getProducciones } from '../../services/produccionService';
import { mensajeDeError } from '../../services/errores';
import type { EtapaMerma } from '../../types/merma.types';
import { MERMA_MAX } from '../mermas/etiquetas';
import { aNumero, fechaHora } from './numeros';
import { BandaSeccion, BuscadorGrande, CargandoGrande, EncabezadoPaso, MensajeGrande, OpcionGrande } from './ui';

type Tipo = 'insumo' | 'produccion';
type Paso = 'tipo' | 'insumo' | 'lote' | 'etapa' | 'prod_opcional' | 'produccion' | 'causa' | 'cantidad' | 'confirmar';

const ETAPAS_OPERARIO: { valor: EtapaMerma; titulo: string; detalle: string; icono: typeof Truck }[] = [
  { valor: 'recepcion', titulo: 'Al recibirlo', detalle: 'Llegó dañado o vencido del proveedor', icono: Truck },
  { valor: 'almacenamiento', titulo: 'En la bodega', detalle: 'Se venció, se cayó o se dañó guardado', icono: Store },
  { valor: 'produccion', titulo: 'Mientras producía', detalle: 'Se derramó o se dañó en la mesa', icono: CookingPot },
];

// Registrar una merma en pasos: una pregunta por pantalla, respuestas en botones grandes.
// Usa el mismo servicio y las mismas reglas que la pantalla del administrador.
export function MermaOperario() {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [historial, setHistorial] = useState<Paso[]>(['tipo']);
  const [materiaId, setMateriaId] = useState('');
  const [loteId, setLoteId] = useState('');
  const [etapa, setEtapa] = useState<EtapaMerma | null>(null);
  const [produccionId, setProduccionId] = useState('');
  const [causaId, setCausaId] = useState('');
  const [cantidadTexto, setCantidadTexto] = useState('');
  const [enKilos, setEnKilos] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [listo, setListo] = useState<string | null>(null);

  const paso = historial[historial.length - 1];
  const ir = (p: Paso) => setHistorial((h) => [...h, p]);
  const atras = () => setHistorial((h) => (h.length > 1 ? h.slice(0, -1) : h));

  const causas = useQuery({ queryKey: ['mermas', 'causas'], queryFn: getCausasMerma });
  const recientes = useQuery({ queryKey: ['mermas', 'lista'], queryFn: () => getMermas() });
  const inventario = useQuery({ queryKey: ['inventario', 'resumen'], queryFn: getInventario, enabled: tipo === 'insumo' });
  const lotes = useQuery({ queryKey: ['inventario', 'lotes', materiaId], queryFn: () => getLotesMateria(materiaId), enabled: materiaId !== '' });
  const producciones = useQuery({
    queryKey: ['produccion', 'lista'],
    queryFn: () => getProducciones(),
    enabled: tipo === 'produccion' || etapa === 'produccion',
  });

  const insumos = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (inventario.data?.items ?? [])
      .filter((i) => i.stock > 0)
      .filter((i) => !texto || i.nombre.toLowerCase().includes(texto))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [inventario.data, busqueda]);
  const lotesConStock = (lotes.data?.lotes ?? []).filter((l) => l.cantidad_disponible > 0);
  const lote = lotesConStock.find((l) => l.id === loteId);
  const unidadInsumo = lotes.data?.materia.unidad ?? 'g';
  const produccionesValidas = (producciones.data ?? []).filter((p) => p.estado === 'en_curso' || p.estado === 'finalizada');
  const produccion = produccionesValidas.find((p) => p.id === produccionId);
  const causa = causas.data?.find((c) => c.id === causaId);
  const insumo = inventario.data?.items.find((i) => i.materia_prima_id === materiaId);

  // Los gramos se pueden escribir en kilos; la merma de una producción siempre va en gramos de masa
  const enGramos = tipo === 'produccion' || unidadInsumo === 'g';
  const unidadFinal = tipo === 'produccion' ? 'g' : unidadInsumo;
  const cantidad = aNumero(cantidadTexto) * (enGramos && enKilos ? 1000 : 1);
  const cantidadValida = Number.isFinite(cantidad) && cantidad > 0 && cantidad <= MERMA_MAX;
  const pasaDelLote = tipo === 'insumo' && lote !== undefined && cantidad > lote.cantidad_disponible;

  const total = tipo === 'produccion' ? 5 : etapa === 'produccion' ? 8 : 7;
  const numeroPaso = historial.length;

  const registrar = useMutation({
    mutationFn: () =>
      registrarMerma({
        causa_id: causaId,
        etapa: tipo === 'produccion' ? 'produccion' : (etapa as EtapaMerma),
        cantidad: Math.round(cantidad * 1000) / 1000,
        ...(tipo === 'insumo'
          ? { lote_id: loteId, ...(etapa === 'produccion' && produccionId ? { produccion_id: produccionId } : {}) }
          : { produccion_id: produccionId }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventario'] }),
        queryClient.invalidateQueries({ queryKey: ['mermas'] }),
        queryClient.invalidateQueries({ queryKey: ['produccion'] }),
      ]);
      setListo(`${formatoCantidad(cantidad, unidadFinal)} de ${tipo === 'insumo' ? insumo?.nombre ?? 'insumo' : produccion?.producto ?? 'masa'}`);
    },
  });

  function empezarDeNuevo() {
    setTipo(null);
    setHistorial(['tipo']);
    setMateriaId('');
    setLoteId('');
    setEtapa(null);
    setProduccionId('');
    setCausaId('');
    setCantidadTexto('');
    setEnKilos(false);
    setBusqueda('');
    setListo(null);
    registrar.reset();
  }

  const contenido = (() => {
    if (listo) {
      return (
        <div className="flex flex-col items-center gap-5 rounded-2xl bg-exito-fondo px-6 py-10 text-center">
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
            <CircleCheck size={88} className="text-verde-bosque" aria-hidden="true" />
          </motion.span>
          <div>
            <p className="font-display text-[32px] leading-tight font-semibold text-exito-texto">¡Merma registrada!</p>
            <p className="mt-2 text-xl text-grafito">{listo}</p>
          </div>
          <div className="grid w-full gap-3 sm:grid-cols-2">
            <button type="button" onClick={empezarDeNuevo} className="min-h-16 rounded-xl bg-critico-texto px-6 text-xl font-semibold text-white active:scale-[0.98]">
              Registrar otra
            </button>
            <Link to="/inicio" className="inline-flex min-h-16 items-center justify-center gap-2 rounded-xl border-2 border-azul-noche bg-[#fff] px-6 text-xl font-semibold text-azul-noche">
              <House size={24} aria-hidden="true" />
              Ir al inicio
            </Link>
          </div>
        </div>
      );
    }

    switch (paso) {
      case 'tipo':
        return (
          <>
            <EncabezadoPaso seccion="merma" paso={1} total={tipo === 'produccion' ? 5 : 7} pregunta="¿Qué se perdió?" />
            <OpcionGrande
              seccion="merma"
              icono={Wheat}
              titulo="Un insumo"
              detalle="Harina, leche, huevos… se venció, se cayó o se derramó"
              seleccionada={tipo === 'insumo'}
              onElegir={() => {
                setTipo('insumo');
                ir('insumo');
              }}
            />
            <OpcionGrande
              seccion="merma"
              icono={Flame}
              titulo="Masa o pan de una producción"
              detalle="Se quemó, se pasó la masa o se dañó al hornear"
              seleccionada={tipo === 'produccion'}
              onElegir={() => {
                setTipo('produccion');
                setEtapa('produccion');
                ir('produccion');
              }}
            />

            {(recientes.data ?? []).length > 0 && (
              <div className="mt-4 rounded-2xl border-2 border-[#f0c3c0] bg-critico-fondo/60 p-4">
                <p className="mb-3 text-lg font-semibold text-critico-texto">Lo último que se registró</p>
                <ul className="flex flex-col gap-2">
                  {(recientes.data ?? []).slice(0, 4).map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-l-8 border-l-critico-texto bg-[#fff] px-4 py-3">
                      <span className="min-w-0">
                        <span className="block text-lg font-semibold text-grafito">{m.insumo ?? m.producto ?? 'Merma'}</span>
                        <span className="block text-base text-gris-texto">
                          {m.causa} · {fechaHora(m.fecha)}
                        </span>
                      </span>
                      <span className="font-display text-xl font-semibold text-critico-texto cifras">{formatoCantidad(m.cantidad, m.unidad)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        );

      case 'insumo':
        return (
          <>
            <EncabezadoPaso seccion="merma" paso={numeroPaso} total={total} pregunta="¿Cuál insumo?" onAtras={atras} />
            <BuscadorGrande seccion="merma" valor={busqueda} onCambio={setBusqueda} placeholder="Buscar el insumo" />
            {inventario.isLoading && <CargandoGrande />}
            {inventario.isError && <MensajeGrande tono="rojo">No se pudo cargar la bodega. Vuelve a intentarlo.</MensajeGrande>}
            {inventario.isSuccess && insumos.length === 0 && <MensajeGrande>No hay insumos con existencias con ese nombre.</MensajeGrande>}
            <div className="grid gap-3 sm:grid-cols-2">
              {insumos.map((i) => (
                <OpcionGrande
                  key={i.materia_prima_id}
                  seccion="merma"
                  titulo={i.nombre}
                  detalle={`Hay ${formatoCantidad(i.stock, i.unidad)}`}
                  seleccionada={materiaId === i.materia_prima_id}
                  onElegir={() => {
                    setMateriaId(i.materia_prima_id);
                    setLoteId('');
                    ir('lote');
                  }}
                />
              ))}
            </div>
          </>
        );

      case 'lote':
        return (
          <>
            <EncabezadoPaso seccion="merma" paso={numeroPaso} total={total} pregunta={`¿De cuál lote de ${insumo?.nombre ?? 'este insumo'}?`} onAtras={atras} />
            {lotes.isLoading && <CargandoGrande />}
            {lotes.isError && <MensajeGrande tono="rojo">No se pudieron cargar los lotes.</MensajeGrande>}
            {lotesConStock.map((l) => (
              <OpcionGrande
                key={l.id}
                seccion="merma"
                icono={Boxes}
                titulo={`Lote ${l.codigo_lote ?? 'sin código'}`}
                detalle={`Tiene ${formatoCantidad(l.cantidad_disponible, unidadInsumo)}${l.fecha_vencimiento ? ` · vence ${formatoFecha(l.fecha_vencimiento)}` : ''}`}
                seleccionada={loteId === l.id}
                onElegir={() => {
                  setLoteId(l.id);
                  ir('etapa');
                }}
              />
            ))}
          </>
        );

      case 'etapa':
        return (
          <>
            <EncabezadoPaso seccion="merma" paso={numeroPaso} total={total} pregunta="¿Dónde se perdió?" onAtras={atras} />
            {ETAPAS_OPERARIO.map((e) => (
              <OpcionGrande
                key={e.valor}
                seccion="merma"
                icono={e.icono}
                titulo={e.titulo}
                detalle={e.detalle}
                seleccionada={etapa === e.valor}
                onElegir={() => {
                  setEtapa(e.valor);
                  setProduccionId('');
                  ir(e.valor === 'produccion' ? 'prod_opcional' : 'causa');
                }}
              />
            ))}
          </>
        );

      case 'prod_opcional':
      case 'produccion': {
        const opcional = paso === 'prod_opcional';
        return (
          <>
            <EncabezadoPaso seccion="merma" paso={numeroPaso} total={total} pregunta="¿De cuál producción?" onAtras={atras} />
            {producciones.isLoading && <CargandoGrande />}
            {producciones.isSuccess && produccionesValidas.length === 0 && !opcional && (
              <MensajeGrande>No hay producciones en curso ni terminadas para registrar.</MensajeGrande>
            )}
            {opcional && (
              <OpcionGrande
                seccion="merma"
                icono={PackageOpen}
                titulo="No sé / ninguna"
                detalle="Registrar la merma sin unirla a una producción"
                onElegir={() => {
                  setProduccionId('');
                  ir('causa');
                }}
              />
            )}
            {produccionesValidas.slice(0, 12).map((p) => (
              <OpcionGrande
                key={p.id}
                seccion="merma"
                icono={CookingPot}
                titulo={p.producto}
                detalle={`${fechaHora(p.fecha)} · ${p.lotes ?? '?'} ${p.lotes === 1 ? 'lote' : 'lotes'} · ${p.usuario} · ${p.estado === 'en_curso' ? 'en el horno' : 'terminada'}`}
                seleccionada={produccionId === p.id}
                onElegir={() => {
                  setProduccionId(p.id);
                  ir('causa');
                }}
              />
            ))}
          </>
        );
      }

      case 'causa':
        return (
          <>
            <EncabezadoPaso seccion="merma" paso={numeroPaso} total={total} pregunta="¿Por qué se perdió?" onAtras={atras} />
            {causas.isLoading && <CargandoGrande />}
            {causas.isError && <MensajeGrande tono="rojo">No se pudieron cargar las causas.</MensajeGrande>}
            <div className="grid gap-3 sm:grid-cols-2">
              {(causas.data ?? []).map((c) => (
                <OpcionGrande
                  key={c.id}
                  seccion="merma"
                  titulo={c.nombre}
                  detalle={c.descripcion ?? undefined}
                  seleccionada={causaId === c.id}
                  onElegir={() => {
                    setCausaId(c.id);
                    ir('cantidad');
                  }}
                />
              ))}
            </div>
          </>
        );

      case 'cantidad':
        return (
          <>
            <EncabezadoPaso seccion="merma" paso={numeroPaso} total={total} pregunta="¿Cuánto se perdió?" onAtras={atras} />
            <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-[#f0c3c0] bg-critico-fondo/60 px-5 py-6">
              <label htmlFor="op-merma-cantidad" className="sr-only">
                Cantidad perdida
              </label>
              <div className="flex w-full max-w-md items-center gap-3">
                <input
                  id="op-merma-cantidad"
                  inputMode="decimal"
                  autoComplete="off"
                  autoFocus
                  value={cantidadTexto}
                  onChange={(e) => setCantidadTexto(e.target.value)}
                  placeholder="0"
                  className="min-h-20 min-w-0 flex-1 rounded-xl border-2 border-critico-texto/40 bg-[#fff] px-4 text-center font-display text-[44px] font-semibold text-azul-noche cifras focus:border-critico-texto focus:outline-hidden"
                />
                {!enGramos && <span className="text-2xl font-semibold text-grafito">{unidadInsumo}</span>}
              </div>
              {enGramos && (
                <div className="grid w-full max-w-md grid-cols-2 gap-3" role="radiogroup" aria-label="Unidad">
                  {[
                    { kilos: false, texto: 'Gramos' },
                    { kilos: true, texto: 'Kilos' },
                  ].map((u) => (
                    <button
                      key={u.texto}
                      type="button"
                      role="radio"
                      aria-checked={enKilos === u.kilos}
                      onClick={() => setEnKilos(u.kilos)}
                      className={`min-h-14 rounded-xl border-2 text-xl font-semibold ${
                        enKilos === u.kilos ? 'border-critico-texto bg-critico-texto text-white' : 'border-borde-campo bg-[#fff] text-grafito'
                      }`}
                    >
                      {u.texto}
                    </button>
                  ))}
                </div>
              )}
              {lote && <p className="text-lg text-grafito">El lote tiene {formatoCantidad(lote.cantidad_disponible, unidadInsumo)}.</p>}
              {cantidadTexto.trim() !== '' && !cantidadValida && <p className="text-lg font-semibold text-critico-texto">Escribe una cantidad mayor que 0.</p>}
              {pasaDelLote && <p className="text-lg font-semibold text-critico-texto">Es más de lo que tiene el lote.</p>}
            </div>
            <button
              type="button"
              disabled={!cantidadValida || pasaDelLote}
              onClick={() => ir('confirmar')}
              className="min-h-16 rounded-xl bg-critico-texto px-6 text-xl font-semibold text-white shadow-elevada disabled:opacity-40 active:scale-[0.98]"
            >
              Siguiente
            </button>
          </>
        );

      case 'confirmar': {
        const filas: [string, string][] = [
          ['Qué se perdió', tipo === 'insumo' ? insumo?.nombre ?? '' : produccion?.producto ?? ''],
          ...(tipo === 'insumo' && lote ? ([['Lote', lote.codigo_lote ?? 'Sin código']] as [string, string][]) : []),
          ...(tipo === 'insumo' && etapa ? ([['Dónde', ETAPAS_OPERARIO.find((e) => e.valor === etapa)?.titulo ?? '']] as [string, string][]) : []),
          ...(tipo === 'insumo' && produccion ? ([['Producción', produccion.producto]] as [string, string][]) : []),
          ['Por qué', causa?.nombre ?? ''],
          ['Cuánto', formatoCantidad(cantidad, unidadFinal)],
        ];
        return (
          <>
            <EncabezadoPaso seccion="merma" paso={numeroPaso} total={total} pregunta="¿Está bien así?" onAtras={atras} />
            <dl className="overflow-hidden rounded-2xl border-2 border-[#f0c3c0] bg-[#fff]">
              {filas.map(([k, v], n) => (
                <div key={k} className={`flex flex-wrap items-center justify-between gap-2 px-5 py-4 ${n % 2 ? 'bg-critico-fondo/40' : ''}`}>
                  <dt className="text-lg text-gris-texto">{k}</dt>
                  <dd className={`text-right font-semibold text-grafito ${k === 'Cuánto' ? 'font-display text-3xl text-critico-texto' : 'text-xl'}`}>{v}</dd>
                </div>
              ))}
            </dl>
            {registrar.isError && <MensajeGrande tono="rojo">{mensajeDeError(registrar.error, 'No se pudo registrar la merma.')}</MensajeGrande>}
            <button
              type="button"
              disabled={registrar.isPending}
              onClick={() => registrar.mutate()}
              className="inline-flex min-h-18 items-center justify-center gap-3 rounded-xl bg-critico-texto px-6 text-2xl font-semibold text-white shadow-elevada disabled:opacity-60 active:scale-[0.98]"
            >
              <Trash2 size={28} aria-hidden="true" />
              {registrar.isPending ? 'Registrando…' : 'Registrar merma'}
            </button>
          </>
        );
      }
    }
  })();

  return (
    <div className="flex flex-col pb-10">
      <BandaSeccion seccion="merma" icono={Trash2} titulo="Registrar merma" ayuda="Lo que se pierde y por qué." />
      <div className="mx-auto mt-4 w-full max-w-3xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={listo ? 'listo' : paso}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22 }}
            className="flex flex-col gap-4"
          >
            {contenido}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
