import type { EtapaMerma } from '../../types/merma.types';

export const ETIQUETA_ETAPA: Record<EtapaMerma, string> = {
  recepcion: 'Recepción',
  almacenamiento: 'Almacenamiento',
  produccion: 'Producción',
};

export const ETAPAS: EtapaMerma[] = ['recepcion', 'almacenamiento', 'produccion'];

export const MERMA_MAX = 1_000_000;
