import type { Access } from 'payload';

export const anyone: Access = () => true;

export const authenticated: Access = ({ req: { user } }) => Boolean(user);

/** El público solo ve lo publicado; los editores logueados ven también los borradores. */
export const authenticatedOrPublished: Access = ({ req: { user } }) =>
  user ? true : { _status: { equals: 'published' } };

/**
 * Lo que el sitio lee por la Local API y nadie más: sin sesión, la API REST no lo lista. Los
 * archivos (`/api/media/file/...`) se sirven igual, porque las páginas los muestran.
 */
export const authenticatedOrSite: Access = ({ req, isReadingStaticFile }) =>
  Boolean(req.user) || req.payloadAPI === 'local' || isReadingStaticFile === true;

/** Los administradores de los editores del sitio (los únicos que crean o borran editores). */
export const isAdmin = (user: unknown): boolean =>
  typeof user === 'object' && user !== null && 'isAdmin' in user && user.isAdmin === true;

export const admins: Access = ({ req: { user } }) => isAdmin(user);

/** Un administrador, o el editor sobre su propio usuario. */
export const adminsOrSelf: Access = ({ req: { user } }) => {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return { id: { equals: user.id } };
};
