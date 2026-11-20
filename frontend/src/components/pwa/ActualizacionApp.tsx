import { useRegisterSW } from 'virtual:pwa-register/react';

const CADA_HORA = 60 * 60 * 1000;

// Avisa cuando hay una versión nueva de la app y deja a la persona decidir cuándo recargar
export function ActualizacionApp() {
  const {
    needRefresh: [hayVersionNueva, setHayVersionNueva],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      // La app instalada puede pasar días abierta: se busca una versión nueva cada hora
      if (registro) setInterval(() => void registro.update(), CADA_HORA);
    },
  });

  if (!hayVersionNueva) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md flex-wrap items-center justify-between gap-3 rounded-xl border border-noche-borde bg-azul-noche px-4 py-3 text-sm text-white shadow-lg print:hidden"
    >
      <span>Hay una versión nueva de Levain.</span>
      <span className="flex gap-2">
        <button
          type="button"
          onClick={() => setHayVersionNueva(false)}
          className="min-h-10 rounded-lg px-3 font-semibold text-niebla hover:text-white"
        >
          Después
        </button>
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="min-h-10 rounded-lg bg-trigo px-4 font-semibold text-azul-noche hover:opacity-90"
        >
          Actualizar
        </button>
      </span>
    </div>
  );
}
