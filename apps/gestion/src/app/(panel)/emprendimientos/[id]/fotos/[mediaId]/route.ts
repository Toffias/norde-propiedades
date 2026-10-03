import { MEDIA_VARIANT_VALUES } from '@norde/core/properties/contracts';

import { getContainer } from '../../../../../../container';
import { deliverFile } from '../../../../../../lib/file-delivery';
import { getSession } from '../../../../../../lib/session';

// Una foto de la galería del emprendimiento (`?v=thumbnail|web|original`). El storage es privado:
// autoriza el caso de uso.

export async function GET(
  request: Request,
  { params }: { readonly params: Promise<{ readonly mediaId: string }> },
) {
  const session = await getSession();
  if (session.isErr()) return new Response(null, { status: 401 });
  const { mediaId } = await params;
  const requested = new URL(request.url).searchParams.get('v');
  const variant = MEDIA_VARIANT_VALUES.find((value) => value === requested) ?? 'thumbnail';
  const result = await getContainer().properties.getMediaFile.execute(
    { mediaId, variant },
    session.value.actor,
  );
  return deliverFile(result, { inline: true });
}
