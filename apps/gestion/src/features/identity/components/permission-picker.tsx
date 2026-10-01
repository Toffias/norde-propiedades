'use client';

import { Checkbox } from '@norde/ui/components/checkbox';
import { Label } from '@norde/ui/components/label';
import { useId } from 'react';

// El catálogo de permisos llega como datos desde la página (Server Component): el cliente no
// importa el dominio. Estos tipos son la forma que tiene.

export interface CatalogPermission {
  readonly permission: string;
  readonly label: string;
}

export interface CatalogResource {
  readonly resource: string;
  readonly label: string;
  readonly permissions: readonly CatalogPermission[];
}

export interface CatalogGroup {
  readonly label: string;
  readonly resources: readonly CatalogResource[];
}

/** `clients:*`: todas las acciones del recurso, también las que se agreguen más adelante. */
function wildcardOf(resource: string): string {
  return `${resource}:*`;
}

function belongsTo(permission: string, resource: string): boolean {
  return permission.startsWith(`${resource}:`);
}

/** Permisos de un rol, agrupados como el catálogo. Un recurso entero se marca con "Todo". */
export function PermissionPicker({
  catalog,
  value,
  onChange,
  disabled = false,
}: {
  readonly catalog: readonly CatalogGroup[];
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly disabled?: boolean;
}) {
  const baseId = useId();
  const selected = new Set(value);

  function toggleWildcard(resource: string, on: boolean) {
    // "Todo" reemplaza a las acciones sueltas del recurso.
    const rest = value.filter((permission) => !belongsTo(permission, resource));
    onChange(on ? [...rest, wildcardOf(resource)] : rest);
  }

  function togglePermission(permission: string, on: boolean) {
    onChange(on ? [...value, permission] : value.filter((p) => p !== permission));
  }

  return (
    <div className="flex flex-col gap-4">
      {catalog.map((group) => (
        <fieldset key={group.label} className="rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-semibold">{group.label}</legend>
          <div className="grid gap-5 md:grid-cols-2">
            {group.resources.map((resource) => {
              const all = selected.has(wildcardOf(resource.resource));
              const allId = `${baseId}-${resource.resource}-all`;
              return (
                <div key={resource.resource} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{resource.label}</span>
                    <div className="flex items-center gap-1.5">
                      <Checkbox
                        id={allId}
                        aria-label={`Todo en ${resource.label}`}
                        checked={all}
                        disabled={disabled}
                        onCheckedChange={(next) => {
                          toggleWildcard(resource.resource, next === true);
                        }}
                      />
                      <Label htmlFor={allId} className="text-xs font-normal text-muted-foreground">
                        Todo
                      </Label>
                    </div>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {resource.permissions.map(({ permission, label }) => {
                      const id = `${baseId}-${permission}`;
                      return (
                        <li key={permission} className="flex items-center gap-2">
                          <Checkbox
                            id={id}
                            checked={all || selected.has(permission)}
                            disabled={disabled || all}
                            onCheckedChange={(next) => {
                              togglePermission(permission, next === true);
                            }}
                          />
                          <Label htmlFor={id} className="text-sm font-normal">
                            {label}
                          </Label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
