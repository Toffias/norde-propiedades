'use client';

import { FileTextIcon, UploadIcon, XIcon } from 'lucide-react';
import { useId, useState, type DragEvent } from 'react';

import { cn } from '../lib/utils';

export interface FileDropzoneProps {
  readonly onFiles: (files: readonly File[]) => void;
  /** Igual que el atributo `accept` del input (ej. "image/*,.pdf"). */
  readonly accept?: string;
  readonly multiple?: boolean;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly hint?: string;
}

/** Zona para soltar o elegir archivos. La validación de tipo y tamaño la hace quien recibe. */
export function FileDropzone({
  onFiles,
  accept,
  multiple = false,
  disabled = false,
  title = 'Arrastrá archivos o hacé clic para elegirlos',
  hint,
}: FileDropzoneProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  }

  return (
    <label
      htmlFor={inputId}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => {
        setDragging(false);
      }}
      onDrop={handleDrop}
      aria-disabled={disabled}
      className={cn(
        'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-input bg-background px-4 py-6 text-center transition-colors hover:border-primary hover:bg-primary-50 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 dark:border-surface-dark-4 dark:hover:bg-surface-dark-3',
        dragging && 'border-primary bg-primary-50 dark:bg-surface-dark-3',
        disabled && 'pointer-events-none opacity-50',
      )}
    >
      <UploadIcon className="h-6 w-6 text-primary-700 dark:text-primary-400" aria-hidden />
      <span className="text-sm font-semibold">{title}</span>
      {hint !== undefined && (
        <span className="text-xs leading-normal text-muted-foreground">{hint}</span>
      )}
      <input
        id={inputId}
        type="file"
        className="sr-only"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) onFiles(files);
          event.target.value = '';
        }}
      />
    </label>
  );
}

/** Archivo elegido, con botón para quitarlo. */
export function FileChip({
  name,
  onRemove,
}: {
  readonly name: string;
  readonly onRemove?: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm">
      <FileTextIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 truncate" title={name}>
        {name}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${name}`}
          className="grid size-5 shrink-0 place-items-center rounded-sm text-destructive hover:bg-destructive/10 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}
