'use client';

import { Checkbox } from '@norde/ui/components/checkbox';
import { Label } from '@norde/ui/components/label';
import { useId } from 'react';

export interface RoleOption {
  readonly id: string;
  readonly name: string;
  readonly description: string | undefined;
}

/** Roles a elegir para un usuario: son pocos, se muestran todos como casillas. */
export function RoleCheckboxes({
  roles,
  value,
  onChange,
}: {
  readonly roles: readonly RoleOption[];
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
}) {
  const baseId = useId();

  return (
    <div className="flex flex-col gap-2.5">
      {roles.map((role) => {
        const id = `${baseId}-${role.id}`;
        const checked = value.includes(role.id);
        return (
          <div key={role.id} className="flex items-start gap-2">
            <Checkbox
              id={id}
              checked={checked}
              className="mt-0.5"
              onCheckedChange={(next) => {
                onChange(
                  next === true
                    ? [...value, role.id]
                    : value.filter((roleId) => roleId !== role.id),
                );
              }}
            />
            <Label htmlFor={id} className="flex flex-col items-start gap-0.5 font-normal">
              <span className="font-medium">{role.name}</span>
              {role.description !== undefined && (
                <span className="text-xs leading-normal text-muted-foreground">
                  {role.description}
                </span>
              )}
            </Label>
          </div>
        );
      })}
    </div>
  );
}
