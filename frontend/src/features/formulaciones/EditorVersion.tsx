import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Plus, Trash2, Wheat } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { LoadingState } from '../../components/feedback/LoadingState';
import { ErrorState } from '../../components/feedback/ErrorState';
import { crearProducto, crearVersion, getFormulacion, getFormulaciones } from '../../services/formulacionesService';
import { getMateriasPrimas } from '../../services/materiasPrimasService';
import { mensajeDeError } from '../../services/errores';
import { leerNumero } from '../precios/numeros';
import type { FormulacionDetalle } from '../../types/formulacion.types';
import {
  INGREDIENTES_MAX,
  NOMBRE_PRODUCTO_MAX,
  filaConSeleccion,
  fichaVacia,
  filaVacia,
  validarEditor,
  validarNombreProducto,
  validarPrecioVenta,
  MERMA_HORNEADO_MAX,
  MOTIVO_MAX,
  PROCEDIMIENTO_MAX,
  valorSelector,
  valoresDesdeDetalle,
  type ErroresEditor,
  type FichaEditor,
  type FilaEditor,
} from './esquemaVersion';

interface Props {
  // Versión de la que se parte: la vigente (editar) o una anterior (usarla como base).
  // Sin `base` el formulario crea un producto nuevo con su primera versión.
  base?: FormulacionDetalle;
  onTerminar: () => void;
}

export function EditorVersion({ base, onTerminar }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const inicial = useMemo(() => (base ? valoresDesdeDetalle(base) : { rendimiento: '', filas: [filaVacia()], ficha: fichaVacia() }), [base]);
  const [nombre, setNombre] = useState('');
  const [esIntermedio, setEsIntermedio] = useState(false);
  const [errorNombre, setErrorNombre] = useState<string | undefined>();
  const [rendimiento, setRendimiento] = useState(inicial.rendimiento);
  const [filas, setFilas] = useState<FilaEditor[]>(inicial.filas);
  const [ficha, setFicha] = useState<FichaEditor>(inicial.ficha);
  const [precioVenta, setPrecioVenta] = useState('');
  const [errorPrecio, setErrorPrecio] = useState<string | undefined>();
  const [errores, setErrores] = useState<ErroresEditor>({ filas: {} });
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [copiando, setCopiando] = useState(false);
  const [copiadoDe, setCopiadoDe] = useState('');

  const materias = useQuery({ queryKey: ['materias-primas', 'activas'], queryFn: getMateriasPrimas });
  const activas = useMemo(() => [...(materias.data ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [materias.data]);
  const idsActivas = useMemo(() => new Set(activas.map((m) => m.id)), [activas]);
  const porId = useMemo(() => new Map(activas.map((m) => [m.id, m])), [activas]);

  // Productos intermedios que se pueden usar como ingrediente (activos, y nunca el mismo producto)
  const formulaciones = useQuery({ queryKey: ['formulaciones', 'activos'], queryFn: getFormulaciones });
  const intermedios = useMemo(
    () =>
      (formulaciones.data ?? [])
        .filter((f) => f.es_intermedio && f.producto_activo && f.producto_id !== base?.producto_id)
        .sort((a, b) => a.producto.localeCompare(b.producto, 'es')),
    [formulaciones.data, base?.producto_id],
  );
  const intermedioPorId = useMemo(() => new Map(intermedios.map((f) => [f.producto_id, f])), [intermedios]);

  // Resumen en vivo de lo que se está escribiendo
  const resumen = useMemo(() => {
    let pesoG = 0;
    let costo = 0;
    let sinPrecio = 0;
    let intermediosSinCosto = 0;
    for (const f of filas) {
      const c = leerNumero(f.cantidad);
      if (c === null) continue;
      if (f.producto_intermedio_id) {
        pesoG += c;
        intermediosSinCosto += 1;
        continue;
      }
      const m = f.materia_prima_id ? porId.get(f.materia_prima_id) : undefined;
      if (!m) continue;
      if (m.unidad === 'g') pesoG += c;
      const unit = m.presentaciones.find((pr) => pr.costo_por_unidad_base != null)?.costo_por_unidad_base;
      if (unit == null) sinPrecio += 1;
      else costo += c * unit;
    }
    return { pesoG, costo, sinPrecio, intermediosSinCosto };
  }, [filas, porId]);
  const rend = leerNumero(rendimiento);

  // Con una versión vigente de base, guardar sin cambiar nada no tiene sentido (el servidor lo rechaza)
  const firma = (r: string, fs: FilaEditor[], fi: FichaEditor) =>
    JSON.stringify([
      leerNumero(r),
      // El motivo no cuenta: describe el cambio, no la versión
      [fi.procedimiento.replace(/\r\n?/g, '\n').trim(), leerNumero(fi.tiempoPreparacion), leerNumero(fi.tiempoHorneado), leerNumero(fi.temperatura), leerNumero(fi.merma)],
      fs.map((f) => [f.producto_intermedio_id || f.materia_prima_id || '', leerNumero(f.cantidad), f.tolerancia.trim() === '' ? null : leerNumero(f.tolerancia)]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ]);
  const sinCambios = !!base?.activa && firma(rendimiento, filas, ficha) === firma(inicial.rendimiento, inicial.filas, inicial.ficha);

  const guardar = useMutation({
    mutationFn: ({ nombreProducto, precio, datos }: { nombreProducto: string; precio: number | null; datos: Parameters<typeof crearVersion>[1] }) =>
      base ? crearVersion(base.id, datos) : crearProducto({ nombre: nombreProducto, es_intermedio: esIntermedio, precio_venta: precio, ...datos }),
    onSuccess: async (creada) => {
      // El costo, el ABC y las listas cambian con la versión vigente
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['formulaciones'] }),
        queryClient.invalidateQueries({ queryKey: ['formulacion'] }),
        queryClient.invalidateQueries({ queryKey: ['formulacion-versiones'] }),
        queryClient.invalidateQueries({ queryKey: ['clasificacion-abc'] }),
      ]);
      onTerminar();
      navigate(`/formulaciones/${creada.id}`);
    },
    onError: (error) =>
      setErrorServidor(mensajeDeError(error, base ? 'No se pudo guardar la nueva versión.' : 'No se pudo crear el producto.')),
  });

  function cambiarFila(clave: string, cambios: Partial<FilaEditor>) {
    setFilas((actuales) => actuales.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)));
  }

  // Parte de una receta que ya existe: copia el rendimiento y los ingredientes para ajustarlos
  async function copiarReceta(idFormulacion: string) {
    setCopiadoDe(idFormulacion);
    if (!idFormulacion) return;
    setCopiando(true);
    setErrorServidor(null);
    try {
      const detalle = await getFormulacion(idFormulacion);
      const valores = valoresDesdeDetalle(detalle);
      setRendimiento(valores.rendimiento);
      setFilas(valores.filas);
      setErrores({ filas: {} });
    } catch (error) {
      setErrorServidor(mensajeDeError(error, 'No se pudo copiar la receta.'));
      setCopiadoDe('');
    } finally {
      setCopiando(false);
    }
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErrorServidor(null);
    let nombreProducto = '';
    let nombreMal = false;
    if (!base) {
      const n = validarNombreProducto(nombre);
      const repetido = n.ok && (formulaciones.data ?? []).some((f) => f.producto.trim().toLowerCase() === n.nombre.toLowerCase());
      if (n.ok && !repetido) nombreProducto = n.nombre;
      else nombreMal = true;
      setErrorNombre(n.ok ? (repetido ? 'Ya existe un producto con ese nombre.' : undefined) : n.error);
    }
    let precio: number | null = null;
    let precioMal = false;
    if (!base) {
      const p = validarPrecioVenta(precioVenta);
      if (p.ok) precio = p.valor;
      else precioMal = true;
      setErrorPrecio(p.ok ? undefined : p.error);
    }
    const resultado = validarEditor({ rendimiento, filas, ficha }, idsActivas);
    if (!resultado.ok) setErrores(resultado.errores);
    if (nombreMal || precioMal || !resultado.ok) return;
    setErrores({ filas: {} });
    guardar.mutate({ nombreProducto, precio, datos: resultado.datos });
  }

  if (materias.isLoading || formulaciones.isLoading) return <LoadingState mensaje="Cargando insumos..." />;
  if (materias.isError || formulaciones.isError) {
    return <ErrorState onReintentar={() => void Promise.all([materias.refetch(), formulaciones.refetch()])} />;
  }

  const campoBloque = 'flex flex-col gap-3 rounded-tarjeta border border-linea bg-hueso p-4';
  return (
    <form onSubmit={enviar} className="flex flex-col gap-5" noValidate>
      <Alert variant="info">
        {!base
          ? 'Se crea el producto con su primera versión (v1), ya vigente. Cuenta en el ABC con el supuesto de 6 lotes por semana hasta que exista el plan de producción.'
          : base.activa
            ? 'Al guardar se crea una versión nueva y la actual queda como anterior (con su fecha de cierre). Cambiará el costo del lote y el ABC.'
            : `Se crea una versión nueva con estos valores, que pasa a ser la vigente. La versión vigente queda como anterior; la v${base.version} no se modifica. Cambiará el costo del lote y el ABC.`}
      </Alert>

      <section className={campoBloque}>
        <h3 className="text-sm font-semibold text-azul-noche">{base ? 'Rendimiento' : 'Producto'}</h3>
        {!base && (
          <>
            <Input id="prod-nombre" label="Nombre del producto" maxLength={NOMBRE_PRODUCTO_MAX} autoFocus value={nombre} onChange={(e) => { setNombre(e.target.value); setErrorNombre(undefined); }} error={errorNombre} />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-grafito">¿Qué tipo de producto es?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { valor: false, titulo: 'Producto final', texto: 'Lo que se vende: pan, rosca, torta.', Icono: Wheat, clases: 'border-trigo bg-trigo-suave/50' },
                  { valor: true, titulo: 'Producto intermedio', texto: 'Una masa base o galleta que se usa como ingrediente de otros. Se mide en gramos.', Icono: Layers, clases: 'border-verde-bosque bg-verde-suave/50' },
                ].map(({ valor, titulo, texto, Icono, clases }) => (
                  <label key={titulo} className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-3 text-sm transition-colors ${esIntermedio === valor ? clases : 'border-linea bg-white hover:bg-arena'}`}>
                    <input type="radio" name="tipo-producto" className="sr-only" checked={esIntermedio === valor} onChange={() => setEsIntermedio(valor)} />
                    <Icono size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-azul-noche" />
                    <span>
                      <span className="block font-semibold text-grafito">{titulo}</span>
                      <span className="block text-xs text-gris-texto">{texto}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {(formulaciones.data ?? []).length > 0 && (
              <Select id="copiar-de" label="Partir de una receta existente (opcional)" value={copiadoDe} onChange={(e) => void copiarReceta(e.target.value)} disabled={copiando}>
                <option value="">Empezar en blanco</option>
                {[...(formulaciones.data ?? [])].sort((x, y) => x.producto.localeCompare(y.producto, 'es')).map((f) => (
                  <option key={f.id} value={f.id}>{f.producto}</option>
                ))}
              </Select>
            )}
            {copiadoDe && !copiando && <p className="text-xs text-gris-texto">Se copiaron el rendimiento y los ingredientes. Ajusta lo que cambie en el producto nuevo.</p>}
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="ver-rendimiento" label="Rinde (unidades por lote)" inputMode="decimal" value={rendimiento} onChange={(e) => setRendimiento(e.target.value)} error={errores.rendimiento} />
          {!base && (
            <Input
              id="prod-precio"
              label="Precio de venta por unidad (opcional)"
              inputMode="decimal"
              placeholder="Para calcular el margen"
              value={precioVenta}
              onChange={(e) => {
                setPrecioVenta(e.target.value);
                setErrorPrecio(undefined);
              }}
              error={errorPrecio}
            />
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-azul-noche">Ingredientes</h3>
          <span className="text-xs text-gris-texto">{filas.length} de {INGREDIENTES_MAX}</span>
        </div>
        <div className="hidden gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-gris-texto sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_2.75rem]">
          <span>Ingrediente</span>
          <span>Cantidad</span>
          <span>Tolerancia ± %</span>
          <span />
        </div>

        {filas.map((fila, i) => {
          const err = errores.filas[fila.clave] ?? {};
          const filaIntermedio = !!fila.producto_intermedio_id;
          const materia = fila.materia_prima_id ? porId.get(fila.materia_prima_id) : undefined;
          const unidad = materia?.unidad ?? fila.unidad;
          const enLista = !!fila.materia_prima_id && idsActivas.has(fila.materia_prima_id);
          return (
            <div key={fila.clave} className="grid grid-cols-1 gap-2 rounded-lg border border-linea bg-white p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_2.75rem] sm:items-start">
              <Select
                aria-label={`Ingrediente ${i + 1}`}
                value={valorSelector(fila)}
                onChange={(e) =>
                  setFilas((actuales) =>
                    actuales.map((f) => (f.clave === fila.clave ? filaConSeleccion(f, e.target.value, (id) => intermedioPorId.get(id)?.producto ?? '') : f)),
                  )
                }
                error={err.materia}
              >
                <option value="">Elige un ingrediente…</option>
                {!enLista && fila.materia_prima_id && <option value={`m:${fila.materia_prima_id}`}>{fila.nombre} (inactivo)</option>}
                {filaIntermedio && fila.producto_intermedio_id && !intermedioPorId.has(fila.producto_intermedio_id) && (
                  <option value={`i:${fila.producto_intermedio_id}`}>{fila.nombre} (intermedio no disponible)</option>
                )}
                <optgroup label="Insumos">
                  {activas.map((m) => (
                    <option key={m.id} value={`m:${m.id}`} disabled={m.id !== fila.materia_prima_id && filas.some((o) => o.materia_prima_id === m.id)}>
                      {m.codigo} · {m.nombre}
                    </option>
                  ))}
                </optgroup>
                {intermedios.length > 0 && (
                  <optgroup label="Productos intermedios">
                    {intermedios.map((f) => (
                      <option key={f.producto_id} value={`i:${f.producto_id}`} disabled={f.producto_id !== fila.producto_intermedio_id && filas.some((o) => o.producto_intermedio_id === f.producto_id)}>
                        {f.producto}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>

              <Input aria-label={`Cantidad del ingrediente ${i + 1}`} inputMode="decimal" placeholder={unidad ? `en ${unidad}` : 'Cantidad'} value={fila.cantidad} onChange={(e) => cambiarFila(fila.clave, { cantidad: e.target.value })} error={err.cantidad} />
              <Input aria-label={`Tolerancia del ingrediente ${i + 1}`} inputMode="decimal" placeholder="Opcional" value={fila.tolerancia} onChange={(e) => cambiarFila(fila.clave, { tolerancia: e.target.value })} error={err.tolerancia} />
              <button
                type="button"
                aria-label={`Quitar el ingrediente ${i + 1}`}
                title="Quitar"
                className="grid size-11 place-items-center rounded-lg border border-borde-campo text-critico-texto transition-colors hover:bg-critico-fondo"
                onClick={() => setFilas((actuales) => actuales.filter((f) => f.clave !== fila.clave))}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          );
        })}

        {errores.general && <span className="text-xs text-critico-texto">{errores.general}</span>}

        <div>
          <Button type="button" variant="secondary" disabled={filas.length >= INGREDIENTES_MAX} onClick={() => setFilas((actuales) => [...actuales, filaVacia()])}>
            <Plus size={16} aria-hidden="true" />
            Agregar ingrediente
          </Button>
        </div>
      </section>

      <section className={campoBloque}>
        <div>
          <h3 className="text-sm font-semibold text-azul-noche">Preparación y horneado <span className="font-normal text-gris-texto">(opcional)</span></h3>
          <p className="text-xs text-gris-texto">Es lo que completa la ficha técnica: cómo se hace y cuánto se pierde al hornear. Sale en la ficha que se imprime.</p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium text-grafito">
          Procedimiento
          <textarea
            value={ficha.procedimiento}
            onChange={(e) => setFicha((f) => ({ ...f, procedimiento: e.target.value }))}
            rows={5}
            placeholder={'1. Mezclar los secos.\n2. Amasar 10 minutos.\n3. Reposar 45 minutos…'}
            className="min-h-11 w-full rounded-lg border border-borde-campo bg-white px-3 py-2 text-sm font-normal text-grafito placeholder:text-gris-texto focus:outline-hidden focus:ring-2 focus:ring-trigo"
          />
          <span className={`text-xs font-normal ${errores.ficha?.procedimiento ? 'text-critico-texto' : 'text-gris-texto'}`}>
            {errores.ficha?.procedimiento ?? `${ficha.procedimiento.length.toLocaleString('es-CO')} de ${PROCEDIMIENTO_MAX.toLocaleString('es-CO')} caracteres`}
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Input id="f-prep" label="Preparación (min)" inputMode="numeric" value={ficha.tiempoPreparacion} onChange={(e) => setFicha((f) => ({ ...f, tiempoPreparacion: e.target.value }))} error={errores.ficha?.tiempoPreparacion} />
          <Input id="f-horno" label="Horneado (min)" inputMode="numeric" value={ficha.tiempoHorneado} onChange={(e) => setFicha((f) => ({ ...f, tiempoHorneado: e.target.value }))} error={errores.ficha?.tiempoHorneado} />
          <Input id="f-temp" label="Temperatura (°C)" inputMode="numeric" value={ficha.temperatura} onChange={(e) => setFicha((f) => ({ ...f, temperatura: e.target.value }))} error={errores.ficha?.temperatura} />
          <Input id="f-merma" label={`Merma al hornear (%, máx. ${MERMA_HORNEADO_MAX})`} inputMode="decimal" value={ficha.merma} onChange={(e) => setFicha((f) => ({ ...f, merma: e.target.value }))} error={errores.ficha?.merma} />
        </div>
        <p className="text-xs text-gris-texto">La merma es lo que pierde la masa en el horno (agua que se evapora). Con ella la ficha calcula el peso de cada unidad ya horneada.</p>
      </section>

      {base && (
        <section className={campoBloque}>
          <label className="flex flex-col gap-1 text-sm font-semibold text-azul-noche">
            ¿Por qué cambias la receta? <span className="font-normal text-gris-texto">(opcional, queda en el historial)</span>
            <input
              value={ficha.motivo}
              onChange={(e) => setFicha((f) => ({ ...f, motivo: e.target.value }))}
              maxLength={MOTIVO_MAX}
              placeholder="Ej.: bajamos el azúcar por el alza de precio"
              className="min-h-11 w-full rounded-lg border border-borde-campo bg-white px-3 text-sm font-normal text-grafito placeholder:text-gris-texto focus:outline-hidden focus:ring-2 focus:ring-trigo"
            />
          </label>
        </section>
      )}

      <section aria-label="Resumen de la formulación" className="grid grid-cols-2 gap-3 rounded-tarjeta bg-azul-noche p-4 text-white sm:grid-cols-4">
        <div>
          <p className="text-xs text-niebla">Peso del lote</p>
          <p className="cifras font-display text-xl font-semibold">{resumen.pesoG >= 1000 ? `${(resumen.pesoG / 1000).toLocaleString('es-CO', { maximumFractionDigits: 2 })} kg` : `${resumen.pesoG.toLocaleString('es-CO', { maximumFractionDigits: 1 })} g`}</p>
        </div>
        <div>
          <p className="text-xs text-niebla">Gramos por unidad</p>
          <p className="cifras font-display text-xl font-semibold">{rend && rend > 0 ? (resumen.pesoG / rend).toLocaleString('es-CO', { maximumFractionDigits: 1 }) : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-niebla">Costo estimado</p>
          <p className="cifras font-display text-xl font-semibold">{resumen.costo > 0 ? resumen.costo.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }) : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-niebla">Costo por unidad</p>
          <p className="cifras font-display text-xl font-semibold">{resumen.costo > 0 && rend && rend > 0 ? (resumen.costo / rend).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }) : '—'}</p>
        </div>
        {(resumen.sinPrecio > 0 || resumen.intermediosSinCosto > 0) && (
          <p className="col-span-full text-xs text-niebla">
            Costo parcial: {resumen.sinPrecio > 0 ? `${resumen.sinPrecio} ${resumen.sinPrecio === 1 ? 'insumo sin precio' : 'insumos sin precio'}` : ''}
            {resumen.sinPrecio > 0 && resumen.intermediosSinCosto > 0 ? ' y ' : ''}
            {resumen.intermediosSinCosto > 0 ? 'los intermedios se costean al guardar' : ''}.
          </p>
        )}
      </section>

      {errorServidor && <Alert variant="error">{errorServidor}</Alert>}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {sinCambios && <span className="mr-auto text-xs text-gris-texto">Cambia algo para poder guardar una versión nueva.</span>}
        <Button type="button" variant="secondary" onClick={onTerminar} disabled={guardar.isPending}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={guardar.isPending} disabled={sinCambios}>
          {base ? 'Guardar como versión nueva' : 'Crear producto'}
        </Button>
      </div>
    </form>
  );
}
