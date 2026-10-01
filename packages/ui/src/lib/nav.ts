/** Un item del menú está activo en su ruta y en las rutas que cuelgan de ella. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
