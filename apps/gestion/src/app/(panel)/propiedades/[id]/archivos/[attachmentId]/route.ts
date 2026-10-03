import { getContainer } from '../../../../../../container';
import { deliverFile } from '../../../../../../lib/file-delivery';
import { getSession } from '../../../../../../lib/session';

// Descarga de un archivo de la ficha. El storage es privado: el caso de uso autoriza cada descarga.

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly attachmentId: string }> },
) {
  const session = await getSession();
  if (session.isErr()) return new Response(null, { status: 401 });
  const { attachmentId } = await params;
  const result = await getContainer().properties.getAttachmentDownload.execute(
    { attachmentId },
    session.value.actor,
  );
  return deliverFile(result, { inline: false });
}
