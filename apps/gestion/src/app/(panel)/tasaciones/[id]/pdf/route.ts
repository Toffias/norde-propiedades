import { getContainer } from '../../../../../container';
import { deliverFile } from '../../../../../lib/file-delivery';
import { getSession } from '../../../../../lib/session';

// El informe de la tasación en PDF, para entregárselo al propietario. Lo arma y autoriza el caso
// de uso, que deja la descarga en el historial.

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
) {
  const session = await getSession();
  if (session.isErr()) return new Response(null, { status: 401 });
  const { id } = await params;
  const result = await getContainer().appraisals.downloadAppraisalReport.execute(
    { appraisalId: id },
    session.value.actor,
  );
  return deliverFile(
    result.map((file) => ({ kind: 'content' as const, ...file })),
    { inline: false },
  );
}
