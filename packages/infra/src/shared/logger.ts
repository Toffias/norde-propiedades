/** Lo mínimo que los adaptadores necesitan para registrar. Compatible con pino. */
export interface InfraLogger {
  info(details: object, message: string): void;
  warn(details: object, message: string): void;
  error(details: object, message: string): void;
}

/** `+5491166899124` → `+549********24`. Para logs: nunca teléfonos en claro (Ley 25.326). */
export function maskPhone(phone: string): string {
  if (phone.length <= 6) return '***';
  return `${phone.slice(0, 4)}${'*'.repeat(phone.length - 6)}${phone.slice(-2)}`;
}

/** `ana.perez@mail.com` → `a***@mail.com`. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}
