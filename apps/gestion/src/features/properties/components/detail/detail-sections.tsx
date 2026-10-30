import type { SourceAppraisal } from '@norde/core/appraisals/contracts';
import type {
  FeatureRow,
  PanelPropertyDetail,
  PropertyAttributeValue,
} from '@norde/core/properties/contracts';

import type { DetailPermissions } from './permissions';
import {
  CharacteristicsSection,
  CustomAttributesSection,
  DealSection,
  FeaturesSection,
} from './sections-attributes';
import { InternalSection } from './sections-internal';
import {
  DescriptionSection,
  LocationSection,
  MapSection,
  OperationsSection,
} from './sections-listing';

/** La pestaña Detalles: cada bloque se edita en el lugar con su propio caso de uso. */
export function DetailSections({
  detail,
  sourceAppraisal,
  permissions,
  visibleAttributes,
  catalog,
  catalogTruncated,
  showCustomAttributes,
}: {
  readonly detail: PanelPropertyDetail;
  readonly sourceAppraisal: SourceAppraisal | undefined;
  readonly permissions: DetailPermissions;
  readonly visibleAttributes: readonly PropertyAttributeValue[];
  readonly catalog: readonly FeatureRow[];
  readonly catalogTruncated: boolean;
  /** Los atributos personalizados están ocultos mientras Norde no los use (#50). */
  readonly showCustomAttributes: boolean;
}) {
  const canEdit = permissions.edit;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <OperationsSection detail={detail} canEdit={canEdit} />
      <DealSection detail={detail} canEdit={canEdit} visible={visibleAttributes} />
      <div className="lg:col-span-2">
        <CharacteristicsSection detail={detail} canEdit={canEdit} visible={visibleAttributes} />
      </div>
      <LocationSection detail={detail} canEdit={canEdit} />
      <MapSection detail={detail} />
      <InternalSection
        detail={detail}
        sourceAppraisal={sourceAppraisal}
        canEdit={canEdit}
        canChangeProducer={permissions.changeProducer}
      />
      <FeaturesSection
        detail={detail}
        canEdit={canEdit}
        visible={visibleAttributes}
        catalog={catalog}
        truncated={catalogTruncated}
      />
      <div className="lg:col-span-2">
        <DescriptionSection detail={detail} canEdit={canEdit} />
      </div>
      {showCustomAttributes && <CustomAttributesSection detail={detail} canEdit={canEdit} />}
    </div>
  );
}
