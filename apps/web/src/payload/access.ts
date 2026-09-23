import type { Access } from 'payload';

export const anyone: Access = () => true;

export const authenticated: Access = ({ req: { user } }) => Boolean(user);

/** El público solo ve lo publicado; los editores logueados ven también los borradores. */
export const authenticatedOrPublished: Access = ({ req: { user } }) =>
  user ? true : { _status: { equals: 'published' } };
