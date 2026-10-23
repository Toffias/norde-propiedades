import 'server-only';

import { getEnv } from '../../config/env';
import { getLogger } from '../../config/logger';
import { getContainer } from '../../container';
import { ImageWarmer } from './image-warmer';

let warmer: ImageWarmer | undefined;

/** El precalentador del proceso, que lee las fotos publicadas con `GetPropertyDetail`. */
export function getImageWarmer(): ImageWarmer {
  warmer ??= new ImageWarmer({
    photosOf: async (propertyId) => {
      const result = await getContainer().properties.detail({ propertyId });
      // Despublicada o borrada: no hay nada que calentar.
      if (result.isErr()) return [];
      return [...result.value.photos, ...result.value.floorPlans].map((image) => image.src);
    },
    fetch: (url, init) => fetch(url, init),
    origin: getEnv().NEXT_PUBLIC_SERVER_URL.replace(/\/$/, ''),
    logger: getLogger(),
  });
  return warmer;
}
