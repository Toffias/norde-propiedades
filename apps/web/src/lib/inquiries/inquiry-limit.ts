import { createRateLimiter } from '../rate-limit';

const DAY_MS = 24 * 3_600_000;

/** Envíos de formularios de consulta (ficha, contacto, tasaciones, favoritos) por IP cada 10 minutos. */
export const INQUIRY_SUBMISSIONS_PER_WINDOW = 5;
/** Consultas que llegan al panel por IP cada 10 minutos: un envío de favoritos suma una por propiedad. */
export const INQUIRIES_PER_WINDOW = 20;
/** Consultas por IP por día. */
export const INQUIRIES_PER_DAY = 60;

/**
 * Límite compartido de los formularios de consulta, por clave (`clientRateKey`). Cuenta envíos y,
 * aparte, consultas: el panel de favoritos manda una por propiedad (hasta 20), así que contarlo
 * como un solo envío dejaba mandar 100 consultas cada 10 minutos.
 */
export function createInquiryLimiter(now: () => number) {
  const submissions = createRateLimiter(INQUIRY_SUBMISSIONS_PER_WINDOW, now);
  const inquiries = createRateLimiter(INQUIRIES_PER_WINDOW, now);
  const daily = createRateLimiter(INQUIRIES_PER_DAY, now, DAY_MS);
  return (key: string, count: number): boolean => {
    const results = [submissions(key), inquiries(key, count), daily(key, count)];
    return results.every(Boolean);
  };
}

/** El de la web: uno solo para todos los formularios, así no se suman los topes de cada uno. */
export const allowInquiries = createInquiryLimiter(() => Date.now());
