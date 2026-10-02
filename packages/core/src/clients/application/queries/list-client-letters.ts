import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  CLIENT_LETTERS,
  ClientFilterSchema,
  type ClientFilter,
  type ClientLetterCount,
} from '../../contracts';
import {
  canReadClients,
  invalidInput,
  resolveClientFilter,
  type InvalidInputError,
} from '../client-support';
import type { ClientListQuery } from '../ports/client-list-query';

export type ListClientLettersError = ForbiddenError | InvalidInputError;

/**
 * El índice de la agenda alfabética: cuántos contactos hay en cada letra con los filtros
 * aplicados. Vienen las 27 letras en orden (las vacías con 0); cada letra carga su página aparte.
 */
export class ListClientLetters {
  constructor(private readonly deps: { readonly list: ClientListQuery }) {}

  async execute(
    input: ClientFilter,
    actor: Actor,
  ): Promise<Result<ClientLetterCount[], ListClientLettersError>> {
    if (!canReadClients(actor)) return err({ type: 'Forbidden' });

    const parsed = ClientFilterSchema.safeParse(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const criteria = resolveClientFilter({ ...parsed.data, letter: undefined }, actor);
    if (criteria.isErr()) return err(criteria.error);

    const counts = new Map(
      (await this.deps.list.letters(criteria.value)).map((c) => [c.letter, c.count]),
    );
    return ok(CLIENT_LETTERS.map((letter) => ({ letter, count: counts.get(letter) ?? 0 })));
  }
}
