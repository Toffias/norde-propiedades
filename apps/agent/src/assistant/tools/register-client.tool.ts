import { defineTool } from '@norde/agent-kit';
import type { RegisterContactError } from '@norde/core/clients';
import { z } from 'zod';

import type { CustomerTurnContext } from '../turn-context';

import { UnexpectedToolError, type AssistantToolDeps } from './tool-deps';

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
    .max(2000)
    .nullable()
    .describe('Resumen para el asesor: qué busca, presupuesto, disponibilidad, lo relevante'),
  noMatchingStock: z.boolean().describe('true si buscaste y Norde no tiene hoy nada que le sirva'),
});

const REASONS: Readonly<Record<Exclude<RegisterContactError['type'], 'Forbidden'>, string>> = {
  InvalidInput: 'Datos inválidos (revisá el id de la propiedad)',
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
      const result = await deps.registerContact.execute(
        {
          channel: context.channel,
          channelExternalId: context.channelExternalId,
          name: args.name ?? context.contactName,
          phone: context.phone ?? args.phone ?? undefined,
          email: args.email ?? undefined,
          opportunity: {
            type: args.type,
            intent: args.intent,
            propertyId: args.propertyId ?? undefined,
            search: context.lastSearch,
            note: args.notes ?? undefined,
            noMatchingStock: args.noMatchingStock,
          },
        },
        deps.actor,
      );

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
      return { ok: true, alreadyKnownClient: !result.value.clientCreated };
    },
  });
}
