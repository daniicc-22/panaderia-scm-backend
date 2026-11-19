import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { guardarParametros } from '../../services/reposicionService';
import { mensajeDeError } from '../../services/errores';
import type { CambiosParametros, ItemParametros } from '../../types/reposicion.types';
import { leerNumero } from './unidades';

type Campo = 'costo' | 'plazo' | 'seguridad' | 'tasa';

interface Valores {
  costo: number | null;
  plazo: number | null;
  seguridad: number | null;
  tasa: number | null; // fracción (0.25 = 25 %)
}

const ETIQUETA: Record<Campo, string> = {
  costo: 'Costo por pedido',
  plazo: 'Plazo de entrega',
  seguridad: 'Días de seguridad',
  tasa: 'Costo de mantener',
};

// Solo entran los insumos que se calculan (no los de compra al uso)
const esCandidato = (i: ItemParametros) => (i.parametros?.modo_reposicion ?? 'periodica') === 'periodica';

// Qué campos tiene vacíos un insumo. Un dato ya cargado nunca se pisa.
function vaciosDe(i: ItemParametros): Record<Campo, boolean> {
  const p = i.parametros;
  return {
    costo: p?.costo_pedido == null,
    // La oferta del proveedor manda sobre el plazo del insumo: si ya trae plazo, no hay vacío
    plazo: p?.plazo_dias == null && i.oferta?.plazo_dias == null,
    seguridad: p?.dias_seguridad == null,
    // Si ya hay un costo de mantener dado directamente, la tasa no hace falta
    tasa: p?.tasa_mantenimiento_anual == null && p?.costo_mantener_h == null,
  };
}

// Resumen para la página: cuántos insumos tienen vacío cada campo (sirve para activar o no el botón)
export function resumenVacios(items: ItemParametros[]) {
  const candidatos = items.filter(esCandidato);
  const porCampo: Record<Campo, number> = { costo: 0, plazo: 0, seguridad: 0, tasa: 0 };
  let conVacios = 0;
  for (const i of candidatos) {
    const v = vaciosDe(i);
    let alguno = false;
    (Object.keys(v) as Campo[]).forEach((c) => {
      if (v[c]) {
        porCampo[c]++;
        alguno = true;
      }
    });
    if (alguno) conVacios++;
  }
  return { candidatos: candidatos.length, porCampo, conVacios };
}

function cambiosPara(i: ItemParametros, v: Valores): CambiosParametros {
  const vacio = vaciosDe(i);
  const c: CambiosParametros = {};
  if (v.costo !== null && vacio.costo) c.costo_ordenar_s = v.costo;
  if (v.plazo !== null && vacio.plazo) c.lead_time_dias = v.plazo;
  if (v.seguridad !== null && vacio.seguridad) c.dias_seguridad = v.seguridad;
  if (v.tasa !== null && vacio.tasa) c.tasa_mantenimiento_anual = v.tasa;
  return c;
}

interface Props {
  items: ItemParametros[];
  onTerminar: () => void;
}

interface CampoFormProps {
  id: string;
  campo: Campo;
  titulo: string;
  ayuda: string;
  sufijo: string;
  placeholder: string;
  faltan: number;
  total: number;
  valor: string;
  onCambio: (v: string) => void;
  invalido: boolean;
  ocupado: boolean;
  opcional?: boolean;
}

function CampoVacio({ id, titulo, ayuda, sufijo, placeholder, faltan, total, valor, onCambio, invalido, ocupado, opcional }: CampoFormProps) {
  const completo = faltan === 0;
  return (
    <div className={`rounded-lg border p-3 ${completo ? 'border-linea bg-white/60' : 'border-borde-campo bg-white'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={id} className="text-sm font-semibold text-grafito">
          {titulo}
          {opcional && <span className="ml-1 text-xs font-normal text-gris-texto">(opcional)</span>}
        </label>
        {completo ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-exito-texto">
            <CheckCircle2 aria-hidden className="size-3.5" /> Ya está en los {total}
          </span>
        ) : (
          <span className="text-xs font-medium text-atencion-texto">
            Falta en <span className="cifras">{faltan}</span> de <span className="cifras">{total}</span>
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-gris-texto">{ayuda}</p>
      {!completo && (
        <div className="mt-2 flex items-center gap-2">
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            placeholder={placeholder}
            value={valor}
            onChange={(e) => onCambio(e.target.value)}
            disabled={ocupado}
            aria-invalid={invalido || undefined}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-grafito placeholder:text-gris-texto focus:outline-hidden focus:ring-2 focus:ring-trigo disabled:opacity-60 ${
              invalido ? 'border-critico-texto' : 'border-borde-campo'
            }`}
          />
          <span className="shrink-0 text-sm text-gris-texto">{sufijo}</span>
        </div>
      )}
      {invalido && <p className="mt-1 text-xs font-medium text-critico-texto">Escribe solo números (por ejemplo 5000 o 2,5).</p>}
    </div>
  );
}

// Pone un mismo valor en los insumos que lo tienen vacío (nunca pisa un dato ya cargado).
// Sirve para lo que el administrador dijo que es igual para todos: costo por pedido, plazo de entrega, etc.
export function CompletarVacios({ items, onTerminar }: Props) {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState<Record<Campo, string>>({ costo: '', plazo: '', seguridad: '', tasa: '' });
  const [error, setError] = useState<string | null>(null);
  const [avance, setAvance] = useState<{ hechos: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<{ ok: number; fallos: string[] } | null>(null);

  const { candidatos, porCampo, conVacios } = resumenVacios(items);
  const ocupado = avance !== null;
  const poner = (c: Campo) => (v: string) => {
    setTexto((t) => ({ ...t, [c]: v }));
    setError(null);
  };

  // Lectura de lo escrito: null = vacío, NaN = no es número
  const leidos = {
    costo: leerNumero(texto.costo),
    plazo: leerNumero(texto.plazo),
    seguridad: leerNumero(texto.seguridad),
    tasa: leerNumero(texto.tasa),
  };
  const invalido = (c: Campo) => leidos[c] !== null && Number.isNaN(leidos[c]);
  const hayInvalidos = (Object.keys(leidos) as Campo[]).some(invalido);
  const negativos = (Object.keys(leidos) as Campo[]).some((c) => typeof leidos[c] === 'number' && (leidos[c] as number) < 0);
  const valores: Valores = {
    costo: invalido('costo') ? null : leidos.costo,
    plazo: invalido('plazo') ? null : leidos.plazo,
    seguridad: invalido('seguridad') ? null : leidos.seguridad,
    tasa: invalido('tasa') || leidos.tasa === null ? null : Math.round((leidos.tasa / 100) * 10000) / 10000,
  };
  const hayAlgo = Object.values(valores).some((v) => v !== null);

  const pendientes = candidatos === 0 ? [] : items
    .filter(esCandidato)
    .map((i) => ({ i, cambios: cambiosPara(i, valores) }))
    .filter((x) => Object.keys(x.cambios).length > 0);

  async function aplicar(e?: React.FormEvent) {
    e?.preventDefault();
    if (ocupado) return;
    if (hayInvalidos) return setError('Revisa los campos marcados: escribe solo números.');
    if (negativos) return setError('Los valores no pueden ser negativos.');
    if (!hayAlgo) return setError('Escribe al menos un valor para completar.');
    if (pendientes.length === 0) return setError('Ningún insumo tiene vacíos en los datos que escribiste.');
    setError(null);
    setResultado(null);
    let ok = 0;
    const fallos: string[] = [];
    for (let n = 0; n < pendientes.length; n++) {
      const { i, cambios } = pendientes[n]!;
      setAvance({ hechos: n, total: pendientes.length });
      try {
        await guardarParametros(i.materia_prima_id, cambios);
        ok++;
      } catch (err) {
        fallos.push(`${i.nombre}: ${mensajeDeError(err, 'no se pudo guardar')}`);
      }
    }
    setAvance(null);
    setResultado({ ok, fallos });
    setTexto({ costo: '', plazo: '', seguridad: '', tasa: '' });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['reposicion'] }),
      queryClient.invalidateQueries({ queryKey: ['produccion', 'existencias-bajas'] }),
      queryClient.invalidateQueries({ queryKey: ['produccion', 'que-producir'] }),
    ]);
  }

  const cabecera = resultado && (
    <Alert variant={resultado.fallos.length === 0 ? 'success' : 'warning'}>
      {resultado.ok > 0 && <>Se completaron {resultado.ok} {resultado.ok === 1 ? 'insumo' : 'insumos'}. </>}
      {resultado.fallos.length > 0 && (
        <>
          No se pudo con {resultado.fallos.length}:
          <ul className="mt-1 list-disc pl-5">
            {resultado.fallos.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </>
      )}
    </Alert>
  );

  // Nada por completar: no hay nada que escribir
  if (conVacios === 0) {
    return (
      <div className="flex flex-col gap-4">
        {cabecera}
        <div className="flex flex-col items-center gap-2 rounded-lg bg-white px-4 py-8 text-center">
          <CheckCircle2 aria-hidden className="size-9 text-verde-bosque" />
          <p className="font-display text-base font-semibold text-azul-noche">Todos los insumos tienen sus datos</p>
          <p className="max-w-sm text-sm text-gris-texto">
            Los {candidatos} insumos que se calculan ya tienen costo por pedido, plazo, días de seguridad y costo de mantener. Para cambiar uno,
            usa «Editar» en su fila.
          </p>
        </div>
        <div className="flex justify-end">
          <Button type="button" onClick={onTerminar}>
            Cerrar
          </Button>
        </div>
      </div>
    );
  }

  const comunes = { total: candidatos, ocupado };

  return (
    <form onSubmit={aplicar} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-grafito">
        Escribe un valor y se pone en todos los insumos que lo tienen vacío. <strong className="font-semibold">Lo que ya cargaste no se cambia</strong>, y los
        insumos que se compran según la producción se saltan.
      </p>

      {cabecera}

      <CampoVacio
        {...comunes}
        id="vac-costo"
        campo="costo"
        titulo="Costo de hacer un pedido"
        ayuda="Lo que cuesta cada pedido al proveedor (transporte, tiempo, llamadas)."
        sufijo="pesos"
        placeholder="Ej. 5000"
        faltan={porCampo.costo}
        valor={texto.costo}
        onCambio={poner('costo')}
        invalido={invalido('costo')}
      />
      <CampoVacio
        {...comunes}
        id="vac-plazo"
        campo="plazo"
        titulo="Plazo de entrega"
        ayuda="Días entre pedir y recibir. Escribe 0 si lo piden y lo reciben el mismo día."
        sufijo="días"
        placeholder="Ej. 1"
        faltan={porCampo.plazo}
        valor={texto.plazo}
        onCambio={poner('plazo')}
        invalido={invalido('plazo')}
      />
      <CampoVacio
        {...comunes}
        id="vac-seguridad"
        campo="seguridad"
        titulo="Días de seguridad"
        ayuda="Colchón de consumo para no quedarse sin stock. Si lo dejas vacío se usa el stock mínimo."
        sufijo="días"
        placeholder="Ej. 2"
        faltan={porCampo.seguridad}
        valor={texto.seguridad}
        onCambio={poner('seguridad')}
        invalido={invalido('seguridad')}
        opcional
      />
      <CampoVacio
        {...comunes}
        id="vac-tasa"
        campo="tasa"
        titulo="Costo anual de mantener el inventario"
        ayuda="Porcentaje del valor del insumo por año. Sin él no se calcula el EOQ; es un supuesto del modelo y debe quedar documentado."
        sufijo="% del valor"
        placeholder="Ej. 25"
        faltan={porCampo.tasa}
        valor={texto.tasa}
        onCambio={poner('tasa')}
        invalido={invalido('tasa')}
        opcional
      />

      {hayAlgo && !hayInvalidos && (
        <details className="rounded-lg border border-linea bg-white p-3 text-sm">
          <summary className="cursor-pointer font-medium text-grafito">
            {pendientes.length === 0
              ? 'Ningún insumo cambiaría'
              : `Se completarían ${pendientes.length} de ${candidatos} insumos · ver cuáles`}
          </summary>
          {pendientes.length > 0 && (
            <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto pr-1">
              {pendientes.map(({ i, cambios }) => (
                <li key={i.materia_prima_id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                  <span className="font-medium text-grafito">{i.nombre}</span>
                  <span className="text-gris-texto">
                    {(
                      [
                        ['costo', cambios.costo_ordenar_s !== undefined],
                        ['plazo', cambios.lead_time_dias !== undefined],
                        ['seguridad', cambios.dias_seguridad !== undefined],
                        ['tasa', cambios.tasa_mantenimiento_anual !== undefined],
                      ] as [Campo, boolean][]
                    )
                      .filter(([, hay]) => hay)
                      .map(([c]) => ETIQUETA[c])
                      .join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      {error && <Alert variant="error">{error}</Alert>}
      {avance && <Alert variant="info">Guardando {avance.hechos + 1} de {avance.total}… no cierres esta ventana.</Alert>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gris-texto" aria-live="polite">
          {hayAlgo && !hayInvalidos ? `Se aplicaría a ${pendientes.length} de ${candidatos} insumos.` : 'Escribe al menos un valor.'}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onTerminar} disabled={ocupado}>
            {resultado ? 'Cerrar' : 'Cancelar'}
          </Button>
          <Button type="submit" isLoading={ocupado} disabled={pendientes.length === 0 || hayInvalidos}>
            {pendientes.length > 0 ? `Completar ${pendientes.length}` : 'Completar'}
          </Button>
        </div>
      </div>
    </form>
  );
}
