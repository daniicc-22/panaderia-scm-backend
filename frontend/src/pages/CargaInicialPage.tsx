import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Loader2, Printer } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { ErrorState } from '../components/feedback/ErrorState';
import { LoadingState } from '../components/feedback/LoadingState';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { aNumero, CANTIDAD_MAX, errorVencimiento } from '../features/inventario/esquemaEntrada';
import { formatoCantidad } from '../features/inventario/formatos';
import { mensajeDeError } from '../services/errores';
import { getOpcionesEntrada, registrarEntrada } from '../services/inventarioService';
import type { MateriaEntrada } from '../types/inventario.types';

// Carga inicial del inventario: una sola tabla con todos los insumos. Cada fila con cantidad se guarda como una
// entrada normal (mismo endpoint que «Registrar entrada»), una tras otra. Las filas guardadas quedan bloqueadas,
// así que reintentar nunca duplica una entrada.

interface Fila {
  presentacion_id: string;
  cantidad: string;
  vencimiento: string;
  estado: 'pendiente' | 'guardando' | 'guardada' | 'error';
  mensaje: string;
}

const FILA_VACIA: Fila = { presentacion_id: '', cantidad: '', vencimiento: '', estado: 'pendiente', mensaje: '' };
const CLAVE_BORRADOR = 'carga-inicial-borrador-v1';
const CAMPO_MOVIL = 'min-h-11 text-base!';
const CAMPO = 'rounded-lg border bg-white px-2 py-1.5 text-sm text-grafito focus:outline-hidden focus:ring-2 focus:ring-trigo';

type Borrador = Record<string, Pick<Fila, 'presentacion_id' | 'cantidad' | 'vencimiento'>>;

function leerBorrador(): Borrador {
  try {
    const crudo = localStorage.getItem(CLAVE_BORRADOR);
    return crudo ? (JSON.parse(crudo) as Borrador) : {};
  } catch {
    return {};
  }
}

function guardarBorrador(filas: Record<string, Fila>) {
  try {
    const b: Borrador = {};
    for (const [id, f] of Object.entries(filas)) {
      if (f.estado === 'guardada') continue;
      if (f.cantidad.trim() || f.vencimiento || f.presentacion_id) {
        b[id] = { presentacion_id: f.presentacion_id, cantidad: f.cantidad, vencimiento: f.vencimiento };
      }
    }
    if (Object.keys(b).length === 0) localStorage.removeItem(CLAVE_BORRADOR);
    else localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(b));
  } catch {
    /* el borrador es solo una comodidad */
  }
}

// Mensaje de error de una fila con cantidad escrita (null si está lista para guardar)
function errorDeFila(m: MateriaEntrada, f: Fila, hoy: string): string | null {
  if (!f.presentacion_id) return 'Elige la presentación.';
  const n = aNumero(f.cantidad);
  if (!Number.isFinite(n) || n <= 0 || n > CANTIDAD_MAX) return 'Cantidad no válida.';
  return errorVencimiento(f.vencimiento, hoy, m.criterio_rotacion);
}

export function CargaInicialPage() {
  const queryClient = useQueryClient();
  const opciones = useQuery({ queryKey: ['inventario', 'opciones'], queryFn: getOpcionesEntrada });
  const [filas, setFilas] = useState<Record<string, Fila>>({});
  const [iniciado, setIniciado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Al llegar las opciones se arma una fila por insumo, recuperando el borrador y eligiendo sola la presentación única
  useEffect(() => {
    if (!opciones.data || iniciado) return;
    const borrador = leerBorrador();
    const inicial: Record<string, Fila> = {};
    for (const m of opciones.data.materias) {
      const b = borrador[m.id];
      const unica = m.presentaciones.length === 1 ? m.presentaciones[0].id : '';
      inicial[m.id] = { ...FILA_VACIA, ...(b ?? {}), presentacion_id: b?.presentacion_id || unica };
    }
    setFilas(inicial);
    setIniciado(true);
  }, [opciones.data, iniciado]);

  useEffect(() => {
    if (iniciado) guardarBorrador(filas);
  }, [filas, iniciado]);

  // Escape cancela la confirmación de guardado
  useEffect(() => {
    if (!confirmando) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmando(false);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [confirmando]);

  const hoy = opciones.data?.fecha ?? '';
  const materias = useMemo(() => opciones.data?.materias ?? [], [opciones.data]);
  const cargables = useMemo(
    () => materias.filter((m) => m.presentaciones.some((p) => p.proveedores.length > 0)),
    [materias],
  );
  const sinOferta = materias.filter((m) => !cargables.includes(m));

  const conCantidad = cargables.filter((m) => {
    const f = filas[m.id];
    return f && f.estado !== 'guardada' && f.cantidad.trim() !== '';
  });
  const erroresPorId = new Map<string, string>();
  for (const m of conCantidad) {
    const e = errorDeFila(m, filas[m.id], hoy);
    if (e) erroresPorId.set(m.id, e);
  }
  const listas = conCantidad.filter((m) => !erroresPorId.has(m.id));
  const guardadas = cargables.filter((m) => filas[m.id]?.estado === 'guardada').length;
  const fefoSinCantidad = cargables.filter(
    (m) => m.criterio_rotacion === 'FEFO' && filas[m.id] && filas[m.id].estado !== 'guardada' && filas[m.id].cantidad.trim() === '',
  ).length;

  function cambiar(id: string, parche: Partial<Fila>) {
    setConfirmando(false);
    setFilas((prev) => ({ ...prev, [id]: { ...prev[id], ...parche } }));
  }

  async function guardarTodo() {
    setConfirmando(false);
    setGuardando(true);
    for (const m of listas) {
      const f = filas[m.id];
      cambiar(m.id, { estado: 'guardando', mensaje: '' });
      try {
        // Código fijo por insumo y día: si la respuesta se pierde (señal, servidor lento) y se reintenta, el servidor
        // responde «ya existe» en vez de crear el lote dos veces
        await registrarEntrada(
          {
            materia_prima_id: m.id,
            presentacion_id: f.presentacion_id,
            cantidad: aNumero(f.cantidad),
            codigo_lote: `INI-${hoy.replaceAll('-', '')}-${m.codigo}`,
            ...(f.vencimiento ? { fecha_vencimiento: f.vencimiento } : {}),
          },
          60_000,
        );
        setFilas((prev) => ({ ...prev, [m.id]: { ...prev[m.id], estado: 'guardada', mensaje: '' } }));
      } catch (error) {
        // 409 con el código propio de esta carga: la entrada ya quedó guardada en un intento anterior
        const yaGuardada = isAxiosError(error) && error.response?.status === 409 && /ya existe un lote/i.test(String(error.response?.data?.error ?? ''));
        setFilas((prev) => ({
          ...prev,
          [m.id]: yaGuardada
            ? { ...prev[m.id], estado: 'guardada', mensaje: '' }
            : { ...prev[m.id], estado: 'error', mensaje: mensajeDeError(error, 'No se pudo guardar.') },
        }));
      }
    }
    setGuardando(false);
    await queryClient.invalidateQueries({ queryKey: ['inventario'] });
    await queryClient.invalidateQueries({ queryKey: ['reposicion'] });
  }

  // Los mismos campos se pintan en la tabla (pantalla grande) y en tarjetas (celular)
  function datosFila(m: MateriaEntrada) {
    const f = filas[m.id] ?? FILA_VACIA;
    const bloqueada = f.estado === 'guardada' || f.estado === 'guardando' || guardando;
    const pres = m.presentaciones.find((p) => p.id === f.presentacion_id);
    const n = aNumero(f.cantidad);
    const error = f.cantidad.trim() !== '' ? erroresPorId.get(m.id) : undefined;
    const fefo = m.criterio_rotacion === 'FEFO';
    const entra = pres && Number.isFinite(n) && n > 0 ? formatoCantidad(Math.round(n * pres.contenido * 1000) / 1000, m.unidad) : '—';
    const presentacionEl = (clase: string) => (
      <select
        aria-label={`Presentación de ${m.nombre}`}
        className={`${CAMPO} border-borde-campo ${clase}`}
        value={f.presentacion_id}
        disabled={bloqueada}
        onChange={(e) => cambiar(m.id, { presentacion_id: e.target.value })}
      >
        <option value="">Elige…</option>
        {m.presentaciones
          .filter((p) => p.proveedores.length > 0)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
      </select>
    );
    const cantidadEl = (clase: string) => (
      <input
        aria-label={`Cantidad de ${m.nombre}`}
        className={`${CAMPO} ${error ? 'border-critico-texto' : 'border-borde-campo'} ${clase}`}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={f.cantidad}
        disabled={bloqueada}
        onChange={(e) => cambiar(m.id, { cantidad: e.target.value })}
      />
    );
    const vencimientoEl = (clase: string) => (
      <input
        type="date"
        aria-label={`Vencimiento de ${m.nombre}`}
        className={`${CAMPO} ${error && fefo ? 'border-critico-texto' : 'border-borde-campo'} ${clase}`}
        value={f.vencimiento}
        min={hoy}
        disabled={bloqueada}
        onChange={(e) => cambiar(m.id, { vencimiento: e.target.value })}
      />
    );
    const estadoEl = (
      <>
        {f.estado === 'guardada' && (
          <Badge color="green">
            <CheckCircle2 size={12} aria-hidden /> Guardada
          </Badge>
        )}
        {f.estado === 'guardando' && (
          <Badge color="blue">
            <Loader2 size={12} className="animate-spin" aria-hidden /> Guardando
          </Badge>
        )}
        {f.estado === 'error' && <span className="text-xs font-medium text-critico-texto">{f.mensaje}</span>}
        {f.estado === 'pendiente' && error && <span className="text-xs font-medium text-critico-texto">{error}</span>}
      </>
    );
    return { f, fefo, entra, presentacionEl, cantidadEl, vencimientoEl, estadoEl };
  }

  const hayErrorServidor = cargables.some((m) => filas[m.id]?.estado === 'error');
  const terminado = guardadas > 0 && conCantidad.length === 0 && !guardando;

  return (
    <div>
      <PageHeader
        titulo="Carga inicial de inventario"
        subtitulo="Registra de una vez lo que hay hoy en la bodega, con su fecha de vencimiento."
        acciones={
          <>
            <Link to="/inventario/hoja-conteo" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-grafico-neutro px-4 text-sm font-semibold text-white transition-colors hover:bg-azul-noche print:hidden">
              <Printer size={16} aria-hidden="true" />
              Hoja de conteo
            </Link>
            <Link to="/inventario" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-grafico-neutro px-4 text-sm font-semibold text-white transition-colors hover:bg-azul-noche print:hidden">
              <ArrowLeft size={16} aria-hidden="true" />
              Existencias
            </Link>
          </>
        }
      />

      {opciones.isLoading && <LoadingState />}
      {opciones.isError && <ErrorState mensaje="No se pudieron cargar los insumos." onReintentar={() => opciones.refetch()} />}

      {opciones.data && (
        <div className="flex flex-col gap-4">
          <Alert variant="info">
            Escribe solo los insumos que tengas en bodega y deja en blanco el resto. La cantidad va en la presentación que
            cuentas (bultos, cajas, bolsas…). Los insumos por vencimiento (lácteos, huevos, levaduras) exigen la fecha del
            empaque más próximo a vencer. Lo que escribas se guarda en este navegador mientras trabajas.
          </Alert>

          {sinOferta.length > 0 && (
            <Alert variant="warning">
              {sinOferta.length} insumo(s) no se pueden cargar porque no tienen proveedor con precio vigente:{' '}
              {sinOferta.map((m) => m.nombre).join(', ')}. Registra su oferta en Proveedores y vuelve.
            </Alert>
          )}

          <ul className="flex flex-col gap-3 sm:hidden">
            {cargables.map((m) => {
              const d = datosFila(m);
              return (
                <li key={m.id} className={`rounded-tarjeta border border-linea p-3 ${d.f.estado === 'guardada' ? 'bg-exito-fondo/40' : 'bg-white'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-grafito">{m.nombre}</div>
                      <div className="text-xs text-gris-texto">
                        {m.codigo}
                        {d.fefo ? ' · por vencimiento' : ''}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">{d.estadoEl}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-gris-texto">
                      Presentación
                      {d.presentacionEl(`${CAMPO_MOVIL} w-full`)}
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-gris-texto">
                      Cantidad
                      {d.cantidadEl(`${CAMPO_MOVIL} w-full`)}
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-gris-texto">
                      Vence
                      {d.vencimientoEl(`${CAMPO_MOVIL} w-full`)}
                    </label>
                  </div>
                  {d.entra !== '—' && <p className="mt-2 text-xs text-gris-texto">Entra al inventario: <strong className="text-grafito">{d.entra}</strong></p>}
                </li>
              );
            })}
          </ul>

          <Card className="hidden overflow-x-auto p-0 sm:block">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-linea text-xs uppercase text-gris-texto">
                <tr>
                  <th className="px-3 py-2">Insumo</th>
                  <th className="px-3 py-2">Presentación</th>
                  <th className="px-3 py-2">Cantidad</th>
                  <th className="px-3 py-2">Entra al inventario</th>
                  <th className="px-3 py-2">Vence</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {cargables.map((m) => {
                  const d = datosFila(m);
                  return (
                    <tr key={m.id} className={`border-b border-linea last:border-0 ${d.f.estado === 'guardada' ? 'bg-exito-fondo/40' : ''}`}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-grafito">{m.nombre}</div>
                        <div className="text-xs text-gris-texto">
                          {m.codigo}
                          {d.fefo ? ' · por vencimiento' : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2">{d.presentacionEl('')}</td>
                      <td className="px-3 py-2">{d.cantidadEl('w-24')}</td>
                      <td className="px-3 py-2 text-gris-texto">{d.entra}</td>
                      <td className="px-3 py-2">{d.vencimientoEl('')}</td>
                      <td className="px-3 py-2">{d.estadoEl}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-linea bg-white px-4 py-3 sm:-mx-6 sm:px-6">
            <div className="text-sm text-grafito">
              <strong>{listas.length}</strong> lista(s) para guardar
              {erroresPorId.size > 0 && <span className="text-critico-texto"> · {erroresPorId.size} con errores</span>}
              {guardadas > 0 && <span className="text-exito-texto"> · {guardadas} ya guardada(s)</span>}
              {fefoSinCantidad > 0 && <span className="text-gris-texto"> · {fefoSinCantidad} insumo(s) por vencimiento sin cantidad</span>}
            </div>
            <div className="flex items-center gap-2">
              {confirmando ? (
                <>
                  <span className="text-sm text-grafito">
                    Se crearán {listas.length} lotes. ¿Confirmas?
                  </span>
                  <Button variant="secondary" onClick={() => setConfirmando(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={guardarTodo}>Sí, guardar</Button>
                </>
              ) : (
                <Button
                  disabled={guardando || listas.length === 0 || erroresPorId.size > 0}
                  onClick={() => setConfirmando(true)}
                >
                  {hayErrorServidor ? 'Reintentar las pendientes' : `Guardar ${listas.length} insumo(s)`}
                </Button>
              )}
            </div>
          </div>

          {terminado && (
            <Alert variant="success">
              Carga terminada: {guardadas} insumo(s) registrados. Revisa las cantidades en{' '}
              <Link to="/inventario" className="font-medium underline">
                Existencias
              </Link>{' '}
              y luego en{' '}
              <Link to="/reposicion" className="font-medium underline">
                Reposición
              </Link>
              .
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}
