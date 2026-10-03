import { getContainer } from '../../../../../../container';
import { getLogger } from '../../../../../../config/logger';
import { EXPORT_UNITS_ERROR_MESSAGES } from '../../../../../../features/developments/messages';
import { messageForError } from '../../../../../../lib/errors';
import { getSession } from '../../../../../../lib/session';

// "Descargar unidades": el Excel de unidades del emprendimiento. El caso de uso autoriza y audita;
// la planilla se arma por lotes y se manda a medida que se genera.

function failure(status: number, message: string): Response {
  return Response.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Los lotes del caso de uso, como el cuerpo de la respuesta. */
function toStream(body: AsyncIterable<Uint8Array>): ReadableStream<Uint8Array> {
  const iterator = body[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done === true) controller.close();
        else controller.enqueue(next.value);
      } catch (error) {
        getLogger().error({ err: error }, 'Development units export failed while streaming');
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

export async function POST(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
) {
  const session = await getSession();
  if (session.isErr()) return failure(401, 'Tu sesión venció. Volvé a ingresar.');
  const { id } = await params;

  const result = await getContainer().properties.exportDevelopmentUnits.execute(
    { developmentId: id },
    session.value.actor,
  );
  if (result.isErr()) {
    const status = result.error.type === 'Forbidden' ? 403 : 422;
    return failure(status, messageForError(result.error, EXPORT_UNITS_ERROR_MESSAGES));
  }
  const file = result.value;
  return new Response(toStream(file.body), {
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
