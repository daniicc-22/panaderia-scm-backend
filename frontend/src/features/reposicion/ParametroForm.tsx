import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { formatoCantidad } from '../inventario/formatos';
import { guardarParametros } from '../../services/reposicionService';
import { mensajeDeError } from '../../services/errores';
import type { CambiosParametros, ItemParametros, ModoReposicion } from '../../types/reposicion.types';
import { aBase, desdeBase, leerNumero, unidadesDisponibles } from './unidades';

interface Cantidad {
  texto: string;
  unidad: string;
}

const vacia = (base: string): Cantidad => ({ texto: '', unidad: unidadesDisponibles(base)[0] ?? base });
const cantidadDe = (valor: number | null | undefined, base: string): Cantidad =>
  valor === null || valor === undefined ? vacia(base) : desdeBase(valor, base);
const textoDe = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
const redondear = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

// Campo de cantidad con selector de unidad (kg, lb o g cuando el insumo se maneja en gramos)
function CampoCantidad({
  id,
  etiqueta,
  ayuda,
  base,
  valor,
  onCambio,
}: {
  id: string;
  etiqueta: string;
  ayuda?: string;
  base: string;
  valor: Cantidad;
  onCambio: (v: Cantidad) => void;
}) {
  const unidades = unidadesDisponibles(base);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {etiqueta}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          inputMode="decimal"
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={valor.texto}
          onChange={(e) => onCambio({ ...valor, texto: e.target.value })}
        />
        {unidades.length > 1 ? (
          <select
            aria-label={`Unidad de ${etiqueta}`}
            className="rounded-md border border-gray-300 px-2 py-2 text-sm"
            value={valor.unidad}
            onChange={(e) => onCambio({ ...valor, unidad: e.target.value })}
          >
            {unidades.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        ) : (
          <span className="flex items-center text-sm text-gray-500">{base}</span>
        )}
      </div>
      {ayuda && <p className="text-xs text-gray-500">{ayuda}</p>}
    </div>
  );
}

interface Props {
  item: ItemParametros;
  onTerminar: () => void;
}

// Captura de los parámetros de reposición de un insumo. Solo envía lo que cambió; un campo vaciado se borra.
export function ParametroForm({ item, onTerminar }: Props) {
  const queryClient = useQueryClient();
  const p = item.parametros;
  const base = item.unidad;

  const inicial = {
    modo: (p?.modo_reposicion ?? 'periodica') as ModoReposicion,
    consumo: cantidadDe(item.consumo_semanal.declarado, base),
    diasSeguridad: textoDe(p?.dias_seguridad),
    stockMinimo: cantidadDe(p?.stock_minimo, base),
    stockMaximo: cantidadDe(p?.stock_maximo, base),
    vidaUtil: textoDe(p?.vida_util_dias),
    plazo: textoDe(p?.plazo_dias),
    costoPedido: textoDe(p?.costo_pedido),
    tasaPct: p?.tasa_mantenimiento_anual == null ? '' : String(redondear(p.tasa_mantenimiento_anual * 100, 2)),
  };

  const [modo, setModo] = useState<ModoReposicion>(inicial.modo);
  const [consumo, setConsumo] = useState(inicial.consumo);
  const [diasSeguridad, setDiasSeguridad] = useState(inicial.diasSeguridad);
  const [stockMinimo, setStockMinimo] = useState(inicial.stockMinimo);
  const [stockMaximo, setStockMaximo] = useState(inicial.stockMaximo);
  const [vidaUtil, setVidaUtil] = useState(inicial.vidaUtil);
  const [plazo, setPlazo] = useState(inicial.plazo);
  const [costoPedido, setCostoPedido] = useState(inicial.costoPedido);
  const [tasaPct, setTasaPct] = useState(inicial.tasaPct);
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: (cambios: CambiosParametros) => guardarParametros(item.materia_prima_id, cambios),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reposicion'] }),
        queryClient.invalidateQueries({ queryKey: ['produccion', 'existencias-bajas'] }),
        queryClient.invalidateQueries({ queryKey: ['produccion', 'que-producir'] }),
      ]);
      onTerminar();
    },
    onError: (e) => setError(mensajeDeError(e, 'No se pudieron guardar los parámetros.')),
  });

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cambios: CambiosParametros = {};
    const incorrectos: string[] = [];

    // Compara el valor nuevo con el inicial: solo se envía lo que cambió
    const numero = (nombre: string, texto: string, inicialTexto: string, clave: keyof CambiosParametros, convertir?: (n: number) => number) => {
      if (texto.trim() === inicialTexto.trim()) return;
      const n = leerNumero(texto);
      if (n !== null && Number.isNaN(n)) {
        incorrectos.push(nombre);
        return;
      }
      (cambios as Record<string, number | null>)[clave] = n === null ? null : convertir ? convertir(n) : n;
    };
    const cantidad = (nombre: string, nuevo: Cantidad, antes: Cantidad, clave: keyof CambiosParametros) => {
      if (nuevo.texto.trim() === antes.texto.trim() && nuevo.unidad === antes.unidad) return;
      const n = leerNumero(nuevo.texto);
      if (n !== null && Number.isNaN(n)) {
        incorrectos.push(nombre);
        return;
      }
      (cambios as Record<string, number | null>)[clave] = n === null ? null : aBase(n, nuevo.unidad, base);
    };

    if (modo !== inicial.modo) cambios.modo_reposicion = modo;
    cantidad('El consumo semanal', consumo, inicial.consumo, 'consumo_semanal_declarado');
    if (modo === 'periodica') {
      numero('Los días de seguridad', diasSeguridad, inicial.diasSeguridad, 'dias_seguridad');
      cantidad('El stock mínimo', stockMinimo, inicial.stockMinimo, 'stock_minimo');
      cantidad('El stock máximo', stockMaximo, inicial.stockMaximo, 'stock_maximo');
      numero('La vida útil', vidaUtil, inicial.vidaUtil, 'vida_util_dias');
      numero('El plazo de entrega', plazo, inicial.plazo, 'lead_time_dias');
      numero('El costo por pedido', costoPedido, inicial.costoPedido, 'costo_ordenar_s');
      numero('La tasa de mantenimiento', tasaPct, inicial.tasaPct, 'tasa_mantenimiento_anual', (n) => redondear(n / 100, 4));
    }

    if (incorrectos.length > 0) {
      setError(`${incorrectos.join(', ')}: escribe solo números (por ejemplo 2,5).`);
      return;
    }
    if (Object.keys(cambios).length === 0) {
      setError('No hay cambios para guardar.');
      return;
    }
    guardar.mutate(cambios);
  }

  const { declarado, estimado_recetas, real } = item.consumo_semanal;
  const plazoOferta = item.oferta?.plazo_dias ?? null;

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-gray-700">Cómo se maneja este insumo</legend>
        <label className="flex min-h-11 items-start gap-2 rounded-md border border-gray-300 p-3 text-sm text-gray-700">
          <input type="radio" name="modo" className="mt-1" checked={modo === 'periodica'} onChange={() => setModo('periodica')} />
          <span>
            <span className="font-medium">Se calcula cuándo y cuánto pedir</span>
            <span className="block text-xs text-gray-500">Con inventario, entrega semanal del proveedor y stock de seguridad.</span>
          </span>
        </label>
        <label className="flex min-h-11 items-start gap-2 rounded-md border border-gray-300 p-3 text-sm text-gray-700">
          <input type="radio" name="modo" className="mt-1" checked={modo === 'al_uso'} onChange={() => setModo('al_uso')} />
          <span>
            <span className="font-medium">Se compra según la producción</span>
            <span className="block text-xs text-gray-500">Perecedero que no se guarda (p. ej. queso cuajada): no entra en las alertas de compra ni limita qué producir.</span>
          </span>
        </label>
      </fieldset>

      <div className="rounded-md bg-gray-50 p-3 text-xs text-gray-600">
        <p className="font-medium text-gray-700">Consumo por semana de referencia</p>
        <ul className="mt-1 list-disc pl-4">
          <li>Declarado: {declarado === null ? 'sin dato' : formatoCantidad(declarado, base)}</li>
          <li>Estimado con las recetas: {estimado_recetas === null ? 'sin dato' : formatoCantidad(estimado_recetas, base)}</li>
          <li>
            Real: {real === null ? 'sin dato' : `${formatoCantidad(real.semanal, base)} (${real.semanas_observadas} semanas observadas)`}
          </li>
        </ul>
        <p className="mt-1">El consumo real reemplaza al declarado cuando hay 4 semanas o más de producción registrada.</p>
      </div>

      <CampoCantidad
        id="par-consumo"
        etiqueta="Consumo semanal declarado"
        ayuda="Lo que el administrador dice que se gasta en una semana."
        base={base}
        valor={consumo}
        onCambio={setConsumo}
      />

      {modo === 'periodica' && (
        <>
          <Input
            id="par-seguridad"
            label="Días de seguridad"
            inputMode="decimal"
            value={diasSeguridad}
            onChange={(e) => setDiasSeguridad(e.target.value)}
          />
          <p className="-mt-3 text-xs text-gray-500">Días de consumo que se quieren tener de colchón. Si no los defines, se usa el stock mínimo.</p>
          <CampoCantidad id="par-minimo" etiqueta="Stock mínimo (opcional)" base={base} valor={stockMinimo} onCambio={setStockMinimo} />
          <CampoCantidad id="par-maximo" etiqueta="Stock máximo (opcional)" base={base} valor={stockMaximo} onCambio={setStockMaximo} />
          <Input
            id="par-vida"
            label="Tiempo máximo que se prefiere guardar, en días"
            inputMode="decimal"
            value={vidaUtil}
            onChange={(e) => setVidaUtil(e.target.value)}
          />
          <p className="-mt-3 text-xs text-gray-500">Es el tiempo que prefieren tenerlo guardado, no el vencimiento real (ese sale de cada lote).</p>
          <Input id="par-plazo" label="Plazo de entrega, en días" inputMode="decimal" value={plazo} onChange={(e) => setPlazo(e.target.value)} />
          <p className="-mt-3 text-xs text-gray-500">
            0 si lo piden y lo reciben el mismo día.
            {plazoOferta !== null && ` La oferta del proveedor ya dice ${plazoOferta} día(s) y ese valor manda sobre este.`}
          </p>
          <Input
            id="par-costo-pedido"
            label="Costo de hacer un pedido, en pesos"
            inputMode="decimal"
            value={costoPedido}
            onChange={(e) => setCostoPedido(e.target.value)}
          />
          <Input
            id="par-tasa"
            label="Costo anual de mantener el inventario, % del valor"
            inputMode="decimal"
            value={tasaPct}
            onChange={(e) => setTasaPct(e.target.value)}
          />
          <p className="-mt-3 text-xs text-gray-500">Sin este dato no se calcula el EOQ. Es un supuesto del modelo que debe quedar documentado.</p>
        </>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onTerminar} disabled={guardar.isPending}>
          Cancelar
        </Button>
        <Button type="submit" isLoading={guardar.isPending}>
          Guardar
        </Button>
      </div>
    </form>
  );
}
