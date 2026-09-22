/** El actor no tiene el permiso que exige el caso de uso. */
export interface ForbiddenError {
  readonly type: 'Forbidden';
}
