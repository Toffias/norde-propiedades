/** De quién es un registro de otro módulo: su agente y la sucursal de ese agente. */
export interface PartyOwnership {
  readonly ownerId: string | undefined;
  readonly ownerBranchId: string | undefined;
}

/**
 * El cliente y la oportunidad de una reserva: registros del módulo clients, solo por ID. Lo que no
 * existe, está en la papelera o se unificó con otro no vuelve.
 */
export interface ReservationParties {
  client(clientId: string): Promise<PartyOwnership | undefined>;
  opportunity(
    opportunityId: string,
  ): Promise<(PartyOwnership & { readonly clientId: string }) | undefined>;
}
