import type { MediaKindValue } from '@norde/core/properties/contracts';

export const MEDIA_KIND_LABELS: Readonly<Record<MediaKindValue, string>> = {
  photo: 'Foto',
  floor_plan: 'Plano',
  video: 'Video',
  tour_360: 'Recorrido 360',
};
