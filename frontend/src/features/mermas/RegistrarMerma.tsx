import { useAvisos } from '../../components/feedback/avisosContext';
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
  'min-h-11 w-full rounded-md border border-borde-campo px-3 py-2 text-base focus:outline-hidden focus:ring-2 focus:ring-trigo sm:text-sm';

const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

// Registro de una merma: o se perdió un insumo (se descuenta de su lote) o se perdió masa/producto dentro de una producción
export function RegistrarMerma() {
  const queryClient = useQueryClient();
  const { avisar } = useAvisos();
  const [tipo, setTipo] = useState<Tipo>('insumo');
  const [materiaId, setMateriaId] = useState('');
  const [loteId, setLoteId] = useState('');
  const [produccionId, setProduccionId] = useState('');
  const [causaId, setCausaId] = useState('');
  const [etapa, setEtapa] = useState<EtapaMerma | ''>('');
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
  const producciones = useQuery({ queryKey: ['produccion', 'lista'], queryFn: () => getProducciones(), enabled: tipo === 'produccion' || (tipo === 'insumo' && etapa === 'produccion') });

  const insumos = (inventario.data?.items ?? []).filter((i) => i.stock > 0);
  const lotesConStock = (lotes.data?.lotes ?? []).filter((l) => l.cantidad_disponible > 0);
  // Si el insumo tiene un solo lote con existencias, no hace falta pedir que lo elija
  const loteElegido = loteId || (lotesConStock.length === 1 ? lotesConStock[0].id : '');
  const lote = lotesConStock.find((l) => l.id === loteElegido);
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
        etapa: tipo === 'produccion' ? 'produccion' : (etapa as EtapaMerma),
        cantidad: Math.round(cantidad * 1000) / 1000,
        ...(tipo === 'insumo' ? { lote_id: loteElegido, ...(etapa === 'produccion' && produccionId ? { produccion_id: produccionId } : {}) } : { produccion_id: produccionId }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventario'] }),
        queryClient.invalidateQueries({ queryKey: ['mermas'] }),
        queryClient.invalidateQueries({ queryKey: ['produccion'] }),
      ]);
      setExito(`Merma registrada: ${formatoCantidad(cantidad, unidadFinal)}.${tipo === 'insumo' ? ' Ya se descontó del lote.' : ''}`);
      avisar(`Merma registrada: ${formatoCantidad(cantidad, unidadFinal)}.`);
      setCantidadTexto('');
      setLoteId('');
      setProduccionId('');
      setMateriaId('');
      setEtapa('');
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
    if (tipo === 'insumo' && !loteElegido) return setErrorForm('Elige el lote.');
    if (tipo === 'insumo' && !etapa) return setErrorForm('Elige la etapa en la que se perdió.');
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
    <div className="flex flex-col gap-4 rounded-tarjeta border border-linea bg-tabla p-4 sm:p-5">
      <h2 className="font-display text-lg font-semibold text-azul-noche">Registrar una merma</h2>
      {exito && <Alert variant="success">{exito}</Alert>}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-grafito">¿Qué se perdió?</legend>
        {([
          ['insumo', 'Un insumo', 'Se vence, se cae, se derrama'],
          ['produccion', 'Masa o producto', 'Quemado, masa pasada en una producción'],
        ] as const).map(([valor, titulo, detalle]) => (
          <label
            key={valor}
            className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${tipo === valor ? 'border-azul-noche bg-azul-suave' : 'border-borde-campo bg-white hover:bg-arena'}`}
          >
            <input type="radio" name="tipo-merma" className="mt-1 accent-azul-noche" checked={tipo === valor} onChange={() => cambiarTipo(valor)} />
            <span>
              <span className="block text-sm font-semibold text-azul-noche">{titulo}</span>
              <span className="block text-xs text-gris-texto">{detalle}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {tipo === 'insumo' ? (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor="mm-insumo" className="text-sm font-medium text-grafito">Insumo</label>
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
            {inventario.isError && <span className="text-xs text-critico-texto">No se pudo cargar el inventario. Recarga la página.</span>}
            {inventario.isSuccess && insumos.length === 0 && (
              <span className="text-xs text-gris-texto">No hay insumos con existencias para registrar una merma.</span>
            )}
          </div>
          {materiaId !== '' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="mm-lote" className="text-sm font-medium text-grafito">Lote</label>
              <select
                id="mm-lote"
                className={CAMPO}
                value={loteElegido}
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
              {lotes.isError && <span className="text-xs text-critico-texto">No se pudieron cargar los lotes.</span>}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor="mm-etapa" className="text-sm font-medium text-grafito">¿En qué etapa se perdió?</label>
            <select
              id="mm-etapa"
              className={CAMPO}
              value={etapa}
              onChange={(e) => {
                setEtapa(e.target.value as EtapaMerma | '');
                setProduccionId('');
                setErrorForm(null);
              }}
            >
              <option value="">Elige la etapa</option>
              {ETAPAS.map((e) => (
                <option key={e} value={e}>{ETIQUETA_ETAPA[e]}</option>
              ))}
            </select>
          </div>
          {etapa === 'produccion' && (
            <div className="flex flex-col gap-1">
              <label htmlFor="mm-prod-insumo" className="text-sm font-medium text-grafito">¿De qué producción? (opcional)</label>
              <select
                id="mm-prod-insumo"
                className={CAMPO}
                value={produccionId}
                onChange={(e) => {
                  setProduccionId(e.target.value);
                  setErrorForm(null);
                }}
              >
                <option value="">{producciones.isLoading ? 'Cargando...' : 'Sin producción'}</option>
                {produccionesValidas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.producto} · {new Date(p.fecha).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })} {hora(p.fecha)}
                    {p.estado === 'en_curso' ? ' (en curso)' : ''}
                  </option>
                ))}
              </select>
              <span className="text-xs text-gris-texto">Si la eliges, la merma entra al balance de masas de esa producción. Debe ser una producción que usó este lote.</span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor="mm-produccion" className="text-sm font-medium text-grafito">Producción</label>
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
            <span className="text-xs text-gris-texto">No hay producciones en curso ni finalizadas.</span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="mm-causa" className="text-sm font-medium text-grafito">Causa</label>
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
        {causas.isError && <span className="text-xs text-critico-texto">No se pudieron cargar las causas.</span>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="mm-cantidad" className="text-sm font-medium text-grafito">
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
            onKeyDown={(e) => e.key === 'Enter' && enviar()}
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
        {cantidadValida && <span className="text-xs text-gris-texto">Se registrarán {formatoCantidad(cantidad, unidadFinal)}.</span>}
        {lote && <span className="text-xs text-gris-texto">El lote tiene {formatoCantidad(lote.cantidad_disponible, unidadInsumo)}.</span>}
      </div>

      {errorForm && <Alert variant="error">{errorForm}</Alert>}
      {registrar.isError && <Alert variant="error">{mensajeDeError(registrar.error, 'No se pudo registrar la merma.')}</Alert>}

      <Button type="button" className="min-h-11" isLoading={registrar.isPending} onClick={enviar}>
        Registrar merma
      </Button>
    </div>
  );
}
