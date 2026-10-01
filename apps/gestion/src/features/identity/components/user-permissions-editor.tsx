'use client';

import type { PermissionEffectValue } from '@norde/core/identity/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { SheetBody, SheetFooter } from '@norde/ui/components/sheet';
import { toast } from '@norde/ui/components/sonner';
import { Loader2Icon } from 'lucide-react';
import { useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { setUserPermissionsAction } from '../actions';
import { FormAlert } from '../../shared/components/form-alert';
import type { CatalogGroup } from './permission-picker';
import { PermissionSection } from './permission-section';

type Choice = 'roles' | PermissionEffectValue;

const CHOICE_LABELS: Record<Choice, string> = {
  roles: 'Según sus roles',
  grant: 'Permitir',
  deny: 'Denegar',
};

/** Cuántas excepciones tiene el grupo: lo que importa ver con el grupo cerrado. */
function exceptionSummary(
  group: CatalogGroup,
  choices: ReadonlyMap<string, PermissionEffectValue>,
): string {
  const count = group.resources
    .flatMap((resource) => resource.permissions)
    .filter(({ permission }) => choices.has(permission)).length;
  if (count === 0) return 'Según sus roles';
  return count === 1 ? '1 excepción' : `${count} excepciones`;
}

export interface UserPermissionsEditorProps {
  readonly userId: string;
  readonly catalog: readonly CatalogGroup[];
  /** Permisos del catálogo que ya le dan sus roles (resuelto en el servidor con el `Actor`). */
  readonly fromRoles: readonly string[];
  readonly own: readonly { readonly permission: string; readonly effect: PermissionEffectValue }[];
  /** Al guardar o cancelar: cierra el panel. */
  readonly onDone: () => void;
}

/**
 * Excepciones a los roles de un usuario: permitir algo que sus roles no dan, o denegar algo que sí.
 * Lo habitual es dejar todo "según sus roles".
 */
export function UserPermissionsEditor({
  userId,
  catalog,
  fromRoles,
  own,
  onDone,
}: UserPermissionsEditorProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [choices, setChoices] = useState<ReadonlyMap<string, PermissionEffectValue>>(
    () => new Map(own.map((p) => [p.permission, p.effect])),
  );
  const inherited = new Set(fromRoles);

  function choose(permission: string, choice: Choice) {
    setChoices((current) => {
      const next = new Map(current);
      if (choice === 'roles') next.delete(permission);
      else next.set(permission, choice);
      return next;
    });
  }

  function save() {
    setError(undefined);
    startTransition(async () => {
      const permissions = [...choices].map(([permission, effect]) => ({ permission, effect }));
      const message = await runAction(() => setUserPermissionsAction({ userId, permissions }));
      if (message !== undefined) {
        setError(message);
        return;
      }
      toast.success('Permisos guardados', {
        description: 'Los tiene desde su próxima acción en el panel.',
      });
      onDone();
    });
  }

  return (
    <>
      <SheetBody scroll>
        <p className="text-sm text-muted-foreground">
          Excepciones a sus roles. Denegar gana siempre, también sobre un permiso que viene de un
          rol.
        </p>
        <FormAlert message={error} />
        {catalog.map((group) => (
          <PermissionSection
            key={group.label}
            label={group.label}
            summary={exceptionSummary(group, choices)}
          >
            <ul className="flex flex-col divide-y divide-border">
              {group.resources.flatMap((resource) =>
                resource.permissions.map(({ permission, label }) => {
                  const choice: Choice = choices.get(permission) ?? 'roles';
                  return (
                    <li
                      key={permission}
                      className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span>{label}</span>
                        {inherited.has(permission) ? (
                          <Badge variant="secondary">Por sus roles: sí</Badge>
                        ) : (
                          <Badge variant="outline">Por sus roles: no</Badge>
                        )}
                      </div>
                      <Select
                        value={choice}
                        onValueChange={(next) => {
                          if (next === 'roles' || next === 'grant' || next === 'deny') {
                            choose(permission, next);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full sm:w-[170px]" aria-label={label}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(['roles', 'grant', 'deny'] as const).map((value) => (
                            <SelectItem key={value} value={value}>
                              {CHOICE_LABELS[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </li>
                  );
                }),
              )}
            </ul>
          </PermissionSection>
        ))}
      </SheetBody>
      <SheetFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="button" disabled={pending} onClick={save}>
          {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
          Guardar permisos
        </Button>
      </SheetFooter>
    </>
  );
}
