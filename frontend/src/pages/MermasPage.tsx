import { MermasRecientes } from '../features/mermas/MermasRecientes';
import { RegistrarMerma } from '../features/mermas/RegistrarMerma';

export function MermasPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="-mx-4 -mt-4 bg-pizarra px-4 py-5 text-white sm:-mx-6 sm:-mt-6 sm:px-7 sm:py-6">
        <h1 className="font-display text-2xl font-semibold text-white sm:text-[28px]">Mermas</h1>
        <p className="mt-1 text-sm text-niebla">Registra lo que se pierde y por qué, para saber dónde se va el desperdicio.</p>
      </div>
      <RegistrarMerma />
      <MermasRecientes />
    </div>
  );
}
