import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChefHat, ChevronRight, CircleCheck, CookingPot, Flag, House, OctagonAlert, Scale, Timer } from 'lucide-react';
import { formatoCantidad } from '../inventario/formatos';
import { leerPesos, leerProducida, textoDesviacion, type PesosTexto } from '../produccion/pesos';
import { getFormulaciones } from '../../services/formulacionesService';
import { finalizarProduccion, getProducciones, registrarProduccion, simularProduccion } from '../../services/produccionService';
import { getQueProducir } from '../../services/reposicionService';
import { mensajeDeError } from '../../services/errores';
import type { PlanConsumo } from '../../types/inventario.types';
import type { ProduccionResumen } from '../../types/produccion.types';
import { hora } from './numeros';
import { BandaSeccion, BuscadorGrande, CargandoGrande, Contador, EncabezadoPaso, MensajeGrande, OpcionGrande } from './ui';

type Paso = 'menu' | 'producto' | 'lotes' | 'pesos' | 'confirmar' | 'listo' | 'terminar' | 'terminada';

const BOTON_PRINCIPAL =
  'inline-flex min-h-18 items-center justify-center gap-3 rounded-xl bg-[#a85c3e] px-6 text-2xl font-semibold text-white shadow-elevada disabled:opacity-40 active:scale-[0.98]';

// Producir en pasos: elegir receta → cuántos lotes → revisar (y pesar, si se quiere) → confirmar.
// Desde la misma pantalla se terminan las tandas que están en el horno. Mismas reglas y servicios que el administrador.
export function ProducirOperario() {
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const recetaInicial = params.get('receta') ?? '';
  const [historial, setHistorial] = useState<Paso[]>(recetaInicial ? ['menu', 'lotes'] : ['menu']);
  const [formulacionId, setFormulacionId] = useState(recetaInicial);
  const [lotes, setLotes] = useState(1);
  const [busqueda, setBusqueda] = useState('');
  const [plan, setPlan] = useState<PlanConsumo | null>(null);
  const [pesosTexto, setPesosTexto] = useState<PesosTexto>({});
  const [tanda, setTanda] = useState<ProduccionResumen | null>(null);
  const [salieronTexto, setSalieronTexto] = useState('');
  const [mensajeFinal, setMensajeFinal] = useState('');

  const paso = historial[historial.length - 1];
  const ir = (p: Paso) => setHistorial((h) => [...h, p]);
  const atras = () => setHistorial((h) => (h.length > 1 ? h.slice(0, -1) : h));
  const alMenu = () => setHistorial(['menu']);

  const formulaciones = useQuery({ queryKey: ['formulaciones', 'produccion'], queryFn: getFormulaciones });
  const queProducir = useQuery({ queryKey: ['produccion', 'que-producir'], queryFn: getQueProducir });
  const enCurso = useQuery({ queryKey: ['produccion', 'lista', 'en_curso'], queryFn: () => getProducciones('en_curso') });

  const estadoPorReceta = useMemo(() => new Map((queProducir.data?.items ?? []).map((i) => [i.formulacion_id, i])), [queProducir.data]);
  const recetas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    const orden = { puede: 0, no_calculable: 1, no_alcanza: 2 } as const;
    return (formulaciones.data ?? [])
      .filter((f) => f.producto_activo)
      .filter((f) => !texto || f.producto.toLowerCase().includes(texto))
      .sort((a, b) => {
        const ea = estadoPorReceta.get(a.id)?.estado ?? 'no_calculable';
        const eb = estadoPorReceta.get(b.id)?.estado ?? 'no_calculable';
        return orden[ea] - orden[eb] || a.producto.localeCompare(b.producto, 'es');
      });
  }, [formulaciones.data, busqueda, estadoPorReceta]);
  const receta = formulaciones.data?.find((f) => f.id === formulacionId);
  const lectura = leerPesos(pesosTexto);
  const hayErrorPesos = Object.keys(lectura.errores).length > 0;
  const faltantes = plan?.items.filter((i) => i.faltante > 0) ?? [];

  const calcular = useMutation({
    mutationFn: () => simularProduccion({ formulacion_id: formulacionId, lotes, pesos_reales: lectura.pesos }),
    onSuccess: (p) => setPlan(p),
  });

  const registrar = useMutation({
    mutationFn: () => registrarProduccion({ formulacion_id: formulacionId, lotes, pesos_reales: lectura.pesos }),
    onSuccess: async (r) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventario'] }),
        queryClient.invalidateQueries({ queryKey: ['produccion'] }),
      ]);
      setMensajeFinal(`${lotes} ${lotes === 1 ? 'lote' : 'lotes'} de ${r.plan.formulacion.producto}`);
      setHistorial(['listo']);
    },
    onError: (error) => {
      const plan409 = (error as { response?: { data?: { plan?: PlanConsumo } } }).response?.data?.plan;
      if (plan409) setPlan(plan409);
    },
  });

  const terminar = useMutation({
    mutationFn: (cantidad: number) => finalizarProduccion(tanda?.id ?? '', cantidad),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['produccion'] });
      setHistorial(['terminada']);
    },
  });

  function reiniciar() {
    setFormulacionId('');
    setLotes(1);
    setBusqueda('');
    setPlan(null);
    setPesosTexto({});
    setTanda(null);
    setSalieronTexto('');
    calcular.reset();
    registrar.reset();
    terminar.reset();
    alMenu();
  }

  function irARevisar() {
    setPlan(null);
    setPesosTexto({});
    calcular.reset();
    calcular.mutate();
    ir('pesos');
  }

  const salieron = leerProducida(salieronTexto);

  const contenido = (() => {
    switch (paso) {
      case 'menu': {
        const tandas = enCurso.data ?? [];
        return (
          <>
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => ir('producto')}
              className="flex min-h-28 items-center gap-5 rounded-2xl bg-[#a85c3e] px-6 py-5 text-left text-white shadow-elevada"
            >
              <span className="inline-flex size-18 shrink-0 items-center justify-center rounded-full bg-current/15">
                <ChefHat size={40} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-[32px] leading-tight font-semibold">Empezar a producir</span>
                <span className="block text-lg opacity-90">Elige la receta y cuántos lotes vas a hacer</span>
              </span>
              <ChevronRight size={34} aria-hidden="true" />
            </motion.button>

            <div className="mt-2 rounded-2xl border-2 border-[#e3bfae] bg-terracota-suave p-4">
              <p className="mb-1 flex items-center gap-2 text-xl font-semibold text-[#7a3f28]">
                <Timer size={24} aria-hidden="true" />
                En el horno
              </p>
              <p className="mb-3 text-base text-[#7a3f28]">Cuando salga una tanda, tócala para anotar cuántas unidades salieron.</p>
              {enCurso.isLoading && <CargandoGrande />}
              {enCurso.isSuccess && tandas.length === 0 && (
                <p className="rounded-xl bg-[#fff] px-4 py-5 text-center text-lg text-gris-texto">No hay nada en el horno ahora.</p>
              )}
              <div className="flex flex-col gap-3">
                {tandas.map((t) => (
                  <OpcionGrande
                    key={t.id}
                    seccion="producir"
                    icono={CookingPot}
                    titulo={t.producto}
                    detalle={`Empezó a las ${hora(t.fecha)} · ${t.lotes ?? '?'} ${t.lotes === 1 ? 'lote' : 'lotes'} · ${t.usuario}`}
                    onElegir={() => {
                      setTanda(t);
                      setSalieronTexto('');
                      terminar.reset();
                      ir('terminar');
                    }}
                  />
                ))}
              </div>
            </div>
          </>
        );
      }

      case 'producto':
        return (
          <>
            <EncabezadoPaso seccion="producir" paso={1} total={4} pregunta="¿Qué vas a producir?" onAtras={atras} />
            <BuscadorGrande seccion="producir" valor={busqueda} onCambio={setBusqueda} placeholder="Buscar la receta" />
            {formulaciones.isLoading && <CargandoGrande />}
            {formulaciones.isError && <MensajeGrande tono="rojo">No se pudieron cargar las recetas.</MensajeGrande>}
            <div className="grid gap-3 sm:grid-cols-2">
              {recetas.map((f) => {
                const e = estadoPorReceta.get(f.id);
                const detalle =
                  e?.estado === 'puede'
                    ? `✓ Alcanza para ${e.lotes_posibles ?? 1} ${e.lotes_posibles === 1 ? 'lote' : 'lotes'}`
                    : e?.estado === 'no_alcanza'
                      ? '✕ No alcanza: faltan insumos'
                      : f.es_intermedio
                        ? 'Masa base'
                        : undefined;
                return (
                  <OpcionGrande
                    key={f.id}
                    seccion="producir"
                    titulo={f.producto}
                    detalle={detalle}
                    seleccionada={formulacionId === f.id}
                    onElegir={() => {
                      setFormulacionId(f.id);
                      setLotes(1);
                      ir('lotes');
                    }}
                  />
                );
              })}
            </div>
          </>
        );

      case 'lotes': {
        const e = estadoPorReceta.get(formulacionId);
        return (
          <>
            <EncabezadoPaso seccion="producir" paso={2} total={4} pregunta={`¿Cuántos lotes de ${receta?.producto ?? 'esta receta'}?`} onAtras={atras} />
            <div className="flex flex-col items-center gap-4 rounded-2xl bg-azul-noche px-5 py-7 text-white shadow-elevada">
              <div className="rounded-xl bg-hueso p-2">
                <Contador valor={lotes} onCambio={setLotes} max={1000} etiqueta="Número de lotes" />
              </div>
              {receta && (
                <p className="text-center text-xl">
                  {receta.rendimiento ? (
                    <>
                      Salen <span className="font-display text-3xl font-semibold text-trigo cifras">{receta.rendimiento * lotes}</span> unidades
                      {' · '}
                    </>
                  ) : null}
                  {formatoCantidad(receta.peso_lote_g * lotes, 'g')} de masa
                </p>
              )}
              {e?.estado === 'puede' && e.lotes_posibles !== null && lotes > e.lotes_posibles && (
                <p className="rounded-lg bg-atencion-fondo px-4 py-2 text-lg font-semibold text-atencion-texto">
                  Ojo: con lo que hay en bodega alcanza para {e.lotes_posibles}.
                </p>
              )}
            </div>
            <button type="button" onClick={irARevisar} className={BOTON_PRINCIPAL}>
              Siguiente
            </button>
          </>
        );
      }

      case 'pesos':
        return (
          <>
            <EncabezadoPaso seccion="producir" paso={3} total={4} pregunta="Revisa los ingredientes" onAtras={atras} />
            <p className="flex items-start justify-center gap-2 text-center text-lg text-gris-texto">
              <Scale size={22} className="mt-1 shrink-0" aria-hidden="true" />
              Si pesaste algo, escribe cuánto. Si no, déjalo vacío y se usa lo de la receta.
            </p>
            {calcular.isPending && !plan && <CargandoGrande />}
            {calcular.isError && <MensajeGrande tono="rojo">{mensajeDeError(calcular.error, 'No se pudo calcular el consumo.')}</MensajeGrande>}
            {plan && !plan.completo && (
              <div className="flex items-start gap-3 rounded-2xl bg-critico-fondo px-5 py-4 text-lg font-semibold text-critico-texto">
                <OctagonAlert size={28} className="shrink-0" aria-hidden="true" />
                <span>No alcanza: falta {faltantes.map((i) => `${i.nombre} (${formatoCantidad(i.faltante, i.unidad)})`).join(', ')}. Avísale al administrador o haz menos lotes.</span>
              </div>
            )}
            {plan && (
              <ul className="flex flex-col gap-3 rounded-2xl border-2 border-[#e3bfae] bg-terracota-suave p-3">
                {plan.items.map((i) => {
                  const error = lectura.errores[i.materia_prima_id];
                  return (
                    <li
                      key={i.materia_prima_id}
                      className={`flex flex-col gap-3 rounded-xl border-l-8 bg-[#fff] px-5 py-4 shadow-xs sm:flex-row sm:items-center sm:justify-between ${
                        i.faltante > 0 ? 'border-l-critico-texto' : 'border-l-[#a85c3e]'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-xl font-semibold text-grafito">{i.nombre}</span>
                        <span className="block text-lg text-gris-texto">
                          Receta: <span className="font-semibold text-azul-noche cifras">{formatoCantidad(i.peso_estandar, i.unidad)}</span>
                        </span>
                        {i.faltante > 0 && <span className="block text-base font-semibold text-critico-texto">Faltan {formatoCantidad(i.faltante, i.unidad)}</span>}
                        {i.pesado && i.desviacion_pct !== null && !error && (
                          <span className="mt-1 inline-block rounded-lg bg-azul-suave px-2 py-0.5 text-base font-semibold text-azul-noche">
                            {textoDesviacion(i.desviacion_pct)} frente a la receta
                          </span>
                        )}
                        {error && <span className="block text-base font-semibold text-critico-texto">{error}</span>}
                      </span>
                      {i.controla_inventario && (
                        <label className="flex items-center gap-2">
                          <span className="sr-only">Lo que pesaste de {i.nombre}</span>
                          <input
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="Pesé…"
                            value={pesosTexto[i.materia_prima_id] ?? ''}
                            onChange={(ev) => setPesosTexto((p) => ({ ...p, [i.materia_prima_id]: ev.target.value }))}
                            onBlur={() => {
                              if (!hayErrorPesos && !calcular.isPending) calcular.mutate();
                            }}
                            className="min-h-14 w-36 rounded-xl border-2 border-[#e3bfae] bg-[#fff] px-3 text-center text-xl font-semibold text-azul-noche cifras focus:border-[#a85c3e] focus:outline-hidden"
                          />
                          <span className="text-lg text-gris-texto">{i.unidad}</span>
                        </label>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <button
              type="button"
              disabled={!plan || !plan.completo || hayErrorPesos || calcular.isPending}
              onClick={() => ir('confirmar')}
              className={BOTON_PRINCIPAL}
            >
              Siguiente
            </button>
          </>
        );

      case 'confirmar': {
        const pesados = plan?.items.filter((i) => i.pesado).length ?? 0;
        const filas: [string, string][] = [
          ['Receta', receta?.producto ?? plan?.formulacion.producto ?? ''],
          ['Lotes', String(lotes)],
          ...(receta?.rendimiento ? ([['Deben salir', `${receta.rendimiento * lotes} unidades`]] as [string, string][]) : []),
          ['Pesaste', pesados === 0 ? 'Nada (se usa la receta)' : `${pesados} ${pesados === 1 ? 'ingrediente' : 'ingredientes'}`],
        ];
        return (
          <>
            <EncabezadoPaso seccion="producir" paso={4} total={4} pregunta="¿Está bien así?" onAtras={atras} />
            <dl className="overflow-hidden rounded-2xl border-2 border-[#e3bfae] bg-[#fff]">
              {filas.map(([k, v], n) => (
                <div key={k} className={`flex flex-wrap items-center justify-between gap-2 px-5 py-4 ${n % 2 ? 'bg-terracota-suave/50' : ''}`}>
                  <dt className="text-lg text-gris-texto">{k}</dt>
                  <dd className="text-right text-xl font-semibold text-grafito">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-center text-lg text-gris-texto">Al registrar, los insumos se descuentan de la bodega.</p>
            {registrar.isError && <MensajeGrande tono="rojo">{mensajeDeError(registrar.error, 'No se pudo registrar la producción.')}</MensajeGrande>}
            <button type="button" disabled={registrar.isPending} onClick={() => registrar.mutate()} className={BOTON_PRINCIPAL}>
              <ChefHat size={30} aria-hidden="true" />
              {registrar.isPending ? 'Registrando…' : 'Registrar producción'}
            </button>
          </>
        );
      }

      case 'terminar':
        return (
          <>
            <EncabezadoPaso seccion="producir" paso={1} total={1} pregunta={`¿Cuántas unidades de ${tanda?.producto ?? ''} salieron?`} onAtras={atras} />
            <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-[#e3bfae] bg-terracota-suave px-5 py-6">
              <label htmlFor="op-salieron" className="sr-only">
                Unidades que salieron
              </label>
              <input
                id="op-salieron"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                value={salieronTexto}
                onChange={(e) => setSalieronTexto(e.target.value)}
                placeholder="0"
                className="min-h-20 w-full max-w-xs rounded-xl border-2 border-[#a85c3e]/40 bg-[#fff] px-4 text-center font-display text-[44px] font-semibold text-azul-noche cifras focus:border-[#a85c3e] focus:outline-hidden"
              />
              {tanda?.cantidad_planificada != null && (
                <p className="text-xl text-grafito">
                  Se esperaban <span className="font-semibold cifras">{tanda.cantidad_planificada.toLocaleString('es-CO')}</span> unidades.
                </p>
              )}
              {salieronTexto.trim() !== '' && salieron === null && <p className="text-lg font-semibold text-critico-texto">Escribe un número mayor que 0.</p>}
            </div>
            {terminar.isError && <MensajeGrande tono="rojo">{mensajeDeError(terminar.error, 'No se pudo terminar la tanda.')}</MensajeGrande>}
            <button
              type="button"
              disabled={salieron === null || terminar.isPending}
              onClick={() => salieron !== null && terminar.mutate(salieron)}
              className={BOTON_PRINCIPAL}
            >
              <Flag size={28} aria-hidden="true" />
              {terminar.isPending ? 'Guardando…' : 'Terminar tanda'}
            </button>
          </>
        );

      case 'listo':
      case 'terminada':
        return (
          <div className="flex flex-col items-center gap-5 rounded-2xl bg-exito-fondo px-6 py-10 text-center">
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
              <CircleCheck size={88} className="text-verde-bosque" aria-hidden="true" />
            </motion.span>
            <div>
              <p className="font-display text-[32px] leading-tight font-semibold text-exito-texto">
                {paso === 'listo' ? '¡Producción registrada!' : '¡Tanda terminada!'}
              </p>
              <p className="mt-2 text-xl text-grafito">
                {paso === 'listo'
                  ? `${mensajeFinal}. Cuando salga del horno, vuelve a Producir y toca la tanda para anotar cuántas salieron.`
                  : `Salieron ${salieron?.toLocaleString('es-CO') ?? ''} unidades de ${tanda?.producto ?? ''}.`}
              </p>
            </div>
            <div className="grid w-full gap-3 sm:grid-cols-2">
              <button type="button" onClick={reiniciar} className="min-h-16 rounded-xl bg-[#a85c3e] px-6 text-xl font-semibold text-white active:scale-[0.98]">
                Volver a Producir
              </button>
              <Link to="/inicio" className="inline-flex min-h-16 items-center justify-center gap-2 rounded-xl border-2 border-azul-noche bg-[#fff] px-6 text-xl font-semibold text-azul-noche">
                <House size={24} aria-hidden="true" />
                Ir al inicio
              </Link>
            </div>
          </div>
        );
    }
  })();

  return (
    <div className="flex flex-col pb-10">
      <BandaSeccion seccion="producir" icono={ChefHat} titulo="Producir" ayuda="Hacer una receta y terminar lo que está en el horno." />
      <div className="mx-auto mt-4 w-full max-w-3xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={paso}
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
