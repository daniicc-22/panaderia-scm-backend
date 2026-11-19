import { PageHeader } from '../components/layout/PageHeader';
import { MermasPorCausa } from '../features/mermas/MermasPorCausa';
import { MermasRecientes } from '../features/mermas/MermasRecientes';
import { RegistrarMerma } from '../features/mermas/RegistrarMerma';
import { ResumenMermas } from '../features/mermas/ResumenMermas';

export function MermasPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader titulo="Mermas" subtitulo="Registra lo que se pierde y por qué, para saber dónde se va el desperdicio" />
      <ResumenMermas />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
        <RegistrarMerma />
        <div className="flex min-w-0 flex-col gap-4">
          <MermasPorCausa />
          <MermasRecientes />
        </div>
      </div>
    </div>
  );
}
