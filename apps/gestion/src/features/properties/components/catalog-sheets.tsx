'use client';

import {
  CreateFeatureInputSchema,
  CreateLocationInputSchema,
  CreateTagGroupInputSchema,
  CreateTagInputSchema,
  RenameLocationInputSchema,
  type CreateFeatureInput,
  type CreateLocationInput,
  type CreateTagGroupInput,
  type CreateTagInput,
  type FeatureKindValue,
  type FeatureRow,
  type LocationRow,
  type RenameLocationInput,
  type TagGroupRow,
  type TagRow,
} from '@norde/core/properties/contracts';
import { Button } from '@norde/ui/components/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@norde/ui/components/form';
import { Input } from '@norde/ui/components/input';
import { SheetBody, SheetFooter } from '@norde/ui/components/sheet';
import { toast } from '@norde/ui/components/sonner';
import { Switch } from '@norde/ui/components/switch';
import { Loader2Icon } from 'lucide-react';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { useForm, type FieldValues, type UseFormReturn } from 'react-hook-form';

import { runAction, type ActionResult } from '../../../lib/action-result';
import { contractResolver } from '../../../lib/form';
import { EntityPicker } from '../../identity/components/entity-picker';
import {
  EntitySheet,
  SheetError,
  useLastDefined,
  type PanelNavigation,
} from '../../shared/components/entity-sheet';
import { FormAlert } from '../../shared/components/form-alert';
import { loadLocationOptions } from '../actions';
import {
  createFeatureAction,
  createLocationAction,
  createTagAction,
  createTagGroupAction,
  loadTagGroupOptions,
  renameLocationAction,
  renameTagGroupAction,
  updateFeatureAction,
  updateTagAction,
} from '../catalog-actions';
import { FEATURE_KIND_LABELS, LOCATION_KIND_LABELS } from '../labels';

/** Cuerpo y botones de un formulario del panel lateral, con su error y el envío. */
function SheetForm<T extends FieldValues>({
  form,
  submit,
  done,
  onDone,
  readOnly,
  children,
}: {
  readonly form: UseFormReturn<T>;
  readonly submit: (values: T) => Promise<ActionResult>;
  readonly done: string;
  readonly onDone: () => void;
  readonly readOnly: boolean;
  readonly children: ReactNode;
}) {
  const [error, setError] = useState<string | undefined>();
  const pending = form.formState.isSubmitting;

  async function send(values: T) {
    setError(undefined);
    const message = await runAction(() => submit(values));
    if (message !== undefined) {
      setError(message);
      return;
    }
    toast.success(done);
    onDone();
  }

  return (
    <Form {...form}>
      <form
        className="flex min-h-0 flex-1 flex-col"
        noValidate
        onSubmit={(event) => void form.handleSubmit(send)(event)}
      >
        <SheetBody scroll className="flex flex-col gap-5">
          <FormAlert message={error} />
          {children}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {readOnly ? 'Cerrar' : 'Cancelar'}
          </Button>
          {!readOnly && (
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          )}
        </SheetFooter>
      </form>
    </Form>
  );
}

/** El campo de nombre de un formulario de catálogo (todos tienen uno). */
function nameInput(
  field: { readonly name: string; readonly value: string | undefined } & Omit<
    ComponentProps<typeof Input>,
    'value'
  >,
  readOnly: boolean,
) {
  return (
    <FormItem>
      <FormLabel>Nombre</FormLabel>
      <FormControl>
        <Input
          autoComplete="off"
          autoFocus
          readOnly={readOnly}
          {...field}
          value={field.value ?? ''}
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  );
}

/** El ítem del panel de edición, si está en la página que se ve. */
function useEditing<T extends { readonly id: string }>(
  navigation: PanelNavigation,
  rows: readonly T[],
): { readonly creating: boolean; readonly item: T | undefined; readonly missing: boolean } {
  const shown = useLastDefined(navigation.panel);
  const creating = shown?.kind === 'new';
  const item = shown?.kind === 'edit' ? rows.find((row) => row.id === shown.id) : undefined;
  return { creating, item, missing: shown?.kind === 'edit' && item === undefined };
}

const NOT_ON_PAGE =
  'No está en la página que estás viendo. Buscalo en la grilla y abrilo desde ahí.';

// ---------- Ubicaciones ----------

export function LocationSheet({
  navigation,
  rows,
  parent,
  readOnly,
}: {
  readonly navigation: PanelNavigation;
  readonly rows: readonly LocationRow[];
  /** "Agregar adentro" de una fila: el padre ya elegido. */
  readonly parent: LocationRow | undefined;
  readonly readOnly: boolean;
}) {
  const { creating, item, missing } = useEditing(navigation, rows);
  return (
    <EntitySheet
      open={navigation.panel !== undefined}
      onClose={navigation.close}
      title={creating ? 'Nueva ubicación' : 'Ubicación'}
      description={
        creating
          ? 'Su nivel es el siguiente al de la ubicación de la que depende (sin ninguna, un país).'
          : item === undefined
            ? undefined
            : `${LOCATION_KIND_LABELS[item.kind]}${item.ancestors.length > 0 ? ` en ${[...item.ancestors].reverse().join(', ')}` : ''}`
      }
    >
      {creating ? (
        <NewLocationForm key={parent?.id ?? 'root'} parent={parent} onDone={navigation.close} />
      ) : missing ? (
        <SheetError message={NOT_ON_PAGE} />
      ) : item === undefined ? null : (
        <RenameLocationForm
          key={item.id}
          location={item}
          readOnly={readOnly}
          onDone={navigation.close}
        />
      )}
    </EntitySheet>
  );
}

function NewLocationForm({
  parent,
  onDone,
}: {
  readonly parent: LocationRow | undefined;
  readonly onDone: () => void;
}) {
  const form = useForm<CreateLocationInput>({
    resolver: contractResolver(CreateLocationInputSchema),
    defaultValues: { name: '', ...(parent === undefined ? {} : { parentId: parent.id }) },
  });
  return (
    <SheetForm
      form={form}
      submit={createLocationAction}
      done="Ubicación creada"
      onDone={onDone}
      readOnly={false}
    >
      <FormField
        control={form.control}
        name="parentId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Dentro de</FormLabel>
            <FormControl>
              <EntityPicker
                value={field.value}
                initial={
                  parent === undefined
                    ? undefined
                    : {
                        value: parent.id,
                        label: parent.name,
                        hint: LOCATION_KIND_LABELS[parent.kind],
                      }
                }
                onChange={field.onChange}
                loadPage={loadLocationOptions}
                placeholder="Ninguna (es un país)"
                searchPlaceholder="Ej. CABA"
                clearLabel="Quitar"
              />
            </FormControl>
            <FormDescription>Por ejemplo, un barrio va dentro de su localidad.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => nameInput(field, false)}
      />
    </SheetForm>
  );
}

function RenameLocationForm({
  location,
  readOnly,
  onDone,
}: {
  readonly location: LocationRow;
  readonly readOnly: boolean;
  readonly onDone: () => void;
}) {
  const form = useForm<RenameLocationInput>({
    resolver: contractResolver(RenameLocationInputSchema),
    defaultValues: { locationId: location.id, name: location.name },
  });
  return (
    <SheetForm
      form={form}
      submit={renameLocationAction}
      done="Ubicación actualizada"
      onDone={onDone}
      readOnly={readOnly}
    >
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => nameInput(field, readOnly)}
      />
      <p className="text-sm text-muted-foreground">
        Las propiedades guardan barrio, localidad y provincia al darse de alta: el nombre nuevo se
        ve en las que se carguen desde ahora.
      </p>
    </SheetForm>
  );
}

// ---------- Servicios, ambientes y adicionales ----------

export function FeatureSheet({
  navigation,
  rows,
  kind,
  readOnly,
}: {
  readonly navigation: PanelNavigation;
  readonly rows: readonly FeatureRow[];
  readonly kind: FeatureKindValue;
  readonly readOnly: boolean;
}) {
  const { creating, item, missing } = useEditing(navigation, rows);
  return (
    <EntitySheet
      open={navigation.panel !== undefined}
      onClose={navigation.close}
      title={creating ? `Nuevo ítem: ${FEATURE_KIND_LABELS[kind]}` : 'Ítem del catálogo'}
      description={creating ? 'Va al final de la lista.' : item?.name}
    >
      {creating ? (
        <NewFeatureForm kind={kind} onDone={navigation.close} />
      ) : missing ? (
        <SheetError message={NOT_ON_PAGE} />
      ) : item === undefined ? null : (
        <EditFeatureForm
          key={item.id}
          feature={item}
          readOnly={readOnly}
          onDone={navigation.close}
        />
      )}
    </EntitySheet>
  );
}

function NewFeatureForm({
  kind,
  onDone,
}: {
  readonly kind: FeatureKindValue;
  readonly onDone: () => void;
}) {
  const form = useForm<CreateFeatureInput>({
    resolver: contractResolver(CreateFeatureInputSchema),
    defaultValues: { kind, name: '' },
  });
  return (
    <SheetForm
      form={form}
      submit={createFeatureAction}
      done="Ítem creado"
      onDone={onDone}
      readOnly={false}
    >
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => nameInput(field, false)}
      />
    </SheetForm>
  );
}

function EditFeatureForm({
  feature,
  readOnly,
  onDone,
}: {
  readonly feature: FeatureRow;
  readonly readOnly: boolean;
  readonly onDone: () => void;
}) {
  const form = useForm<CreateFeatureInput>({
    resolver: contractResolver(CreateFeatureInputSchema),
    defaultValues: { kind: feature.kind, name: feature.name },
  });
  const [active, setActive] = useState(feature.isActive);
  return (
    <SheetForm
      form={form}
      submit={(values) =>
        updateFeatureAction({ featureId: feature.id, name: values.name, isActive: active })
      }
      done="Ítem actualizado"
      onDone={onDone}
      readOnly={readOnly}
    >
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => nameInput(field, readOnly)}
      />
      <div className="flex items-center gap-3">
        <Switch
          id="feature-active"
          checked={active}
          disabled={readOnly}
          onCheckedChange={setActive}
        />
        <label htmlFor="feature-active" className="text-sm">
          {active ? 'Activo: se ofrece en la ficha y en los filtros' : 'Inactivo: no se ofrece'}
        </label>
      </div>
    </SheetForm>
  );
}

// ---------- Etiquetas ----------

export function TagGroupSheet({
  navigation,
  rows,
  readOnly,
}: {
  readonly navigation: PanelNavigation;
  readonly rows: readonly TagGroupRow[];
  readonly readOnly: boolean;
}) {
  const { creating, item, missing } = useEditing(navigation, rows);
  return (
    <EntitySheet
      open={navigation.panel !== undefined}
      onClose={navigation.close}
      title={creating ? 'Nuevo grupo de etiquetas' : 'Grupo de etiquetas'}
      description={creating ? 'Después sumale etiquetas desde la pestaña Etiquetas.' : item?.name}
    >
      {creating || item !== undefined ? (
        <TagGroupForm
          key={item?.id ?? 'new'}
          group={item}
          readOnly={readOnly}
          onDone={navigation.close}
        />
      ) : missing ? (
        <SheetError message={NOT_ON_PAGE} />
      ) : null}
    </EntitySheet>
  );
}

function TagGroupForm({
  group,
  readOnly,
  onDone,
}: {
  readonly group: TagGroupRow | undefined;
  readonly readOnly: boolean;
  readonly onDone: () => void;
}) {
  const form = useForm<CreateTagGroupInput>({
    resolver: contractResolver(CreateTagGroupInputSchema),
    defaultValues: { name: group?.name ?? '' },
  });
  return (
    <SheetForm
      form={form}
      submit={(values) =>
        group === undefined
          ? createTagGroupAction(values)
          : renameTagGroupAction({ groupId: group.id, name: values.name })
      }
      done={group === undefined ? 'Grupo creado' : 'Grupo actualizado'}
      onDone={onDone}
      readOnly={readOnly}
    >
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => nameInput(field, readOnly)}
      />
    </SheetForm>
  );
}

export function TagSheet({
  navigation,
  rows,
  readOnly,
}: {
  readonly navigation: PanelNavigation;
  readonly rows: readonly TagRow[];
  readonly readOnly: boolean;
}) {
  const { creating, item, missing } = useEditing(navigation, rows);
  return (
    <EntitySheet
      open={navigation.panel !== undefined}
      onClose={navigation.close}
      title={creating ? 'Nueva etiqueta' : 'Etiqueta'}
      description={
        creating ? 'Se usa como atributo de la propiedad y como filtro del buscador.' : item?.name
      }
    >
      {creating || item !== undefined ? (
        <TagForm key={item?.id ?? 'new'} tag={item} readOnly={readOnly} onDone={navigation.close} />
      ) : missing ? (
        <SheetError message={NOT_ON_PAGE} />
      ) : null}
    </EntitySheet>
  );
}

function TagForm({
  tag,
  readOnly,
  onDone,
}: {
  readonly tag: TagRow | undefined;
  readonly readOnly: boolean;
  readonly onDone: () => void;
}) {
  const form = useForm<CreateTagInput>({
    resolver: contractResolver(CreateTagInputSchema),
    defaultValues: {
      name: tag?.name ?? '',
      ...(tag?.groupId === undefined ? {} : { groupId: tag.groupId }),
    },
  });
  return (
    <SheetForm
      form={form}
      submit={(values) =>
        tag === undefined ? createTagAction(values) : updateTagAction({ ...values, tagId: tag.id })
      }
      done={tag === undefined ? 'Etiqueta creada' : 'Etiqueta actualizada'}
      onDone={onDone}
      readOnly={readOnly}
    >
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => nameInput(field, readOnly)}
      />
      <FormField
        control={form.control}
        name="groupId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Grupo</FormLabel>
            <FormControl>
              <EntityPicker
                value={field.value}
                initial={
                  tag?.groupId === undefined || tag.groupName === undefined
                    ? undefined
                    : { value: tag.groupId, label: tag.groupName }
                }
                onChange={field.onChange}
                loadPage={loadTagGroupOptions}
                placeholder="Sin grupo"
                searchPlaceholder="Buscar grupo"
                clearLabel="Quitar del grupo"
              />
            </FormControl>
            <FormDescription>
              Cambiar el grupo mueve la etiqueta; las propiedades la conservan.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </SheetForm>
  );
}
