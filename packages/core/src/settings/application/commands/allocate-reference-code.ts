import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  AllocateReferenceCodeInputSchema,
  type AllocateReferenceCodeInput,
  type AllocateReferenceCodeOutput,
} from '../../contracts';
import {
  ReferenceCode,
  referenceCodeCandidates,
  resolveReferenceCodeScope,
} from '../../domain/reference-code';
import type { SettingsUnitOfWork } from '../ports/settings-transaction';
import { parseInput, type ValidationFailedError } from '../settings-input';

/** Cuántos números se saltean, como mucho, por estar ya usados a mano. */
const MAX_ATTEMPTS = 50;

export type AllocateReferenceCodeError =
  | ForbiddenError
  | ValidationFailedError
  /** No hay numeración global: la migración la crea, así que es un error de configuración. */
  | { readonly type: 'NoReferenceCodeSequence' }
  | { readonly type: 'ReferenceCodeExhausted' };

/**
 * Entrega el próximo código de referencia para el alta de una propiedad o un emprendimiento.
 * Elige la numeración más específica que aplique (usuario, equipo, sucursal, tipo, global), toma
 * el número de forma atómica y saltea los códigos que alguien ya usó a mano.
 *
 * Corre en su propia transacción: si el alta falla después, ese número queda sin usar (los códigos
 * pueden tener huecos, nunca repetirse). No se audita: el correlativo es técnico y el código queda
 * en la auditoría del alta que lo usa.
 */
export class AllocateReferenceCode {
  constructor(private readonly deps: { readonly uow: SettingsUnitOfWork }) {}

  async execute(
    input: AllocateReferenceCodeInput,
    actor: Actor,
  ): Promise<Result<AllocateReferenceCodeOutput, AllocateReferenceCodeError>> {
    const parsed = parseInput(AllocateReferenceCodeInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { target, ...context } = parsed.value;
    if (!actor.can(target === 'property' ? 'properties:create' : 'developments:create')) {
      return err({ type: 'Forbidden' });
    }

    return this.deps.uow.run(
      async (tx): Promise<Result<AllocateReferenceCodeOutput, AllocateReferenceCodeError>> => {
        const configured = await tx.sequences.findByScopes(referenceCodeCandidates(context));
        const sequence = resolveReferenceCodeScope(context, configured);
        if (!sequence) return err({ type: 'NoReferenceCodeSequence' });

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
          const number = await tx.sequences.takeNextNumber(sequence.id);
          const code = ReferenceCode.format(sequence.prefix, number);
          if (!(await tx.codeUsage.isTaken(code.value))) {
            return ok({ code: code.value, sequenceId: sequence.id });
          }
        }
        return err({ type: 'ReferenceCodeExhausted' });
      },
    );
  }
}
