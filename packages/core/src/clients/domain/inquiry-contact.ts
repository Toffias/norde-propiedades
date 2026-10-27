import { err, ok, type Result } from '../../shared/domain/result';
import { Email, type InvalidEmailError } from '../../shared/domain/value-objects/email';
import { Phone, type InvalidPhoneError } from '../../shared/domain/value-objects/phone';

/** Cómo contactar a quien consultó, y el mensaje con lo que dejó y no se pudo validar. */
export interface InquiryContact {
  readonly phone: Phone | undefined;
  readonly email: Email | undefined;
  readonly message: string | undefined;
}

/**
 * Los datos de contacto de una consulta entrante. Los portales mandan teléfonos tipeados a mano
 * ("4444-5555", "11 4444 5555 int 2"): si uno de los dos no es válido pero el otro sí, la consulta
 * entra con el válido y el inválido queda escrito en el mensaje, para no perder el contacto. Solo se
 * rechaza si ninguno sirve.
 */
export function inquiryContact(raw: {
  readonly phone: string | undefined;
  readonly email: string | undefined;
  readonly message: string | undefined;
}): Result<InquiryContact, InvalidPhoneError | InvalidEmailError> {
  const phone = raw.phone === undefined ? undefined : Phone.create(raw.phone);
  const email = raw.email === undefined ? undefined : Email.create(raw.email);
  const validPhone = phone?.isOk() ? phone.value : undefined;
  const validEmail = email?.isOk() ? email.value : undefined;

  if (phone?.isErr() && validEmail === undefined) return err(phone.error);
  if (email?.isErr() && validPhone === undefined) return err(email.error);

  const notes = [
    phone?.isErr() ? `Teléfono que dejó (no se pudo validar): ${raw.phone ?? ''}` : undefined,
    email?.isErr() ? `Email que dejó (no se pudo validar): ${raw.email ?? ''}` : undefined,
  ].filter((note) => note !== undefined);
  const message =
    notes.length === 0 ? raw.message : [raw.message, ...notes].filter(Boolean).join('\n\n');
  return ok({ phone: validPhone, email: validEmail, message });
}
