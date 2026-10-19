'use server';

import { randomUUID } from 'node:crypto';

import { getLogger } from '../../config/logger';
import { getContainer } from '../../container';
import { clientIp } from '../client-ip';
import { createRateLimiter } from '../rate-limit';
import { inquiryFormValues, parseInquiryForm, type InquiryFormState } from './inquiry-form';

/** Consultas por IP cada 10 minutos. */
const allow = createRateLimiter(5, () => Date.now());

const UNAVAILABLE =
  'No pudimos enviar tu consulta. Probá de nuevo en unos minutos o escribinos por WhatsApp.';

/** Server Action del formulario de consulta (ficha, contacto, tasaciones): valida y manda la consulta al panel (ADR 0021). */
export async function sendInquiry(
  _previous: InquiryFormState,
  form: FormData,
): Promise<InquiryFormState> {
  const parsed = parseInquiryForm(form);
  // A un bot se le responde como si hubiera salido bien: así no aprende a esquivar la trampa.
  if (parsed.kind === 'bot') return { status: 'sent' };
  if (parsed.kind === 'invalid') return parsed.state;
  const failed = (message: string): InquiryFormState => ({
    status: 'error',
    message,
    values: inquiryFormValues(form),
  });

  if (!allow(await clientIp())) {
    return failed('Recibimos varias consultas seguidas. Esperá unos minutos y volvé a intentar.');
  }
  const sender = getContainer().inquiries;
  if (!sender) return failed(UNAVAILABLE);

  const logger = getLogger().child({ component: 'inquiry-form' });
  const { email, phone, propertyId, ...rest } = parsed.data;
  try {
    const outcome = await sender.send({
      externalId: randomUUID(),
      ...rest,
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      ...(propertyId !== undefined && { propertyId }),
    });
    switch (outcome.kind) {
      case 'received':
        return { status: 'sent' };
      case 'busy':
        return failed(UNAVAILABLE);
      case 'rejected':
        logger.info({ reason: outcome.reason }, 'Inquiry rejected by gestion');
        return failed('Revisá el teléfono y el email: no los pudimos validar.');
    }
  } catch (error) {
    logger.error({ err: error }, 'Inquiry could not be sent');
    return failed(UNAVAILABLE);
  }
}
