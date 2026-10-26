import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { aNumero } from '../inventario/esquemaEntrada';
import { formatoCantidad, formatoFecha } from '../inventario/formatos';
import { getInventario, getLotesMateria } from '../../services/inventarioService';
import { mensajeDeError } from '../../services/errores';
import { getCausasMerma, registrarMerma } from '../../services/mermasService';
import { getProducciones } from '../../services/produccionService';
import type { EtapaMerma } from '../../types/merma.types';
import { ETAPAS, ETIQUETA_ETAPA, MERMA_MAX } from './etiquetas';

type Tipo = 'insumo' | 'produccion';

const CAMPO =
  'min-h-11 w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 sm:text-sm';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

// Registro de una merma: o se perdió un insumo (se descuenta de su lote) o se perdió masa/producto dentro de una producción
export function RegistrarMerma() {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<Tipo>('insumo');
  const [materiaId, setMateriaId] = useState('');
  const [loteId, setLoteId] = useState('');
  const [produccionId, setProduccionId] = useState('');
  const [causaId, setCausaId] = useState('');
  const [etapa, setEtapa] = useState<EtapaMerma>('almacenamiento');
  const [cantidadTexto, setCantidadTexto] = useState('');
  const [unidadEntrada, setUnidadEntrada] = useState<'g' | 'kg'>('g');
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const causas = useQuery({ queryKey: ['mermas', 'causas'], queryFn: getCausasMerma });
  const inventario = useQuery({ queryKey: ['inventario', 'resumen'], queryFn: getInventario, enabled: tipo === 'insumo' });
  const lotes = useQuery({
    queryKey: ['inventario', 'lotes', materiaId],
    queryFn: () => getLotesMateria(materiaId),
    enabled: tipo === 'insumo' && materiaId !== '',
  });
  const producciones = useQuery({ queryKey: ['produccion', 'lista'], queryFn: () => getProducciones(), enabled: tipo === 'produccion' });

  const insumos = (inventario.data?.items ?? []).filter((i) => i.stock > 0);
  const lotesConStock = (lotes.data?.lotes ?? []).filter((l) => l.cantidad_disponible > 0);
  const lote = lotesConStock.find((l) => l.id === loteId);
  const unidadInsumo = lotes.data?.materia.unidad ?? 'g';
  const produccionesValidas = (producciones.data ?? []).filter((p) => p.estado === 'en_curso' || p.estado === 'finalizada');

  // Los insumos en gramos se pueden escribir en kilos; la merma de producción siempre va en gramos de masa
  const enGramos = tipo === 'produccion' || unidadInsumo === 'g';
  const factor = enGramos && unidadEntrada === 'kg' ? 1000 : 1;
  const cantidad = aNumero(cantidadTexto) * factor;
  const cantidadValida = cantidadTexto.trim() !== '' && Number.isFinite(cantidad) && cantidad > 0 && cantidad <= MERMA_MAX;
  const unidadFinal = tipo === 'produccion' ? 'g' : unidadInsumo;

  const registrar = useMutation({
    mutationFn: () =>
      registrarMerma({
        causa_id: causaId,
        etapa: tipo === 'produccion' ? 'produccion' : etapa,
        cantidad: Math.round(cantidad * 1000) / 1000,
        ...(tipo === 'insumo' ? { lote_id: loteId } : { produccion_id: produccionId }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventario'] }),
        queryClient.invalidateQueries({ queryKey: ['mermas'] }),
      ]);
      setExito(`Merma registrada: ${formatoCantidad(cantidad, unidadFinal)}.${tipo === 'insumo' ? ' Ya se descontó del lote.' : ''}`);
      setCantidadTexto('');
      setLoteId('');
      setProduccionId('');
      setMateriaId('');
      setErrorForm(null);
    },
  });

  function cambiarTipo(t: Tipo) {
    setTipo(t);
    setMateriaId('');
    setLoteId('');
    setProduccionId('');
    setCantidadTexto('');
    setErrorForm(null);
    setExito(null);
    registrar.reset();
  }

  function enviar() {
    setExito(null);
    registrar.reset();
    if (tipo === 'insumo' && !materiaId) return setErrorForm('Elige el insumo.');
    if (tipo === 'insumo' && !loteId) return setErrorForm('Elige el lote.');
    if (tipo === 'produccion' && !produccionId) return setErrorForm('Elige la producción.');
    if (!causaId) return setErrorForm('Elige la causa.');
    if (!cantidadValida) return setErrorForm(`Escribe una cantidad mayor que 0 y hasta ${MERMA_MAX.toLocaleString('es-CO')} g.`);
    if (tipo === 'insumo' && lote && cantidad > lote.cantidad_disponible) {
      return setErrorForm(`El lote solo tiene ${formatoCantidad(lote.cantidad_disponible, unidadInsumo)}.`);
    }
    setErrorForm(null);
    registrar.mutate();
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 sm:max-w-xl">
      {exito && <Alert variant="success">{exito}</Alert>}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-gray-700">¿Qué se perdió?</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm text-gray-800">
          <input type="radio" name="tipo-merma" checked={tipo === 'insumo'} onChange={() => cambiarTipo('insumo')} />
          Un insumo (se vence, se cae, se derrama)
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-gray-800">
          <input type="radio" name="tipo-merma" checked={tipo === 'produccion'} onChange={() => cambiarTipo('produccion')} />
          Masa o producto de una producción (quemado, masa pasada)
        </label>
      </fieldset>

      {tipo === 'insumo' ? (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="mm-insumo" className="text-sm font-medium text-gray-700">Insumo</label>
            <select
              id="mm-insumo"
              className={CAMPO}
              value={materiaId}
              onChange={(e) => {
                setMateriaId(e.target.value);
                setLoteId('');
                setErrorForm(null);
              }}
            >
              <option value="">{inventario.isLoading ? 'Cargando...' : 'Elige el insumo'}</option>
              {insumos.map((i) => (
                <option key={i.materia_prima_id} value={i.materia_prima_id}>
                  {i.nombre} ({formatoCantidad(i.stock, i.unidad)})
                </option>
              ))}
            </select>
          </div>
          {materiaId !== '' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="mm-lote" className="text-sm font-medium text-gray-700">Lote</label>
              <select
                id="mm-lote"
                className={CAMPO}
                value={loteId}
                onChange={(e) => {
                  setLoteId(e.target.value);
                  setErrorForm(null);
                }}
              >
                <option value="">{lotes.isLoading ? 'Cargando...' : 'Elige el lote'}</option>
                {lotesConStock.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo_lote ?? 'Sin código'} · {formatoCantidad(l.cantidad_disponible, unidadInsumo)}
                    {l.fecha_vencimiento ? ` · vence ${formatoFecha(l.fecha_vencimiento)}` : ''}
                  </option>
                ))}
              </select>
              {lotes.isError && <span className="text-xs text-red-600">No se pudieron cargar los lotes.</span>}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="mm-etapa" className="text-sm font-medium text-gray-700">¿En qué etapa se perdió?</label>
            <select id="mm-etapa" className={CAMPO} value={etapa} onChange={(e) => setEtapa(e.target.value as EtapaMerma)}>
              {ETAPAS.map((e) => (
                <option key={e} value={e}>{ETIQUETA_ETAPA[e]}</option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor="mm-produccion" className="text-sm font-medium text-gray-700">Producción</label>
          <select
            id="mm-produccion"
            className={CAMPO}
            value={produccionId}
            onChange={(e) => {
              setProduccionId(e.target.value);
              setErrorForm(null);
            }}
          >
            <option value="">{producciones.isLoading ? 'Cargando...' : 'Elige la producción'}</option>
            {produccionesValidas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.producto} · {new Date(p.fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} {hora(p.fecha)}
                {p.estado === 'en_curso' ? ' (en curso)' : ''}
              </option>
            ))}
          </select>
          {producciones.isSuccess && produccionesValidas.length === 0 && (
            <span className="text-xs text-gray-500">No hay producciones en curso ni finalizadas.</span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="mm-causa" className="text-sm font-medium text-gray-700">Causa</label>
        <select
          id="mm-causa"
          className={CAMPO}
          value={causaId}
          onChange={(e) => {
            setCausaId(e.target.value);
            setErrorForm(null);
          }}
        >
          <option value="">{causas.isLoading ? 'Cargando...' : 'Elige la causa'}</option>
          {(causas.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
        {causas.isError && <span className="text-xs text-red-600">No se pudieron cargar las causas.</span>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="mm-cantidad" className="text-sm font-medium text-gray-700">
          Cantidad perdida{enGramos ? '' : ` (${unidadInsumo})`}
        </label>
        <div className="flex gap-2">
          <input
            id="mm-cantidad"
            className={CAMPO}
            inputMode="decimal"
            autoComplete="off"
            value={cantidadTexto}
            onChange={(e) => {
              setCantidadTexto(e.target.value);
              setErrorForm(null);
            }}
          />
          {enGramos && (
            <select
              aria-label="Unidad"
              className={`${CAMPO} sm:w-28`}
              value={unidadEntrada}
              onChange={(e) => setUnidadEntrada(e.target.value as 'g' | 'kg')}
            >
              <option value="g">gramos</option>
              <option value="kg">kilos</option>
            </select>
          )}
        </div>
        {cantidadValida && <span className="text-xs text-gray-500">Se registrarán {formatoCantidad(cantidad, unidadFinal)}.</span>}
        {lote && <span className="text-xs text-gray-500">El lote tiene {formatoCantidad(lote.cantidad_disponible, unidadInsumo)}.</span>}
      </div>

      {errorForm && <Alert variant="error">{errorForm}</Alert>}
      {registrar.isError && <Alert variant="error">{mensajeDeError(registrar.error, 'No se pudo registrar la merma.')}</Alert>}

      <Button type="button" className="min-h-11" isLoading={registrar.isPending} onClick={enviar}>
        Registrar merma
      </Button>
    </div>
  );
}
