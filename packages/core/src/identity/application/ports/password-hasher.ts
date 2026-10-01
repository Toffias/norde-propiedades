/** Hash de contraseñas: el mismo algoritmo que verifica el proveedor de autenticación al ingresar. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}
