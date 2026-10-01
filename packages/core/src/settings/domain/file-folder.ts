import { AggregateRoot } from '../../shared/domain/aggregate-root';
import type { Id } from '../../shared/domain/id';
import { err, ok, type Result } from '../../shared/domain/result';

export type FileFolderId = Id<'FileFolder'>;

export interface InvalidFileNameError {
  readonly type: 'InvalidFileName';
}

const MAX_NAME_LENGTH = 120;
// Barras: el nombre no es una ruta. Caracteres de control: no se ven y rompen descargas.
// eslint-disable-next-line no-control-regex -- justamente se buscan los caracteres de control.
const FORBIDDEN = /[/\\\u0000-\u001f\u007f]/;

/** Nombre de una carpeta o un archivo: sin barras ni caracteres de control, hasta 120 caracteres. */
export class FileName {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<FileName, InvalidFileNameError> {
    const value = raw.trim();
    if (value === '' || value === '.' || value === '..') return err({ type: 'InvalidFileName' });
    if (value.length > MAX_NAME_LENGTH || FORBIDDEN.test(value)) {
      return err({ type: 'InvalidFileName' });
    }
    return ok(new FileName(value));
  }
}

export interface FileFolderSnapshot {
  readonly id: FileFolderId;
  readonly parentId: FileFolderId | undefined;
  readonly name: FileName;
  /**
   * Ruta materializada con los IDs de los ancestros y el propio (`/<raíz>/<hija>/`): permite listar
   * un subárbol y armar el breadcrumb, y no cambia al renombrar.
   */
  readonly path: string;
}

export type FileFolderError =
  | { readonly type: 'FolderNameTaken' }
  | { readonly type: 'FolderNotEmpty' }
  | { readonly type: 'MaxFolderDepth' };

/** Hasta cuántos niveles se pueden anidar carpetas. */
export const MAX_FOLDER_DEPTH = 8;

/** Lo que contiene una carpeta, sin contar los archivos de la papelera. */
export interface FolderContents {
  readonly folders: number;
  readonly files: number;
}

/** Carpeta del gestor de archivos de la empresa. Las carpetas forman un árbol. */
export class FileFolder extends AggregateRoot<FileFolderId, never> {
  #state: Omit<FileFolderSnapshot, 'id'>;

  private constructor(id: FileFolderId, state: Omit<FileFolderSnapshot, 'id'>) {
    super(id);
    this.#state = state;
  }

  static create(input: {
    readonly id: FileFolderId;
    readonly parent: FileFolder | undefined;
    readonly name: FileName;
    /** Hay otra carpeta con el mismo nombre en el mismo lugar. */
    readonly nameTaken: boolean;
  }): Result<FileFolder, FileFolderError> {
    if (input.nameTaken) return err({ type: 'FolderNameTaken' });
    if (input.parent && input.parent.depth >= MAX_FOLDER_DEPTH) {
      return err({ type: 'MaxFolderDepth' });
    }
    const parentPath = input.parent?.path ?? '/';
    return ok(
      new FileFolder(input.id, {
        parentId: input.parent?.id,
        name: input.name,
        path: `${parentPath}${input.id}/`,
      }),
    );
  }

  static restore(snapshot: FileFolderSnapshot): FileFolder {
    const { id, ...state } = snapshot;
    return new FileFolder(id, state);
  }

  get parentId(): FileFolderId | undefined {
    return this.#state.parentId;
  }

  get name(): FileName {
    return this.#state.name;
  }

  get path(): string {
    return this.#state.path;
  }

  /** Nivel de la carpeta: 1 para las de la raíz. */
  get depth(): number {
    return this.#state.path.split('/').filter((segment) => segment !== '').length;
  }

  rename(name: FileName, nameTaken: boolean): Result<void, FileFolderError> {
    if (nameTaken) return err({ type: 'FolderNameTaken' });
    this.#state = { ...this.#state, name };
    return ok(undefined);
  }

  /**
   * Una carpeta se borra solo vacía: sin subcarpetas ni archivos. Los archivos que tenía en la
   * papelera pasan a la raíz (`CompanyFile.detachFromFolder`), así se pueden restaurar igual.
   */
  ensureRemovable(contents: FolderContents): Result<void, FileFolderError> {
    if (contents.folders > 0 || contents.files > 0) return err({ type: 'FolderNotEmpty' });
    return ok(undefined);
  }

  toSnapshot(): FileFolderSnapshot {
    return { id: this.id, ...this.#state };
  }
}
