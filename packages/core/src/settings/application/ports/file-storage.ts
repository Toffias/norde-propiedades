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
export interface FileStorage {
  put(object: StoredObject): Promise<void>;
  get(key: string): Promise<StoredObject | undefined>;
  delete(key: string): Promise<void>;
}
