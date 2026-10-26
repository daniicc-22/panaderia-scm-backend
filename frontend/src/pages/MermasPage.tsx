import { MermasRecientes } from '../features/mermas/MermasRecientes';
import { RegistrarMerma } from '../features/mermas/RegistrarMerma';

export function MermasPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Mermas</h1>
        <p className="text-sm text-gray-500">Registra lo que se pierde y por qué, para saber dónde se va el desperdicio.</p>
      </div>
      <RegistrarMerma />
      <MermasRecientes />
    </div>
  );
}
