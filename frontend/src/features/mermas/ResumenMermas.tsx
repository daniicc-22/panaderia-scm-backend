import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Indicador } from '../inicio/Panel';
import { getMermas } from '../../services/mermasService';
import { formatoDinero } from '../inventario/formatos';
import { ETIQUETA_ETAPA } from './etiquetas';

// Lo esencial de las mermas registradas: cuántas, cuánto cuestan (gestión) y dónde se concentran
export function ResumenMermas() {
  const lista = useQuery({ queryKey: ['mermas', 'lista'], queryFn: () => getMermas() });
  const r = useMemo(() => {
    const items = lista.data ?? [];
    if (items.length === 0) return null;
    const conCosto = items.some((m) => m.costo_estimado != null);
    const costo = items.reduce((s, m) => s + (m.costo_estimado ?? 0), 0);
    const contar = (clave: (m: (typeof items)[number]) => string | null) => {
      const mapa = new Map<string, number>();
      for (const m of items) {
        const k = clave(m);
        if (k) mapa.set(k, (mapa.get(k) ?? 0) + 1);
      }
      return [...mapa.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    };
    return { total: items.length, conCosto, costo, causa: contar((m) => m.causa), etapa: contar((m) => (m.etapa ? ETIQUETA_ETAPA[m.etapa] : null)) };
  }, [lista.data]);
  if (!r) return null;

  return (
    <div className={`grid grid-cols-2 gap-3 ${r.conCosto ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
      <Indicador etiqueta="Mermas registradas" valor="—" numero={r.total} tono="azul" indice={0} />
      {r.conCosto && <Indicador etiqueta="Costo estimado" valor="—" numero={r.costo} formato={(n) => formatoDinero(n)} detalle="Lo perdido en insumos" tono="rojo" indice={1} />}
      <Indicador etiqueta="Causa más frecuente" valor={r.causa ? r.causa[0] : '—'} detalle={r.causa ? `${r.causa[1]} ${r.causa[1] === 1 ? 'registro' : 'registros'}` : undefined} tono="amarillo" indice={2} />
      <Indicador etiqueta="Etapa con más mermas" valor={r.etapa ? r.etapa[0] : '—'} detalle={r.etapa ? `${r.etapa[1]} ${r.etapa[1] === 1 ? 'registro' : 'registros'}` : undefined} tono="gris" indice={3} />
    </div>
  );
}
