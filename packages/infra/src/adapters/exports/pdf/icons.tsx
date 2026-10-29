import { Circle, Path, Rect, Svg } from '@react-pdf/renderer';
import {
  Bath,
  BedDouble,
  Car,
  ChartColumn,
  Check,
  DoorOpen,
  ExternalLink,
  Eye,
  Globe,
  Heart,
  type IconNode,
  Mail,
  MapPin,
  Maximize,
  MessageCircle,
  MessageSquareText,
  Phone,
  Send,
  User,
  UserCheck,
  Users,
} from 'lucide';
import type { ReactElement } from 'react';

import { PDF_COLORS } from './theme';

// Íconos de línea de lucide (los mismos del panel), dibujados como SVG del PDF.

const ICONS = {
  rooms: DoorOpen,
  bedrooms: BedDouble,
  bathrooms: Bath,
  surface: Maximize,
  parking: Car,
  location: MapPin,
  phone: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  agent: User,
  web: Globe,
  send: Send,
  inquiry: MessageSquareText,
  views: Eye,
  contacts: UserCheck,
  favorites: Heart,
  interested: Users,
  chart: ChartColumn,
  link: ExternalLink,
  check: Check,
} as const satisfies Record<string, IconNode>;

export type PdfIconName = keyof typeof ICONS;

function attribute(attrs: Readonly<Record<string, unknown>>, name: string): string {
  const value = attrs[name];
  return typeof value === 'string' || typeof value === 'number' ? value.toString() : '';
}

function shape(tag: string, attrs: Readonly<Record<string, unknown>>, key: number, color: string) {
  const stroke = { stroke: color, strokeWidth: 2, fill: 'none' } as const;
  switch (tag) {
    case 'path':
      return (
        <Path
          key={key}
          d={attribute(attrs, 'd')}
          {...stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case 'circle':
      return (
        <Circle
          key={key}
          cx={attribute(attrs, 'cx')}
          cy={attribute(attrs, 'cy')}
          r={attribute(attrs, 'r')}
          {...stroke}
        />
      );
    case 'rect':
      return (
        <Rect
          key={key}
          x={attribute(attrs, 'x')}
          y={attribute(attrs, 'y')}
          width={attribute(attrs, 'width')}
          height={attribute(attrs, 'height')}
          rx={attribute(attrs, 'rx')}
          {...stroke}
        />
      );
    default:
      return null;
  }
}

/** Un ícono de `size` puntos. Va dentro de un `View`, nunca de un `Text` (react-pdf no lo dibuja). */
export function PdfIcon({
  name,
  size = 10,
  color = PDF_COLORS.brand,
}: {
  readonly name: PdfIconName;
  readonly size?: number;
  readonly color?: string;
}): ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {ICONS[name].map(([tag, attrs], index) => shape(tag, attrs, index, color))}
    </Svg>
  );
}
