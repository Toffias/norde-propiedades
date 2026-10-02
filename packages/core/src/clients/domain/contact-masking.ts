// Los datos de contacto de un propietario son sensibles: sin "Ver datos de propietarios" se
// muestran enmascarados, con lo justo para reconocerlos (los últimos dígitos, la inicial).

/** `+5491166899124` → `+54 •••• 9124`. */
export function maskPhone(e164: string): string {
  const country = e164.startsWith('+54') ? '+54' : e164.slice(0, 3);
  return `${country} •••• ${e164.slice(-4)}`;
}

/** `ana.perez@mail.com` → `a•••@mail.com`. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '•••';
  return `${email.slice(0, 1)}•••${email.slice(at)}`;
}
