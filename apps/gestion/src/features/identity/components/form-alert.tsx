import { AlertTriangleIcon } from 'lucide-react';

/** Error de un formulario que no es de un campo (el que devuelve la Server Action). */
export function FormAlert({ message }: { readonly message: string | undefined }) {
  if (message === undefined) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
