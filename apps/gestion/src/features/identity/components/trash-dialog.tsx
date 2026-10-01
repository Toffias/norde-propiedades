'use client';

import { Button } from '@norde/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@norde/ui/components/dialog';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon } from 'lucide-react';
import { useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import type { ActionResult } from '../../../lib/action-result';
import { FormAlert } from './form-alert';

export interface ConfirmActionCopy {
  readonly title: string;
  readonly description: string;
  readonly confirm: string;
  readonly done: string;
  readonly destructive?: boolean;
}

/** Confirmación de una acción (borrar, restaurar, marcar como principal) con su error esperado. */
export function ConfirmActionDialog({
  copy,
  run,
  onOpenChange,
}: {
  /** Sin `copy` el diálogo está cerrado. */
  readonly copy: ConfirmActionCopy | undefined;
  readonly run: () => Promise<ActionResult>;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function close(next: boolean) {
    if (!next) setError(undefined);
    onOpenChange(next);
  }

  function confirm() {
    if (!copy) return;
    startTransition(async () => {
      const message = await runAction(run);
      if (message !== undefined) {
        setError(message);
        return;
      }
      toast.success(copy.done);
      close(false);
    });
  }

  return (
    <Dialog open={copy !== undefined} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>{copy?.description}</DialogDescription>
        </DialogHeader>
        <FormAlert message={error} />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              close(false);
            }}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant={copy?.destructive === true ? 'destructive' : 'default'}
            disabled={pending}
            onClick={confirm}
          >
            {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
            {copy?.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
