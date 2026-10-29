import { getContainer } from '../../../../../../container';
import { deliverFile } from '../../../../../../lib/file-delivery';
import { getSession } from '../../../../../../lib/session';

// Descarga del PDF de una selección del buscador (#175), desde la barra de procesos.

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly documentId: string }> },
) {
  const session = await getSession();
  if (session.isErr()) return new Response(null, { status: 401 });
  const { documentId } = await params;
  const result = await getContainer().properties.getPropertyListDocumentDownload.execute(
    { documentId },
    session.value.actor,
  );
  return deliverFile(result, { inline: false });
}
