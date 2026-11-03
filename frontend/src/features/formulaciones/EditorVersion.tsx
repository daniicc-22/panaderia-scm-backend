import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { LoadingState } from '../../components/feedback/LoadingState';
import { ErrorState } from '../../components/feedback/ErrorState';
import { crearProducto, crearVersion, getFormulaciones } from '../../services/formulacionesService';
import { getMateriasPrimas } from '../../services/materiasPrimasService';
import { mensajeDeError } from '../../services/errores';
import type { FormulacionDetalle } from '../../types/formulacion.types';
import {
  INGREDIENTES_MAX,
  filaConSeleccion,
  filaVacia,
  validarEditor,
  validarNombreProducto,
  valorSelector,
  valoresDesdeDetalle,
  type ErroresEditor,
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
  const inicial = useMemo(() => (base ? valoresDesdeDetalle(base) : { rendimiento: '', filas: [filaVacia()] }), [base]);
  const [nombre, setNombre] = useState('');
  const [esIntermedio, setEsIntermedio] = useState(false);
  const [errorNombre, setErrorNombre] = useState<string | undefined>();
  const [rendimiento, setRendimiento] = useState(inicial.rendimiento);
  const [filas, setFilas] = useState<FilaEditor[]>(inicial.filas);
  const [errores, setErrores] = useState<ErroresEditor>({ filas: {} });
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

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

  const guardar = useMutation({
    mutationFn: ({ nombreProducto, datos }: { nombreProducto: string; datos: Parameters<typeof crearVersion>[1] }) =>
      base ? crearVersion(base.id, datos) : crearProducto({ nombre: nombreProducto, es_intermedio: esIntermedio, ...datos }),
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

  function enviar(e: FormEvent) {
    e.preventDefault();
    setErrorServidor(null);
    let nombreProducto = '';
    let nombreMal = false;
    if (!base) {
      const n = validarNombreProducto(nombre);
      if (n.ok) nombreProducto = n.nombre;
      else nombreMal = true;
      setErrorNombre(n.ok ? undefined : n.error);
    }
    const resultado = validarEditor({ rendimiento, filas }, idsActivas);
    if (!resultado.ok) setErrores(resultado.errores);
    if (nombreMal || !resultado.ok) return;
    setErrores({ filas: {} });
    guardar.mutate({ nombreProducto, datos: resultado.datos });
  }

  if (materias.isLoading || formulaciones.isLoading) return <LoadingState mensaje="Cargando insumos..." />;
  if (materias.isError || formulaciones.isError) {
    return <ErrorState onReintentar={() => void Promise.all([materias.refetch(), formulaciones.refetch()])} />;
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <Alert variant="info">
        {!base
          ? 'Se crea el producto con su primera versión (v1), ya vigente. Cuenta en el ABC con el supuesto de 6 lotes por semana hasta que exista el plan de producción.'
          : base.activa
            ? 'Al guardar se crea una versión nueva y la actual queda como anterior (con su fecha de cierre). Cambiará el costo del lote y el ABC.'
            : `Se crea una versión nueva con estos valores, que pasa a ser la vigente. La versión vigente queda como anterior; la v${base.version} no se modifica. Cambiará el costo del lote y el ABC.`}
      </Alert>

      {!base && (
        <div className="flex flex-col gap-3 sm:max-w-md">
          <Input
            id="prod-nombre"
            label="Nombre del producto"
            maxLength={120}
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            error={errorNombre}
          />
          <label className="flex items-start gap-2 text-sm text-grafito">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={esIntermedio}
              onChange={(e) => setEsIntermedio(e.target.checked)}
            />
            <span>
              <span className="font-medium">Es un producto intermedio</span>
              <span className="block text-xs text-gris-texto">
                Una masa base o una galleta que se usa como ingrediente de otros productos. Su cantidad se mide en gramos.
              </span>
            </span>
          </label>
        </div>
      )}

      <div className="sm:max-w-xs">
        <Input
          id="ver-rendimiento"
          label="Rinde (unidades por lote)"
          inputMode="decimal"
          value={rendimiento}
          onChange={(e) => setRendimiento(e.target.value)}
          error={errores.rendimiento}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="hidden gap-2 text-xs font-semibold uppercase tracking-wide text-gris-texto sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <span>Ingrediente</span>
          <span>Cantidad</span>
          <span>Tolerancia %</span>
          <span className="w-16" />
        </div>

        {filas.map((fila, i) => {
          const err = errores.filas[fila.clave] ?? {};
          const filaIntermedio = !!fila.producto_intermedio_id;
          const materia = fila.materia_prima_id ? porId.get(fila.materia_prima_id) : undefined;
          const unidad = materia?.unidad ?? fila.unidad;
          const enLista = !!fila.materia_prima_id && idsActivas.has(fila.materia_prima_id);
          return (
            <div
              key={fila.clave}
              className="grid grid-cols-1 gap-2 rounded-md border border-linea p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start sm:border-0 sm:p-0"
            >
              <Select
                aria-label={`Ingrediente ${i + 1}`}
                value={valorSelector(fila)}
                onChange={(e) =>
                  setFilas((actuales) =>
                    actuales.map((f) =>
                      f.clave === fila.clave
                        ? filaConSeleccion(f, e.target.value, (id) => intermedioPorId.get(id)?.producto ?? '')
                        : f,
                    ),
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
                    <option
                      key={m.id}
                      value={`m:${m.id}`}
                      disabled={m.id !== fila.materia_prima_id && filas.some((o) => o.materia_prima_id === m.id)}
                    >
                      {m.codigo} · {m.nombre}
                    </option>
                  ))}
                </optgroup>
                {intermedios.length > 0 && (
                  <optgroup label="Productos intermedios">
                    {intermedios.map((f) => (
                      <option
                        key={f.producto_id}
                        value={`i:${f.producto_id}`}
                        disabled={
                          f.producto_id !== fila.producto_intermedio_id &&
                          filas.some((o) => o.producto_intermedio_id === f.producto_id)
                        }
                      >
                        {f.producto}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>

              <Input
                aria-label={`Cantidad del ingrediente ${i + 1}`}
                inputMode="decimal"
                placeholder={unidad ? `en ${unidad}` : 'Cantidad'}
                value={fila.cantidad}
                onChange={(e) => cambiarFila(fila.clave, { cantidad: e.target.value })}
                error={err.cantidad}
              />
              <Input
                aria-label={`Tolerancia del ingrediente ${i + 1}`}
                inputMode="decimal"
                placeholder="Opcional"
                value={fila.tolerancia}
                onChange={(e) => cambiarFila(fila.clave, { tolerancia: e.target.value })}
                error={err.tolerancia}
              />
              <button
                type="button"
                className="w-16 py-2 text-left text-sm font-medium text-critico-texto hover:underline"
                onClick={() => setFilas((actuales) => actuales.filter((f) => f.clave !== fila.clave))}
              >
                Quitar
              </button>
            </div>
          );
        })}

        {errores.general && <span className="text-xs text-critico-texto">{errores.general}</span>}

        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={filas.length >= INGREDIENTES_MAX}
            onClick={() => setFilas((actuales) => [...actuales, filaVacia()])}
          >
            Agregar ingrediente
          </Button>
        </div>
      </div>

      {errorServidor && <Alert variant="error">{errorServidor}</Alert>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onTerminar} disabled={guardar.isPending}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={guardar.isPending}>
          {base ? 'Guardar como versión nueva' : 'Crear producto'}
        </Button>
      </div>
    </form>
  );
}
