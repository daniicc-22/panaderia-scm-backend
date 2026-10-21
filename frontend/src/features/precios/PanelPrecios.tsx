import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Spinner } from '../../components/ui/Spinner';
import {
  crearOferta,
  crearPresentacion,
  editarOferta,
  editarPresentacion,
  getPreciosMateria,
} from '../../services/preciosService';
import { getProveedores } from '../../services/proveedoresService';
import { mensajeDeError } from '../../services/errores';
import type { OfertaPrecio, PresentacionPrecios } from '../../types/precios.types';
import { formatoCantidad, formatoPesos, leerNumero } from './numeros';

// Todo lo que depende de un precio debe recargarse al cambiarlo
function useRefrescarCostos() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      ['precios', 'materias-primas', 'formulaciones', 'formulacion', 'clasificacion-abc'].map((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      ),
    );
}

const ayudaNumero = 'Usa coma o punto para decimales, sin separador de miles.';

// ---------- Presentación: crear ----------

function FormPresentacion({
  materiaId,
  unidad,
  presentacion,
  onTerminar,
}: {
  materiaId: string;
  unidad: string;
  presentacion?: PresentacionPrecios;
  onTerminar: () => void;
}) {
  const refrescar = useRefrescarCostos();
  const [nombre, setNombre] = useState(presentacion?.nombre ?? '');
  const [contenido, setContenido] = useState(presentacion ? String(presentacion.contenido) : '');
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: (datos: { nombre: string; contenido: number }) =>
      presentacion ? editarPresentacion(presentacion.id, datos) : crearPresentacion(materiaId, datos),
    onSuccess: async () => {
      await refrescar();
      onTerminar();
    },
    onError: (e) => setError(mensajeDeError(e, 'No se pudo guardar la presentación.')),
  });

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = nombre.trim().replace(/\s+/g, ' ');
    const c = leerNumero(contenido);
    if (n.length < 2 || n.length > 100) return setError('El nombre debe tener entre 2 y 100 caracteres.');
    if (c === null || c <= 0) return setError(`El contenido debe ser un número mayor que 0. ${ayudaNumero}`);
    guardar.mutate({ nombre: n, contenido: c });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-md border border-gray-200 bg-gray-50 p-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Nombre (ej. Bulto 50 kg)" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} />
        <Input
          label={`Contenido (en ${unidad})`}
          inputMode="decimal"
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
        />
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onTerminar} disabled={guardar.isPending}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={guardar.isPending}>
          {presentacion ? 'Guardar presentación' : 'Crear presentación'}
        </Button>
      </div>
    </form>
  );
}

// ---------- Oferta: crear ----------

function FormOferta({ presentacion, onTerminar }: { presentacion: PresentacionPrecios; onTerminar: () => void }) {
  const refrescar = useRefrescarCostos();
  const proveedores = useQuery({ queryKey: ['proveedores'], queryFn: getProveedores });
  const [proveedorId, setProveedorId] = useState('');
  const [precio, setPrecio] = useState('');
  const [entrega, setEntrega] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Solo proveedores activos que aún no tengan precio en esta presentación
  const usados = new Set(presentacion.ofertas.map((o) => o.proveedor_id));
  const disponibles = (proveedores.data ?? []).filter((p) => p.activo && !usados.has(p.id));

  const guardar = useMutation({
    mutationFn: (datos: { proveedor_id: string; precio_referencia: number; tiempo_entrega_dias: number | null }) =>
      crearOferta(presentacion.id, datos),
    onSuccess: async () => {
      await refrescar();
      onTerminar();
    },
    onError: (e) => setError(mensajeDeError(e, 'No se pudo guardar el precio.')),
  });

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const p = leerNumero(precio);
    const d = entrega.trim() === '' ? null : leerNumero(entrega);
    if (!proveedorId) return setError('Elige un proveedor.');
    if (p === null || p <= 0) return setError(`El precio debe ser un número mayor que 0. ${ayudaNumero}`);
    if (d !== null && d > 365) return setError('El tiempo de entrega no puede superar 365 días.');
    if (entrega.trim() !== '' && d === null) return setError('El tiempo de entrega debe ser un número de días.');
    guardar.mutate({ proveedor_id: proveedorId, precio_referencia: p, tiempo_entrega_dias: d });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-md border border-gray-200 bg-gray-50 p-3" noValidate>
      {proveedores.isLoading ? (
        <Spinner />
      ) : proveedores.isError ? (
        <Alert variant="error">No se pudieron cargar los proveedores.</Alert>
      ) : disponibles.length === 0 ? (
        <Alert variant="info">
          No hay proveedores activos disponibles para esta presentación. Crea uno en la pantalla Proveedores o reactiva
          uno existente.
        </Alert>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="Proveedor" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
            <option value="">Elige…</option>
            {disponibles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
          <Input label="Precio (COP)" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
          <Input
            label="Entrega en días (opcional)"
            inputMode="decimal"
            value={entrega}
            onChange={(e) => setEntrega(e.target.value)}
          />
        </div>
      )}
      {error && <Alert variant="error">{error}</Alert>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onTerminar} disabled={guardar.isPending}>
          Cancelar
        </Button>
        {disponibles.length > 0 && (
          <Button type="submit" isLoading={guardar.isPending}>
            Guardar precio
          </Button>
        )}
      </div>
    </form>
  );
}

// ---------- Oferta: fila con edición ----------

function FilaOferta({ oferta, aplicada }: { oferta: OfertaPrecio; aplicada: boolean }) {
  const refrescar = useRefrescarCostos();
  const [editando, setEditando] = useState(false);
  const [precio, setPrecio] = useState(String(oferta.precio));
  const [entrega, setEntrega] = useState(oferta.tiempo_entrega_dias == null ? '' : String(oferta.tiempo_entrega_dias));
  const [error, setError] = useState<string | null>(null);

  const cambiar = useMutation({
    mutationFn: (cambios: { precio_referencia?: number; tiempo_entrega_dias?: number | null; vigente?: boolean }) =>
      editarOferta(oferta.id, cambios),
    onSuccess: async () => {
      await refrescar();
      setEditando(false);
    },
    onError: (e) => setError(mensajeDeError(e, 'No se pudo guardar el cambio.')),
  });

  function guardarEdicion() {
    setError(null);
    const p = leerNumero(precio);
    const d = entrega.trim() === '' ? null : leerNumero(entrega);
    if (p === null || p <= 0) return setError(`Precio inválido. ${ayudaNumero}`);
    if (entrega.trim() !== '' && (d === null || d > 365)) return setError('Entrega: días entre 0 y 365.');
    cambiar.mutate({ precio_referencia: p, tiempo_entrega_dias: d });
  }

  let estado: React.ReactNode;
  if (aplicada) estado = <Badge color="blue">Precio aplicado</Badge>;
  else if (oferta.cuenta) estado = <Badge color="green">Cuenta</Badge>;
  else if (!oferta.vigente) estado = <Badge color="gray">No vigente</Badge>;
  else if (!oferta.proveedor_activo) estado = <Badge color="yellow">Proveedor inactivo</Badge>;
  else estado = <Badge color="gray">No cuenta</Badge>;

  return (
    <>
      <tr className="border-t border-gray-100">
        <td className="py-2 pr-3 font-medium text-gray-900">{oferta.proveedor}</td>
        <td className="py-2 pr-3">
          {editando ? (
            <input
              aria-label="Precio"
              className="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm"
              inputMode="decimal"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
            />
          ) : (
            formatoPesos.format(oferta.precio)
          )}
        </td>
        <td className="py-2 pr-3 text-gray-600">
          {oferta.costo_por_unidad_base == null ? '—' : formatoPesos.format(oferta.costo_por_unidad_base)}
        </td>
        <td className="py-2 pr-3">
          {editando ? (
            <input
              aria-label="Entrega en días"
              className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm"
              inputMode="decimal"
              value={entrega}
              onChange={(e) => setEntrega(e.target.value)}
            />
          ) : oferta.tiempo_entrega_dias == null ? (
            '—'
          ) : (
            `${formatoCantidad.format(oferta.tiempo_entrega_dias)} d`
          )}
        </td>
        <td className="py-2 pr-3">{estado}</td>
        <td className="py-2">
          <div className="flex gap-3 whitespace-nowrap text-sm">
            {editando ? (
              <>
                <button
                  type="button"
                  className="font-medium text-blue-600 hover:underline disabled:opacity-50"
                  disabled={cambiar.isPending}
                  onClick={guardarEdicion}
                >
                  Guardar
                </button>
                <button
                  type="button"
                  className="font-medium text-gray-600 hover:underline"
                  disabled={cambiar.isPending}
                  onClick={() => {
                    setEditando(false);
                    setError(null);
                  }}
                >
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="font-medium text-blue-600 hover:underline disabled:opacity-50"
                  disabled={cambiar.isPending}
                  onClick={() => setEditando(true)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className={`font-medium hover:underline disabled:opacity-50 ${oferta.vigente ? 'text-red-600' : 'text-green-700'}`}
                  disabled={cambiar.isPending}
                  onClick={() => {
                    setError(null);
                    cambiar.mutate({ vigente: !oferta.vigente });
                  }}
                >
                  {oferta.vigente ? 'Quitar vigencia' : 'Vigente'}
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={6} className="pb-2">
            <Alert variant="error">{error}</Alert>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------- Presentación: tarjeta ----------

function TarjetaPresentacion({
  materiaId,
  unidad,
  presentacion,
  ofertaAplicadaId,
}: {
  materiaId: string;
  unidad: string;
  presentacion: PresentacionPrecios;
  ofertaAplicadaId: string | null;
}) {
  const refrescar = useRefrescarCostos();
  const [editando, setEditando] = useState(false);
  const [agregando, setAgregando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cambiarEstado = useMutation({
    mutationFn: (activa: boolean) => editarPresentacion(presentacion.id, { activa }),
    onSuccess: refrescar,
    onError: (e) => setError(mensajeDeError(e, 'No se pudo cambiar el estado de la presentación.')),
  });

  return (
    <div className={`rounded-lg border p-4 ${presentacion.activa ? 'border-gray-200' : 'border-gray-200 bg-gray-50'}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className={`font-semibold ${presentacion.activa ? 'text-gray-900' : 'text-gray-400'}`}>
            {presentacion.nombre}
          </h3>
          <span className="text-sm text-gray-500">
            {formatoCantidad.format(presentacion.contenido)} {unidad}
          </span>
          {!presentacion.activa && <Badge color="gray">Inactiva</Badge>}
        </div>
        <div className="flex gap-3 text-sm">
          <button
            type="button"
            className="font-medium text-blue-600 hover:underline"
            onClick={() => setEditando((v) => !v)}
          >
            {editando ? 'Cerrar edición' : 'Editar'}
          </button>
          <button
            type="button"
            className={`font-medium hover:underline disabled:opacity-50 ${presentacion.activa ? 'text-red-600' : 'text-green-700'}`}
            disabled={cambiarEstado.isPending}
            onClick={() => {
              setError(null);
              cambiarEstado.mutate(!presentacion.activa);
            }}
          >
            {presentacion.activa ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {editando && (
        <div className="mb-3">
          <FormPresentacion
            materiaId={materiaId}
            unidad={unidad}
            presentacion={presentacion}
            onTerminar={() => setEditando(false)}
          />
        </div>
      )}

      {presentacion.ofertas.length === 0 ? (
        <p className="text-sm text-gray-500">Aún no hay precios de proveedores para esta presentación.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-gray-500">
                <th className="pb-1 pr-3 font-medium">Proveedor</th>
                <th className="pb-1 pr-3 font-medium">Precio</th>
                <th className="pb-1 pr-3 font-medium">Por {unidad}</th>
                <th className="pb-1 pr-3 font-medium">Entrega</th>
                <th className="pb-1 pr-3 font-medium">Estado</th>
                <th className="pb-1 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {presentacion.ofertas.map((o) => (
                <FilaOferta key={o.id} oferta={o} aplicada={o.id === ofertaAplicadaId} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3">
        {agregando ? (
          <FormOferta presentacion={presentacion} onTerminar={() => setAgregando(false)} />
        ) : (
          <Button type="button" variant="secondary" onClick={() => setAgregando(true)}>
            Agregar precio de un proveedor
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- Panel ----------

export function PanelPrecios({ materiaId }: { materiaId: string }) {
  const [creando, setCreando] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['precios', 'materia', materiaId],
    queryFn: () => getPreciosMateria(materiaId),
  });

  if (isLoading) return <Spinner />;
  if (isError || !data) {
    return (
      <Alert variant="error">
        No se pudieron cargar los precios.{' '}
        <button type="button" className="font-medium underline" onClick={() => refetch()}>
          Reintentar
        </button>
      </Alert>
    );
  }

  const { materia, precio_aplicado: aplicado, presentaciones } = data;
  const presAplicada = presentaciones.find((p) => p.id === aplicado?.presentacion_id);
  const ofertaAplicada = presAplicada?.ofertas.find((o) => o.id === aplicado?.oferta_id);

  return (
    <div className="flex flex-col gap-4">
      {aplicado && presAplicada ? (
        <Alert variant="success">
          Precio que se usa en los costos: <span className="font-medium">{presAplicada.nombre}</span>
          {ofertaAplicada ? ` de ${ofertaAplicada.proveedor}` : ''} a {formatoPesos.format(aplicado.precio)}, o sea{' '}
          <span className="font-medium">
            {formatoPesos.format(aplicado.costo_por_unidad_base)} por {materia.unidad}
          </span>
          .
        </Alert>
      ) : (
        <Alert variant="warning">
          Esta materia prima no tiene un precio que cuente. Sin él, las formulaciones que la usan quedan con costo
          incompleto. Agrega un precio de un proveedor activo.
        </Alert>
      )}

      <p className="text-xs text-gray-500">
        Se usa la presentación activa de mayor contenido que tenga un precio vigente de un proveedor activo y, dentro de
        ella, el precio más bajo.
      </p>

      {presentaciones.length === 0 && (
        <p className="text-sm text-gray-500">Esta materia prima aún no tiene presentaciones.</p>
      )}

      {presentaciones.map((p) => (
        <TarjetaPresentacion
          key={p.id}
          materiaId={materiaId}
          unidad={materia.unidad}
          presentacion={p}
          ofertaAplicadaId={aplicado?.oferta_id ?? null}
        />
      ))}

      {creando ? (
        <FormPresentacion materiaId={materiaId} unidad={materia.unidad} onTerminar={() => setCreando(false)} />
      ) : (
        <div>
          <Button type="button" onClick={() => setCreando(true)}>
            Nueva presentación
          </Button>
        </div>
      )}
    </div>
  );
}
