import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { guardarParametros } from '../../services/reposicionService';
import { mensajeDeError } from '../../services/errores';
import type { CambiosParametros, ItemParametros } from '../../types/reposicion.types';
import { leerNumero } from './unidades';

interface Props {
  items: ItemParametros[];
  onTerminar: () => void;
}

// Pone un mismo valor en los insumos que lo tienen vacío (nunca pisa un dato ya cargado).
// Sirve para lo que el administrador dijo que es igual para todos: costo por pedido y plazo de entrega.
export function CompletarVacios({ items, onTerminar }: Props) {
  const queryClient = useQueryClient();
  const [costoPedido, setCostoPedido] = useState('');
  const [plazo, setPlazo] = useState('');
  const [diasSeguridad, setDiasSeguridad] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [avance, setAvance] = useState<{ hechos: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<{ ok: number; fallos: string[] } | null>(null);

  // Solo insumos que se calculan (no los de compra al uso) y solo donde el campo está vacío
  const candidatos = items.filter((i) => (i.parametros?.modo_reposicion ?? 'periodica') === 'periodica');

  function cambiosPara(i: ItemParametros, v: { s: number | null; plazo: number | null; ds: number | null }): CambiosParametros {
    const c: CambiosParametros = {};
    if (v.s !== null && i.parametros?.costo_pedido == null) c.costo_ordenar_s = v.s;
    if (v.plazo !== null && i.parametros?.plazo_dias == null && i.oferta?.plazo_dias == null) c.lead_time_dias = v.plazo;
    if (v.ds !== null && i.parametros?.dias_seguridad == null) c.dias_seguridad = v.ds;
    return c;
  }

  function leer() {
    const s = leerNumero(costoPedido);
    const p = leerNumero(plazo);
    const ds = leerNumero(diasSeguridad);
    if ([s, p, ds].some((n) => n !== null && Number.isNaN(n))) {
      setError('Escribe solo números (por ejemplo 5000).');
      return null;
    }
    if (s === null && p === null && ds === null) {
      setError('Escribe al menos un valor.');
      return null;
    }
    setError(null);
    return { s, plazo: p, ds };
  }

  const cuantos = (() => {
    const s = leerNumero(costoPedido);
    const p = leerNumero(plazo);
    const ds = leerNumero(diasSeguridad);
    const v = { s: Number.isNaN(s) ? null : s, plazo: Number.isNaN(p) ? null : p, ds: Number.isNaN(ds) ? null : ds };
    return candidatos.filter((i) => Object.keys(cambiosPara(i, v)).length > 0).length;
  })();

  async function aplicar() {
    const v = leer();
    if (!v) return;
    const pendientes = candidatos
      .map((i) => ({ i, cambios: cambiosPara(i, v) }))
      .filter((x) => Object.keys(x.cambios).length > 0);
    if (pendientes.length === 0) {
      setError('No hay insumos con esos campos vacíos.');
      return;
    }
    setResultado(null);
    let ok = 0;
    const fallos: string[] = [];
    for (let n = 0; n < pendientes.length; n++) {
      const { i, cambios } = pendientes[n]!;
      setAvance({ hechos: n, total: pendientes.length });
      try {
        await guardarParametros(i.materia_prima_id, cambios);
        ok++;
      } catch (e) {
        fallos.push(`${i.nombre}: ${mensajeDeError(e, 'no se pudo guardar')}`);
      }
    }
    setAvance(null);
    setResultado({ ok, fallos });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['reposicion'] }),
      queryClient.invalidateQueries({ queryKey: ['produccion', 'existencias-bajas'] }),
      queryClient.invalidateQueries({ queryKey: ['produccion', 'que-producir'] }),
    ]);
  }

  const ocupado = avance !== null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-700">
        Llena un mismo valor en todos los insumos donde ese dato esté vacío. Los datos que ya cargaste no se tocan y los insumos que se
        compran según la producción se saltan.
      </p>
      <Input
        id="vac-costo"
        label="Costo de hacer un pedido, en pesos"
        inputMode="decimal"
        placeholder="Ej. 5000"
        value={costoPedido}
        onChange={(e) => setCostoPedido(e.target.value)}
        disabled={ocupado}
      />
      <Input
        id="vac-plazo"
        label="Plazo de entrega, en días"
        inputMode="decimal"
        placeholder="0 si piden y reciben el mismo día"
        value={plazo}
        onChange={(e) => setPlazo(e.target.value)}
        disabled={ocupado}
      />
      <Input
        id="vac-seguridad"
        label="Días de seguridad (opcional)"
        inputMode="decimal"
        value={diasSeguridad}
        onChange={(e) => setDiasSeguridad(e.target.value)}
        disabled={ocupado}
      />
      <p className="text-xs text-gray-500">Se aplicaría a {cuantos} de {candidatos.length} insumos.</p>

      {error && <Alert variant="error">{error}</Alert>}
      {avance && <Alert variant="info">Guardando {avance.hechos + 1} de {avance.total}…</Alert>}
      {resultado && (
        <Alert variant={resultado.fallos.length === 0 ? 'success' : 'warning'}>
          Se actualizaron {resultado.ok} insumos.
          {resultado.fallos.length > 0 && ` No se pudo con ${resultado.fallos.length}: ${resultado.fallos.join('; ')}`}
        </Alert>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onTerminar} disabled={ocupado}>
          {resultado ? 'Cerrar' : 'Cancelar'}
        </Button>
        <Button type="button" onClick={aplicar} isLoading={ocupado} disabled={cuantos === 0}>
          Aplicar
        </Button>
      </div>
    </div>
  );
}
