import { defineTool } from '@norde/agent-kit';
import type { RegisterContactError } from '@norde/core/clients';
import { z } from 'zod';

import type { CustomerTurnContext } from '../turn-context';

import { UnexpectedToolError, type AssistantToolDeps } from './tool-deps';

const NOTE_MAX = 2000;

const Parameters = z.object({
  type: z
    .enum(['sale', 'rent', 'appraisal'])
    .describe(
      'sale = quiere comprar, rent = quiere alquilar, appraisal = quiere tasar o vender/alquilar su propiedad con Norde',
    ),
  intent: z
    .enum(['visit', 'contact', 'info'])
    .describe(
      'visit = quiere visitar, contact = quiere hablar con un asesor, info = consulta que requiere seguimiento',
    ),
  name: z.string().max(120).nullable().describe('Nombre del cliente, si lo dijo'),
  email: z.string().max(254).nullable().describe('Email, si lo dio'),
  phone: z
    .string()
    .max(40)
    .nullable()
    .describe('Teléfono, solo si lo dio y el canal no lo conoce (chat web)'),
  propertyId: z
    .string()
    .max(64)
    .nullable()
    .describe('Id de la propiedad de interés (el que devolvieron las herramientas), si hay una'),
  notes: z
    .string()
    .max(NOTE_MAX)
    .nullable()
    .describe('Resumen para el asesor: qué busca, presupuesto, disponibilidad, lo relevante'),
  noMatchingStock: z.boolean().describe('true si buscaste y Norde no tiene hoy nada que le sirva'),
});

const PropertyIdSchema = z.uuid();

/**
 * Un id que no salió de las tools (un slug, "la 2") no frena el registro: se registra sin
 * propiedad y la referencia queda en la nota para que el asesor la resuelva.
 */
function propertyOf(propertyId: string | null, notes: string | null) {
  if (propertyId === null || PropertyIdSchema.safeParse(propertyId).success) {
    return { propertyId: propertyId ?? undefined, note: notes ?? undefined };
  }
  const reference = `Propiedad de interés sin identificar: "${propertyId}".`;
  // La nota del core admite 2000 caracteres: si no entra, se recorta el resumen del modelo.
  const summary = notes?.slice(0, NOTE_MAX - reference.length - 1);
  return { propertyId: undefined, note: summary ? `${summary}\n${reference}` : reference };
}

const REASONS: Readonly<Record<Exclude<RegisterContactError['type'], 'Forbidden'>, string>> = {
  InvalidInput: 'Datos inválidos',
  InvalidPhone: 'El teléfono no es válido',
  InvalidEmail: 'El email no es válido',
  MissingContactInfo: 'Falta un teléfono o un email para que el asesor lo contacte',
};

export function registerClientTool(deps: AssistantToolDeps) {
  return defineTool<CustomerTurnContext, typeof Parameters>({
    name: 'register_client',
    description:
      'Registra al cliente y su consulta para que lo contacte un asesor de Norde. Usala cuando quiere visitar, reservar, negociar, hablar con una persona, tasar, o cuando Norde no tiene hoy nada para ofrecerle.',
    parameters: Parameters,
    execute: async (args, context) => {
      // Un registro por turno: probar varios teléfonos o emails en un mensaje no suma nada.
      if (context.registration || context.registering) {
        return { ok: false, reason: 'El cliente ya quedó registrado en este mensaje' };
      }
      context.registering = true;
      const property = propertyOf(args.propertyId, args.notes);
      const result = await deps.registerContact
        .execute(
          {
            channel: context.channel,
            channelExternalId: context.channelExternalId,
            name: args.name ?? context.contactName,
            phone: context.phone ?? args.phone ?? undefined,
            email: args.email ?? undefined,
            opportunity: {
              type: args.type,
              intent: args.intent,
              propertyId: property.propertyId,
              search: context.lastSearch,
              note: property.note,
              noMatchingStock: args.noMatchingStock,
            },
          },
          deps.actor,
        )
        .finally(() => {
          context.registering = false;
        });

      if (result.isErr()) {
        if (result.error.type === 'Forbidden') {
          throw new UnexpectedToolError('register_client', 'forbidden');
        }
        return { ok: false, reason: REASONS[result.error.type] };
      }

      context.registration = {
        clientId: result.value.clientId,
        opportunityId: result.value.opportunityId,
      };
      // No se le dice al modelo si el cliente ya existía: en el chat del sitio el teléfono o el
      // email los escribe cualquiera, y así se podría averiguar quién es cliente de Norde.
      return { ok: true };
    },
  });
}
