import { getContainer } from '../../../../../../container';
import { deliverFile } from '../../../../../../lib/file-delivery';
import { getSession } from '../../../../../../lib/session';

// Una foto de la tasación. El storage es privado: autoriza el caso de uso.

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly id: string; readonly photoId: string }> },
) {
  const session = await getSession();
  if (session.isErr()) return new Response(null, { status: 401 });
  const { id, photoId } = await params;
  const result = await getContainer().appraisals.getAppraisalPhotoFile.execute(
    { appraisalId: id, photoId },
    session.value.actor,
  );
  return deliverFile(result, { inline: true });
}
