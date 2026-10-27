'use server';

import { getContainer } from '../../container';
import { clientIp } from '../client-ip';
import { createRateLimiter } from '../rate-limit';
import { createSharedListingResponses, type RespondOutcome } from './respond';

// Por IP cada 10 minutos: alcanza para abrir varios envíos y cambiar de opinión, no para un loop.
const responses = createSharedListingResponses({
  responder: () => getContainer().sharedListings,
  allowOpen: createRateLimiter(30, () => Date.now()),
  allowReact: createRateLimiter(60, () => Date.now()),
});

/** El cliente abrió el link (desde el navegador: la vista previa de WhatsApp no cuenta). */
export async function openSharedListing(input: unknown): Promise<RespondOutcome> {
  return responses.open(input, await clientIp());
}

/** "Me gusta" o "no me gusta" a una propiedad del envío. */
export async function reactToSharedListing(input: unknown): Promise<RespondOutcome> {
  return responses.react(input, await clientIp());
}
