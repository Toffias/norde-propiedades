'use client';

import {
  PROPERTY_ATTRIBUTE_GROUP_OF,
  PROPERTY_ATTRIBUTE_GROUP_VALUES,
  PROPERTY_ATTRIBUTE_VALUES,
  type PropertyAttributeValue,
  type PropertyTypeSettingRow,
} from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import { Checkbox } from '@norde/ui/components/checkbox';
import { Label } from '@norde/ui/components/label';
import { toast } from '@norde/ui/components/sonner';
import { Switch } from '@norde/ui/components/switch';
import { ChevronDownIcon, ChevronUpIcon, Loader2Icon } from 'lucide-react';
import { useId, useState, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { FormAlert } from '../../shared/components/form-alert';
import { updatePropertyTypeSettingAction } from '../catalog-actions';
import { ATTRIBUTE_GROUP_LABELS, ATTRIBUTE_LABELS, PROPERTY_TYPE_LABELS } from '../labels';

function TypeRow({
  setting,
  disabled,
}: {
  readonly setting: PropertyTypeSettingRow;
  readonly disabled: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [attributes, setAttributes] = useState<readonly PropertyAttributeValue[]>(
    setting.visibleAttributes,
  );
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function save(change: {
    readonly isEnabled: boolean;
    readonly attributes: readonly PropertyAttributeValue[];
  }) {
    setError(undefined);
    startTransition(async () => {
      const message = await runAction(() =>
        updatePropertyTypeSettingAction({
          propertyType: setting.propertyType,
          isEnabled: change.isEnabled,
          visibleAttributes: [...change.attributes],
        }),
      );
      if (message === undefined)
        toast.success(`${PROPERTY_TYPE_LABELS[setting.propertyType]}: guardado`);
      else setError(message);
    });
  }

  return (
    <li className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3">
        <Switch
          id={`${id}-enabled`}
          checked={setting.isEnabled}
          disabled={disabled || pending}
          onCheckedChange={(isEnabled) => {
            save({ isEnabled, attributes: setting.visibleAttributes });
          }}
        />
        <Label htmlFor={`${id}-enabled`} className="min-w-28 font-semibold">
          {PROPERTY_TYPE_LABELS[setting.propertyType]}
        </Label>
        <span className="text-sm text-muted-foreground">
          {setting.isEnabled ? 'Se ofrece en el alta' : 'Deshabilitado'} ·{' '}
          {setting.visibleAttributes.length} atributos en la ficha
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
          }}
        >
          {open ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          Atributos
        </Button>
      </div>
      <FormAlert message={error} />
      {open && (
        <div className="flex flex-col gap-4 rounded-md border border-border p-4">
          {PROPERTY_ATTRIBUTE_GROUP_VALUES.map((group) => (
            <fieldset key={group} className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold">
                {ATTRIBUTE_GROUP_LABELS[group]}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PROPERTY_ATTRIBUTE_VALUES.filter(
                  (attribute) => PROPERTY_ATTRIBUTE_GROUP_OF[attribute] === group,
                ).map((attribute) => (
                  <div key={attribute} className="flex items-center gap-2">
                    <Checkbox
                      id={`${id}-${attribute}`}
                      checked={attributes.includes(attribute)}
                      disabled={disabled}
                      onCheckedChange={(checked) => {
                        setAttributes((current) =>
                          checked === true
                            ? [...current, attribute]
                            : current.filter((candidate) => candidate !== attribute),
                        );
                      }}
                    />
                    <Label htmlFor={`${id}-${attribute}`} className="font-normal">
                      {ATTRIBUTE_LABELS[attribute]}
                    </Label>
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
          {!disabled && (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={pending}
                onClick={() => {
                  save({ isEnabled: setting.isEnabled, attributes });
                }}
              >
                {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
                Guardar atributos
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAttributes(setting.recommendedAttributes);
                }}
              >
                Volver a la configuración recomendada
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Tipos con los que trabaja la inmobiliaria: un tipo deshabilitado no se ofrece en el alta (sus
 * propiedades siguen en la cartera). Cada tipo elige qué atributos muestra su ficha.
 */
export function PropertyTypesSettings({
  types,
  disabled,
}: {
  readonly types: readonly PropertyTypeSettingRow[];
  readonly disabled: boolean;
}) {
  return (
    <ul className="flex flex-col">
      {types.map((setting) => (
        <TypeRow key={setting.propertyType} setting={setting} disabled={disabled} />
      ))}
    </ul>
  );
}
