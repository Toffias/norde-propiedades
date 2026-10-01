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
}

export interface FileStorage {
  put(object: StoredObject): Promise<void>;
  get(key: string): Promise<StoredObject | undefined>;
  delete(key: string): Promise<void>;
  /**
   * URL de corta duración para leer el objeto directo del bucket, sin pasar por el servidor.
   * `undefined` si el driver no firma URLs (disco local): el panel sirve el contenido.
   */
  signedUrl(key: string, options: SignedUrlOptions): Promise<string | undefined>;
}
