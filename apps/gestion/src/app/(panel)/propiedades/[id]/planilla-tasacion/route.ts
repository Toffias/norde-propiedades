import { getContainer } from '../../../../../container';
import { deliverFile } from '../../../../../lib/file-delivery';
import { getSession } from '../../../../../lib/session';

// La planilla de tasación de la propiedad en PDF, para imprimir y completar en la visita. La arma y
// autoriza el caso de uso, que deja la descarga en el historial.

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
) {
  const session = await getSession();
  if (session.isErr()) return new Response(null, { status: 401 });
  const { id } = await params;
  const result = await getContainer().properties.downloadAppraisalSheet.execute(
    { propertyId: id },
    session.value.actor,
  );
  return deliverFile(
    result.map((file) => ({ kind: 'content' as const, ...file })),
    { inline: false },
  );
}
