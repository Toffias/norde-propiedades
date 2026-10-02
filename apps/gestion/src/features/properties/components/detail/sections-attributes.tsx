'use client';

import {
  CONDITION_VALUES,
  DISPOSITION_VALUES,
  ORIENTATION_VALUES,
  UpdatePropertyCharacteristicsInputSchema,
  UpdatePropertyDealInputSchema,
  UpdatePropertyFeaturesInputSchema,
  type FeatureKindValue,
  type FeatureRow,
  type PanelPropertyDetail,
  type PropertyAttributeValue,
  type UpdatePropertyCharacteristicsInput,
  type UpdatePropertyDealInput,
  type UpdatePropertyFeaturesInput,
} from '@norde/core/properties/contracts';
import { Badge } from '@norde/ui/components/badge';
import { Button } from '@norde/ui/components/button';
import { Checkbox } from '@norde/ui/components/checkbox';
import { Form } from '@norde/ui/components/form';
import { Input } from '@norde/ui/components/input';
import { Label } from '@norde/ui/components/label';
import { PagedMultiSelect, type ComboboxOption } from '@norde/ui/components/paged-combobox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@norde/ui/components/select';
import { useId, useState, type SyntheticEvent } from 'react';
import { useForm, type FieldPath } from 'react-hook-form';

import { EMPTY_VALUE, formatMoney } from '../../../../lib/format';
import { contractResolver } from '../../../../lib/form';
import { loadTagOptions } from '../../actions';
import {
  changePropertyTagsAction,
  updatePropertyCharacteristicsAction,
  updatePropertyCustomAttributesAction,
  updatePropertyDealAction,
  updatePropertyFeaturesAction,
} from '../../detail-actions';
import { CONDITION_LABELS, DISPOSITION_LABELS, ORIENTATION_LABELS } from '../../detail-labels';
import { ATTRIBUTE_LABELS, FEATURE_KIND_LABELS } from '../../labels';
import {
  ChecklistField,
  NumberField,
  SelectField,
  SwitchField,
  TextField,
  submitWith,
} from '../../../shared/components/form-fields';
import {
  Facts,
  InlineFormActions,
  InlineSection,
  type InlineFormControls,
} from '../../../shared/components/inline-section';
import { centsToAmount } from './sections-listing';

const numberFormat = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

function count(value: number | undefined, unit = ''): string {
  return value === undefined ? EMPTY_VALUE : `${numberFormat.format(value)}${unit}`;
}

function yesNo(value: boolean): string {
  return value ? 'Sí' : 'No';
}

/** Muestra el atributo si el tipo de propiedad lo usa (Mi empresa → Propiedades). Sin configuración, todos. */
function shown(
  visible: readonly PropertyAttributeValue[],
  attribute: PropertyAttributeValue,
): boolean {
  return visible.length === 0 || visible.includes(attribute);
}

// ---------- Características ----------

type CharacteristicsKey = Exclude<keyof PanelPropertyDetail['characteristics'], never>;

const COUNT_FIELDS = [
  'rooms',
  'bedrooms',
  'bathrooms',
  'toilets',
  'parkingSpaces',
  'ageYears',
] as const satisfies readonly CharacteristicsKey[];
const SURFACE_FIELDS = [
  'surfaceTotalM2',
  'surfaceCoveredM2',
  'surfaceSemiCoveredM2',
  'surfaceLandM2',
  'frontM',
  'depthM',
] as const satisfies readonly CharacteristicsKey[];

export function CharacteristicsSection({
  detail,
  canEdit,
  visible,
}: {
  readonly detail: PanelPropertyDetail;
  readonly canEdit: boolean;
  readonly visible: readonly PropertyAttributeValue[];
}) {
  const c = detail.characteristics;
  const facts = [
    ...COUNT_FIELDS.filter((key) => shown(visible, key)).map((key) => ({
      label: ATTRIBUTE_LABELS[key],
      value: count(c[key], key === 'ageYears' ? ' años' : ''),
    })),
    ...SURFACE_FIELDS.filter((key) => shown(visible, key)).map((key) => ({
      label: ATTRIBUTE_LABELS[key],
      value: count(c[key], key === 'frontM' || key === 'depthM' ? ' m' : ' m²'),
    })),
    ...(shown(visible, 'orientation')
      ? [
          {
            label: 'Orientación',
            value: c.orientation ? ORIENTATION_LABELS[c.orientation] : EMPTY_VALUE,
          },
        ]
      : []),
    ...(shown(visible, 'condition')
      ? [{ label: 'Estado', value: c.condition ? CONDITION_LABELS[c.condition] : EMPTY_VALUE }]
      : []),
    ...(shown(visible, 'disposition')
      ? [
          {
            label: 'Disposición',
            value: c.disposition ? DISPOSITION_LABELS[c.disposition] : EMPTY_VALUE,
          },
        ]
      : []),
    ...(shown(visible, 'isFurnished') ? [{ label: 'Amoblado', value: yesNo(c.isFurnished) }] : []),
    ...(shown(visible, 'professionalUse')
      ? [{ label: 'Apto profesional', value: yesNo(c.professionalUse) }]
      : []),
  ];
  return (
    <InlineSection
      title="Características"
      canEdit={canEdit}
      view={<Facts items={facts} columns={3} />}
      form={(controls) => (
        <CharacteristicsForm detail={detail} visible={visible} controls={controls} />
      )}
    />
  );
}

function CharacteristicsForm({
  detail,
  visible,
  controls,
}: {
  readonly detail: PanelPropertyDetail;
  readonly visible: readonly PropertyAttributeValue[];
  readonly controls: InlineFormControls;
}) {
  const c = detail.characteristics;
  const form = useForm<UpdatePropertyCharacteristicsInput>({
    resolver: contractResolver(UpdatePropertyCharacteristicsInputSchema),
    defaultValues: { propertyId: detail.id, ...c },
  });
  const field = (key: (typeof COUNT_FIELDS)[number] | (typeof SURFACE_FIELDS)[number]) =>
    shown(visible, key) && (
      <NumberField
        key={key}
        control={form.control}
        name={key satisfies FieldPath<UpdatePropertyCharacteristicsInput>}
        label={ATTRIBUTE_LABELS[key]}
        step={COUNT_FIELDS.some((count) => count === key) ? '1' : '0.01'}
      />
    );
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={submitWith(form, (values) => {
          controls.save(
            () => updatePropertyCharacteristicsAction(values),
            'Características guardadas.',
          );
        })}
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{COUNT_FIELDS.map(field)}</div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{SURFACE_FIELDS.map(field)}</div>
        <div className="grid gap-4 sm:grid-cols-3">
          {shown(visible, 'orientation') && (
            <SelectField
              control={form.control}
              name="orientation"
              label="Orientación"
              options={ORIENTATION_VALUES}
              labels={ORIENTATION_LABELS}
              empty="Sin dato"
            />
          )}
          {shown(visible, 'condition') && (
            <SelectField
              control={form.control}
              name="condition"
              label="Estado de conservación"
              options={CONDITION_VALUES}
              labels={CONDITION_LABELS}
              empty="Sin dato"
            />
          )}
          {shown(visible, 'disposition') && (
            <SelectField
              control={form.control}
              name="disposition"
              label="Disposición"
              options={DISPOSITION_VALUES}
              labels={DISPOSITION_LABELS}
              empty="Sin dato"
            />
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {shown(visible, 'isFurnished') && (
            <SwitchField control={form.control} name="isFurnished" label="Amoblado" />
          )}
          {shown(visible, 'professionalUse') && (
            <SwitchField control={form.control} name="professionalUse" label="Apto profesional" />
          )}
        </div>
        <InlineFormActions controls={controls} />
      </form>
    </Form>
  );
}

// ---------- Condiciones de la operación ----------

const DEAL_FLAGS = [
  'isExclusive',
  'acceptsSwap',
  'immediateDeed',
  'hasFinancing',
  'creditEligible',
] as const satisfies readonly PropertyAttributeValue[];

export function DealSection({
  detail,
  canEdit,
  visible,
}: {
  readonly detail: PanelPropertyDetail;
  readonly canEdit: boolean;
  readonly visible: readonly PropertyAttributeValue[];
}) {
  const { deal } = detail;
  return (
    <InlineSection
      title="Condiciones de la operación"
      canEdit={canEdit}
      view={
        <Facts
          items={[
            ...(shown(visible, 'expenses')
              ? [
                  {
                    label: 'Expensas',
                    value:
                      deal.expensesCents === undefined
                        ? EMPTY_VALUE
                        : formatMoney({ amountCents: deal.expensesCents, currency: 'ARS' }),
                  },
                ]
              : []),
            ...DEAL_FLAGS.filter((key) => shown(visible, key)).map((key) => ({
              label: ATTRIBUTE_LABELS[key],
              value: yesNo(deal[key]),
            })),
          ]}
        />
      }
      form={(controls) => <DealForm detail={detail} visible={visible} controls={controls} />}
    />
  );
}

function DealForm({
  detail,
  visible,
  controls,
}: {
  readonly detail: PanelPropertyDetail;
  readonly visible: readonly PropertyAttributeValue[];
  readonly controls: InlineFormControls;
}) {
  const { deal } = detail;
  const form = useForm<UpdatePropertyDealInput>({
    resolver: contractResolver(UpdatePropertyDealInputSchema),
    defaultValues: {
      propertyId: detail.id,
      isExclusive: deal.isExclusive,
      acceptsSwap: deal.acceptsSwap,
      immediateDeed: deal.immediateDeed,
      hasFinancing: deal.hasFinancing,
      creditEligible: deal.creditEligible,
      expenses: centsToAmount(deal.expensesCents),
    },
  });
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-4"
        onSubmit={submitWith(form, (values) => {
          controls.save(() => updatePropertyDealAction(values), 'Condiciones guardadas.');
        })}
      >
        {shown(visible, 'expenses') && (
          <TextField
            control={form.control}
            name="expenses"
            label="Expensas mensuales ($)"
            inputMode="decimal"
            description="En pesos, sin puntos de miles. Vacío: sin expensas."
          />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {DEAL_FLAGS.filter((key) => shown(visible, key)).map((key) => (
            <SwitchField
              key={key}
              control={form.control}
              name={key}
              label={ATTRIBUTE_LABELS[key]}
            />
          ))}
        </div>
        <InlineFormActions controls={controls} />
      </form>
    </Form>
  );
}

// ---------- Servicios, ambientes y adicionales ----------

const CATALOG_ATTRIBUTE: Readonly<Record<FeatureKindValue, PropertyAttributeValue>> = {
  service: 'services',
  room: 'roomFeatures',
  amenity: 'amenities',
};

export function FeaturesSection({
  detail,
  canEdit,
  visible,
  catalog,
  truncated,
}: {
  readonly detail: PanelPropertyDetail;
  readonly canEdit: boolean;
  readonly visible: readonly PropertyAttributeValue[];
  readonly catalog: readonly FeatureRow[];
  readonly truncated: boolean;
}) {
  const kinds = (['service', 'room', 'amenity'] as const).filter((kind) =>
    shown(visible, CATALOG_ATTRIBUTE[kind]),
  );
  if (kinds.length === 0) return null;
  return (
    <InlineSection
      title="Servicios, ambientes y adicionales"
      canEdit={canEdit}
      view={
        <div className="flex flex-col gap-3">
          {kinds.map((kind) => {
            const items = detail.features.filter((feature) => feature.kind === kind);
            return (
              <div key={kind} className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">{FEATURE_KIND_LABELS[kind]}</p>
                {items.length === 0 ? (
                  <p className="text-sm">{EMPTY_VALUE}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((feature) => (
                      <Badge key={feature.id} variant="secondary">
                        {feature.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      }
      form={(controls) => (
        <FeaturesForm
          detail={detail}
          kinds={kinds}
          catalog={catalog}
          truncated={truncated}
          controls={controls}
        />
      )}
    />
  );
}

function FeaturesForm({
  detail,
  kinds,
  catalog,
  truncated,
  controls,
}: {
  readonly detail: PanelPropertyDetail;
  readonly kinds: readonly FeatureKindValue[];
  readonly catalog: readonly FeatureRow[];
  readonly truncated: boolean;
  readonly controls: InlineFormControls;
}) {
  const form = useForm<UpdatePropertyFeaturesInput>({
    resolver: contractResolver(UpdatePropertyFeaturesInputSchema),
    defaultValues: { propertyId: detail.id, featureIds: detail.features.map((f) => f.id) },
  });
  const hidden = detail.features.filter((feature) => !catalog.some((row) => row.id === feature.id));
  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-5"
        onSubmit={submitWith(form, (values) => {
          controls.save(() => updatePropertyFeaturesAction(values), 'Catálogo guardado.');
        })}
      >
        {kinds.map((kind) => (
          <ChecklistField
            key={kind}
            control={form.control}
            name="featureIds"
            label={FEATURE_KIND_LABELS[kind]}
            options={[
              ...catalog.filter((row) => row.kind === kind),
              ...hidden.filter((feature) => feature.kind === kind),
            ].map((row) => ({ value: row.id, label: row.name }))}
          />
        ))}
        {truncated && (
          <p className="text-xs text-muted-foreground">
            Se muestran los primeros 100 ítems de cada tipo del catálogo de Mi empresa.
          </p>
        )}
        <InlineFormActions controls={controls} />
      </form>
    </Form>
  );
}

// ---------- Atributos personalizados ----------

type CustomValue = string | number | boolean | undefined;

export function CustomAttributesSection({
  detail,
  canEdit,
}: {
  readonly detail: PanelPropertyDetail;
  readonly canEdit: boolean;
}) {
  const attributes = detail.customAttributes;
  if (attributes.length === 0) return null;
  const display = (value: CustomValue) =>
    value === undefined ? EMPTY_VALUE : typeof value === 'boolean' ? yesNo(value) : String(value);
  return (
    <InlineSection
      title="Atributos personalizados"
      canEdit={canEdit}
      view={
        <Facts
          items={attributes.map((attribute) => ({
            label: attribute.name,
            value: display(attribute.value),
          }))}
        />
      }
      form={(controls) => <CustomAttributesForm detail={detail} controls={controls} />}
    />
  );
}

function CustomAttributesForm({
  detail,
  controls,
}: {
  readonly detail: PanelPropertyDetail;
  readonly controls: InlineFormControls;
}) {
  const id = useId();
  const [values, setValues] = useState<Readonly<Record<string, CustomValue>>>(() =>
    Object.fromEntries(detail.customAttributes.map((attribute) => [attribute.id, attribute.value])),
  );
  const NONE = '__none__';

  function submit(event: SyntheticEvent) {
    event.preventDefault();
    const entries = Object.entries(values).flatMap(([attributeId, value]) =>
      value === undefined || value === '' ? [] : [{ attributeId, value }],
    );
    controls.save(
      () => updatePropertyCustomAttributesAction({ propertyId: detail.id, values: entries }),
      'Atributos guardados.',
    );
  }

  const set = (attributeId: string, value: CustomValue) => {
    setValues((current) => ({ ...current, [attributeId]: value }));
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        {detail.customAttributes.map((attribute) => {
          const value = values[attribute.id];
          const inputId = `${id}-${attribute.id}`;
          return (
            <div key={attribute.id} className="flex flex-col gap-1.5">
              <Label htmlFor={inputId}>
                {attribute.name}
                {!attribute.isActive && ' (desactivado)'}
              </Label>
              {attribute.kind === 'boolean' ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    id={inputId}
                    checked={value === true}
                    onCheckedChange={(checked) => {
                      set(attribute.id, checked === true ? true : undefined);
                    }}
                  />
                  Sí
                </label>
              ) : attribute.kind === 'select' ? (
                <Select
                  value={typeof value === 'string' ? value : NONE}
                  onValueChange={(next) => {
                    set(attribute.id, next === NONE ? undefined : next);
                  }}
                >
                  <SelectTrigger id={inputId} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sin dato</SelectItem>
                    {attribute.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={inputId}
                  type={attribute.kind === 'number' ? 'number' : 'text'}
                  step="any"
                  value={value === undefined || typeof value === 'boolean' ? '' : String(value)}
                  onChange={(event) => {
                    const raw = event.target.value;
                    set(
                      attribute.id,
                      raw === '' ? undefined : attribute.kind === 'number' ? Number(raw) : raw,
                    );
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <InlineFormActions controls={controls} />
    </form>
  );
}

// ---------- Etiquetas ----------

export function TagsSection({
  detail,
  canEdit,
}: {
  readonly detail: PanelPropertyDetail;
  readonly canEdit: boolean;
}) {
  return (
    <InlineSection
      title="Etiquetas"
      canEdit={canEdit}
      view={
        detail.tags.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin etiquetas.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {detail.tags.map((tag) => (
              <Badge key={tag.id} variant="secondary">
                {tag.groupName === undefined ? tag.name : `${tag.groupName}: ${tag.name}`}
              </Badge>
            ))}
          </div>
        )
      }
      form={(controls) => <TagsForm detail={detail} controls={controls} />}
    />
  );
}

function TagsForm({
  detail,
  controls,
}: {
  readonly detail: PanelPropertyDetail;
  readonly controls: InlineFormControls;
}) {
  const [tags, setTags] = useState<readonly ComboboxOption[]>(
    detail.tags.map((tag) => ({
      value: tag.id,
      label: tag.name,
      ...(tag.groupName === undefined ? {} : { hint: tag.groupName }),
    })),
  );
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        controls.save(
          () =>
            changePropertyTagsAction({ propertyId: detail.id, tagIds: tags.map((t) => t.value) }),
          'Etiquetas guardadas.',
        );
      }}
    >
      <PagedMultiSelect
        value={tags}
        onChange={setTags}
        loadPage={loadTagOptions}
        placeholder="Elegí las etiquetas"
        searchPlaceholder="Buscar etiqueta"
      />
      <div className="flex justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setTags([]);
          }}
        >
          Quitar todas
        </Button>
        <InlineFormActions controls={controls} />
      </div>
    </form>
  );
}
