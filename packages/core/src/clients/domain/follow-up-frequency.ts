/**
 * Cada cuánto recibe el cliente el resumen de una búsqueda con envío automático (#208). El que se
 * suscribe desde la web elige entre cada 3 días, semanal y mensual: el diario queda para las
 * búsquedas que carga el asesor (y las de antes de #208, que eran todas diarias).
 */
export const FOLLOW_UP_FREQUENCIES = ['daily', 'every_3_days', 'weekly', 'monthly'] as const;
export type FollowUpFrequency = (typeof FOLLOW_UP_FREQUENCIES)[number];

/** Las que ofrece la suscripción desde la web: diaria no, para no caer en spam. */
export const WEB_FOLLOW_UP_FREQUENCIES = ['every_3_days', 'weekly', 'monthly'] as const;
export type WebFollowUpFrequency = (typeof WEB_FOLLOW_UP_FREQUENCIES)[number];

const DAYS: Readonly<Record<FollowUpFrequency, number>> = {
  daily: 1,
  every_3_days: 3,
  weekly: 7,
  monthly: 30,
};

const HOUR_MS = 60 * 60 * 1000;

/**
 * Margen para el horario del resumen: corre una vez por día a la misma hora, pero puede arrancar
 * unos minutos antes o después. Sin él, "hace 7 días" a las 9:58 no llegaría a la semana.
 */
const SCHEDULE_TOLERANCE_MS = 2 * HOUR_MS;

/** Días entre un resumen y el siguiente. */
export function followUpIntervalDays(frequency: FollowUpFrequency): number {
  return DAYS[frequency];
}

/**
 * Si a la búsqueda le toca resumen hoy: nunca se le mandó uno, o desde el último pasaron los días
 * de su frecuencia. La primera coincidencia sale en el resumen siguiente (llega "antes que nadie");
 * después, cada tantos días.
 */
export function isFollowUpDue(
  frequency: FollowUpFrequency,
  lastDigestAt: Date | undefined,
  now: Date,
): boolean {
  if (lastDigestAt === undefined) return true;
  const elapsed = now.getTime() - lastDigestAt.getTime();
  return elapsed >= DAYS[frequency] * 24 * HOUR_MS - SCHEDULE_TOLERANCE_MS;
}
