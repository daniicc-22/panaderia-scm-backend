import { useQuery } from '@tanstack/react-query';
import { Indicador } from '../inicio/Panel';
import { getProducciones } from '../../services/produccionService';

const num = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Cuánto se produjo este mes y qué tan cerca de lo planificado salió: el rendimiento es el dato que se compara en el pre-test y el post-test
export function ResumenProduccion() {
  const lista = useQuery({ queryKey: ['produccion', 'lista'], queryFn: () => getProducciones() });
  const items = lista.data ?? [];
  if (items.length === 0) return null;

  const hoy = new Date();
  const delMes = items.filter((p) => {
    const f = new Date(p.fecha);
    return f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear() && p.estado !== 'cancelada';
  });
  const unidades = delMes.reduce((s, p) => s + (p.cantidad_producida ?? 0), 0);
  const cerradas = items.filter((p) => p.estado === 'finalizada' && p.rendimiento_pct !== null);
  const promedio = cerradas.length > 0 ? cerradas.reduce((s, p) => s + (p.rendimiento_pct as number), 0) / cerradas.length : null;
  const sinCerrar = items.filter((p) => p.estado === 'en_curso').length;
  const tonoRend = promedio === null ? 'gris' : Math.abs(promedio - 100) <= 5 ? 'verde' : Math.abs(promedio - 100) <= 10 ? 'amarillo' : 'rojo';

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Indicador etiqueta="Producciones del mes" valor="—" numero={delMes.length} detalle={MESES[hoy.getMonth()]} tono="azul" indice={0} />
      <Indicador etiqueta="Unidades producidas" valor="—" numero={unidades} formato={(n) => num.format(n)} detalle="Solo las ya cerradas" tono="amarillo" indice={1} />
      <Indicador
        etiqueta="Rendimiento promedio"
        valor={promedio === null ? '—' : `${num.format(promedio)} %`}
        detalle={promedio === null ? 'Aún sin producciones cerradas' : `Meta 100 % · ${cerradas.length} ${cerradas.length === 1 ? 'cierre' : 'cierres'}`}
        tono={tonoRend}
        indice={2}
      />
      <Indicador etiqueta="Por cerrar" valor="—" numero={sinCerrar} detalle={sinCerrar > 0 ? 'Registra lo que salió' : 'Todo cerrado'} tono={sinCerrar > 0 ? 'amarillo' : 'gris'} indice={3} />
    </div>
  );
}
