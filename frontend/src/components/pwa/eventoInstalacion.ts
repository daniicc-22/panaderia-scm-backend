// Chrome y Edge avisan UNA sola vez, al cargar la página, que la app se puede instalar. Si ese aviso se pierde
// (por ejemplo, porque aún se está en el login), el botón «Instalar app» no aparecería después.
// Por eso se escucha desde el arranque de la app y se guarda aquí.

// Evento no estándar: se declara a mano
export interface EventoInstalacion extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface Estado {
  evento: EventoInstalacion | null;
  instalada: boolean;
}

const yaInstalada = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

let estado: Estado = { evento: null, instalada: false };
const suscriptores = new Set<() => void>();

function cambiar(nuevo: Estado) {
  estado = nuevo;
  suscriptores.forEach((avisar) => avisar());
}

export function iniciarCapturaInstalacion() {
  estado = { evento: null, instalada: yaInstalada() };
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    cambiar({ ...estado, evento: e as EventoInstalacion });
  });
  window.addEventListener('appinstalled', () => cambiar({ evento: null, instalada: true }));
}

export const leerEstadoInstalacion = () => estado;

export function suscribirInstalacion(avisar: () => void) {
  suscriptores.add(avisar);
  return () => {
    suscriptores.delete(avisar);
  };
}

export function olvidarEvento() {
  cambiar({ ...estado, evento: null });
}
