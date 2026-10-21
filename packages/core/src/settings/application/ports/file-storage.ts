/** Un objeto guardado en el storage (logos, archivos de la empresa, variantes de fotos). */
export interface StoredObject {
  /** Clave generada por el sistema (`company-files/<id>`); nunca sale del nombre del archivo. */
  readonly key: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

/**
 * Storage de archivos (S3/R2 en producción, disco en desarrollo). Un fallo del storage es un
 * error inesperado: se lanza como excepción.
 */
/** Cómo se entrega una URL firmada: nombre para la descarga y vencimiento. */
export interface SignedUrlOptions {
  readonly expiresInSeconds: number;
  /** Con nombre, el navegador lo descarga con ese nombre; sin él, lo muestra (una foto). */
  readonly downloadName?: string;
  /**
   * La misma URL durante la mitad de la vigencia, para que el navegador reuse la copia en caché:
   * vence entre `expiresInSeconds / 2` y `expiresInSeconds` después de pedirla.
   */
  readonly reusable?: boolean;
}

/** Cómo se guarda un objeto. */
export interface PutOptions {
  /** El contenido de esa clave no cambia nunca: el navegador lo cachea sin volver a pedirlo. */
  readonly immutable?: boolean;
}

export interface FileStorage {
  put(object: StoredObject, options?: PutOptions): Promise<void>;
  get(key: string): Promise<StoredObject | undefined>;
  delete(key: string): Promise<void>;
  /**
   * URL de corta duración para leer el objeto directo del bucket, sin pasar por el servidor.
   * `undefined` si el driver no firma URLs (disco local): el panel sirve el contenido.
   */
  signedUrl(key: string, options: SignedUrlOptions): Promise<string | undefined>;
}
