import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

// Solo se guardan los archivos de la propia app (código, estilos, fuentes e iconos).
// Las respuestas del API NUNCA se guardan: son datos de una panadería y cambian todo el tiempo.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Abrir cualquier pantalla de la app devuelve la página principal; los datos se siguen pidiendo a la red
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// La versión nueva espera a que la persona pulse «Actualizar» (así no se pierde lo que está escribiendo)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting();
});

clientsClaim();
