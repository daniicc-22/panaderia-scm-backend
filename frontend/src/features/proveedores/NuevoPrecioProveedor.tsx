import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Plus, Search, X } from 'lucide-react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { crearOferta, crearPresentacion } from '../../services/preciosService';
import { getPreciosMateria } from '../../services/preciosService';
import { getMateriasPrimas } from '../../services/materiasPrimasService';
import { mensajeDeError } from '../../services/errores';
import { formatoCantidad, formatoPesos, leerNumero } from '../precios/numeros';
import type { MateriaPrima } from '../../types/materiaPrima.types';
import { useRefrescarPrecios } from './refrescarPrecios';

const sinTildes = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const campo =
  'min-h-11 w-full rounded-lg border border-borde-campo bg-white px-3 text-sm text-grafito placeholder:text-gris-texto focus:outline-hidden focus:ring-2 focus:ring-trigo';

// Costo por unidad: por kilo cuando la unidad base es el gramo, que se lee mejor
function costoPorUnidad(precio: number, contenido: number, unidad: string): string {
  if (contenido <= 0) return '—';
  const c = precio / contenido;
  return unidad === 'g' ? `${formatoPesos.format(c * 1000)} / kg` : `${formatoPesos.format(c)} / ${unidad}`;
}

interface Props {
  proveedorId: string;
  nombreProveedor: string;
  onTerminar: () => void;
}

// Registra el precio de un insumo para este proveedor sin salir de su oferta
export function NuevoPrecioProveedor({ proveedorId, nombreProveedor, onTerminar }: Props) {
  const refrescar = useRefrescarPrecios();
  const materias = useQuery({ queryKey: ['materias-primas', 'activas'], queryFn: getMateriasPrimas });

  const [busqueda, setBusqueda] = useState('');
  const [materia, setMateria] = useState<MateriaPrima | null>(null);
  // id de una presentación existente, o 'nueva'
  const [presentacionId, setPresentacionId] = useState<string>('');
  const [nombrePres, setNombrePres] = useState('');
  const [contenidoPres, setContenidoPres] = useState('');
  const [precio, setPrecio] = useState('');
  const [entrega, setEntrega] = useState('');
  const [error, setError] = useState<string | null>(null);

  const precios = useQuery({
    queryKey: ['precios', 'materia', materia?.id],
    queryFn: () => getPreciosMateria(materia!.id),
    enabled: materia !== null,
  });

  const coincidencias = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    return (materias.data ?? [])
      .filter((m) => m.activa && (!q || sinTildes(`${m.nombre} ${m.codigo}`).includes(q)))
      .slice(0, 30);
  }, [materias.data, busqueda]);

  const presentaciones = (precios.data?.presentaciones ?? []).filter((p) => p.activa);
  const elegida = presentaciones.find((p) => p.id === presentacionId) ?? null;
  const unidad = materia?.unidad ?? '';

  const guardar = useMutation({
    mutationFn: async (v: { precio: number; entrega: number | null; nueva: { nombre: string; contenido: number } | null }) => {
      let idPres = presentacionId;
      if (v.nueva) {
        const creada = (await crearPresentacion(materia!.id, v.nueva)) as { id: string };
        idPres = creada.id;
      }
      return crearOferta(idPres, { proveedor_id: proveedorId, precio_referencia: v.precio, tiempo_entrega_dias: v.entrega });
    },
    onSuccess: async () => {
      await refrescar();
      onTerminar();
    },
    onError: (e) => setError(mensajeDeError(e, 'No se pudo registrar el precio.')),
  });

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!materia) return setError('Elige el insumo.');
    if (presentacionId === '') return setError('Elige la presentación o crea una nueva.');
    const p = leerNumero(precio);
    if (p === null || p <= 0) return setError('El precio debe ser un número mayor que 0 (usa coma o punto para decimales, sin separador de miles).');
    const d = entrega.trim() === '' ? null : leerNumero(entrega);
    if (entrega.trim() !== '' && (d === null || d > 365)) return setError('La entrega debe ser de 0 a 365 días.');
    let nueva: { nombre: string; contenido: number } | null = null;
    if (presentacionId === 'nueva') {
      const c = leerNumero(contenidoPres);
      if (nombrePres.trim().length < 2) return setError('Escribe el nombre de la presentación (por ejemplo, «Bulto 50 kg»).');
      if (c === null || c <= 0) return setError(`El contenido debe ser un número mayor que 0, en ${unidad}.`);
      nueva = { nombre: nombrePres.trim(), contenido: c };
    }
    guardar.mutate({ precio: p, entrega: d, nueva });
  }

  const precioNum = leerNumero(precio);
  const contenidoVista = presentacionId === 'nueva' ? leerNumero(contenidoPres) : (elegida?.contenido ?? null);

  return (
    <form onSubmit={enviar} className="flex flex-col gap-5 rounded-tarjeta border border-linea bg-white p-4 sm:p-5" noValidate>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-azul-noche">Agregar un precio</h3>
          <p className="text-sm text-gris-texto">Lo que cobra {nombreProveedor} por un insumo. Con él se calculan los costos y las compras.</p>
        </div>
        <button type="button" onClick={onTerminar} aria-label="Cerrar" className="rounded-md p-1.5 text-gris-texto hover:bg-arena">
          <X size={18} />
        </button>
      </div>

      {/* 1. Insumo */}
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-grafito">1. ¿Qué insumo?</p>
        {materia ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-azul-noche bg-azul-suave px-3 py-2.5">
            <p className="text-sm font-semibold text-azul-noche">
              {materia.nombre} <span className="cifras ml-1 text-xs font-medium text-gris-texto">{materia.codigo}</span>
            </p>
            <button
              type="button"
              className="text-sm font-semibold text-pizarra hover:underline"
              onClick={() => {
                setMateria(null);
                setPresentacionId('');
              }}
            >
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gris-texto" />
              <input
                type="search"
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Busca por nombre o código"
                aria-label="Buscar insumo"
                className={`${campo} pl-10`}
              />
            </div>
            <ul className="max-h-48 overflow-y-auto rounded-lg border border-linea bg-tabla">
              {materias.isLoading && <li className="px-3 py-3 text-sm text-gris-texto">Cargando insumos…</li>}
              {!materias.isLoading && coincidencias.length === 0 && <li className="px-3 py-3 text-sm text-gris-texto">Ningún insumo coincide.</li>}
              {coincidencias.map((m) => (
                <li key={m.id} className="border-b border-linea last:border-b-0">
                  <button type="button" onClick={() => setMateria(m)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm hover:bg-arena">
                    <span className="font-medium text-grafito">{m.nombre}</span>
                    <span className="text-xs text-gris-texto">{m.categoria ?? 'Sin categoría'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* 2. Presentación */}
      {materia && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-grafito">2. ¿En qué presentación?</p>
          {precios.isLoading ? (
            <p className="text-sm text-gris-texto">Cargando presentaciones…</p>
          ) : precios.isError ? (
            <Alert variant="error">No se pudieron cargar las presentaciones del insumo.</Alert>
          ) : (
            <div className="flex flex-wrap gap-2">
              {presentaciones.map((p) => {
                const yaTiene = p.ofertas.some((o) => o.proveedor_id === proveedorId);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={yaTiene}
                    aria-pressed={presentacionId === p.id}
                    onClick={() => setPresentacionId(p.id)}
                    title={yaTiene ? 'Este proveedor ya tiene precio aquí: cámbialo desde la lista' : undefined}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      presentacionId === p.id ? 'border-azul-noche bg-azul-noche text-white' : 'border-borde-campo bg-white text-azul-noche hover:bg-arena'
                    }`}
                  >
                    {p.nombre}
                    <span className="text-xs font-normal opacity-80">
                      ({formatoCantidad.format(p.contenido)} {unidad})
                    </span>
                    {yaTiene && <span className="text-xs font-normal">· ya tiene precio</span>}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={presentacionId === 'nueva'}
                onClick={() => setPresentacionId('nueva')}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-dashed px-3 text-sm font-semibold transition-colors ${
                  presentacionId === 'nueva' ? 'border-azul-noche bg-azul-noche text-white' : 'border-borde-campo bg-white text-azul-noche hover:bg-arena'
                }`}
              >
                <Plus size={15} aria-hidden="true" />
                Nueva presentación
              </button>
            </div>
          )}
          {presentacionId === 'nueva' && (
            <div className="grid gap-3 rounded-lg bg-hueso p-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm font-semibold text-grafito">
                Nombre
                <input value={nombrePres} onChange={(e) => setNombrePres(e.target.value)} placeholder="Ej. Bulto 50 kg" className={campo} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold text-grafito">
                Contenido, en {unidad}
                <input value={contenidoPres} onChange={(e) => setContenidoPres(e.target.value)} inputMode="decimal" placeholder={unidad === 'g' ? 'Ej. 50000 (un bulto de 50 kg)' : 'Ej. 12'} className={`${campo} cifras`} />
              </label>
            </div>
          )}
        </div>
      )}

      {/* 3. Precio */}
      {materia && presentacionId !== '' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-grafito">3. ¿Cuánto cobra?</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-semibold text-grafito">
              Precio de la presentación
              <span className="relative">
                <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gris-texto">
                  $
                </span>
                <input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" placeholder="Ej. 87150" className={`${campo} cifras pl-8`} />
              </span>
            </label>
            <label className="flex flex-col gap-1 text-sm font-semibold text-grafito">
              <span className="flex items-baseline justify-between">
                Entrega, en días <span className="text-xs font-normal text-gris-texto">Opcional</span>
              </span>
              <input value={entrega} onChange={(e) => setEntrega(e.target.value)} inputMode="decimal" placeholder="Ej. 2" className={`${campo} cifras`} />
            </label>
          </div>
          {precioNum !== null && precioNum > 0 && contenidoVista !== null && contenidoVista > 0 && (
            <p className="rounded-lg bg-info-fondo px-3 py-2 text-sm text-azul-noche">
              Equivale a <strong className="cifras">{costoPorUnidad(precioNum, contenidoVista, unidad)}</strong>
            </p>
          )}
        </div>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex flex-wrap justify-end gap-2 border-t border-linea pt-4">
        <Button type="button" variant="secondary" onClick={onTerminar} disabled={guardar.isPending}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={guardar.isPending} disabled={!materia || presentacionId === ''}>
          <Check size={16} aria-hidden="true" />
          Guardar precio
        </Button>
      </div>
    </form>
  );
}
