import type {
  ReceiveInquiryError,
  ReceiveInquiryInput,
  ReceiveInquiryOutput,
} from '@norde/core/clients';
import type { PortalLeadSink } from '@norde/core/portals';
import { err, ok, type Result } from '@norde/core/shared';

// Entrega los contactos de los avisos de un portal a la bandeja de consultas (módulo clients), con
// su `ReceiveInquiry`. Vive en el panel porque compone módulos.

interface Intake {
  receive(input: ReceiveInquiryInput): Promise<Result<ReceiveInquiryOutput, ReceiveInquiryError>>;
}

export function portalLeadSink(intake: Intake): PortalLeadSink {
  return {
    async receive(input) {
      const result = await intake.receive({
        channel: input.channel,
        externalId: input.externalId,
        message: input.message,
        ...(input.receivedAt === undefined ? {} : { receivedAt: input.receivedAt }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.email === undefined ? {} : { email: input.email }),
        ...(input.phone === undefined ? {} : { phone: input.phone }),
        ...(input.propertyId === undefined ? {} : { propertyId: input.propertyId }),
        ...(input.developmentId === undefined ? {} : { developmentId: input.developmentId }),
      });
      if (result.isOk()) return ok({ duplicate: result.value.duplicate });
      // `Forbidden` es un actor mal armado en el container: un error de programación.
      if (result.error.type === 'Forbidden') {
        throw new Error('The portal leads actor cannot receive inquiries');
      }
      return err({ type: 'PortalLeadRejected', reason: result.error.type });
    },
  };
}
