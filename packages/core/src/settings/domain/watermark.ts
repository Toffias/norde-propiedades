import { err, ok, type Result } from '../../shared/domain/result';

export const WATERMARK_POSITIONS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;
export type WatermarkPosition = (typeof WATERMARK_POSITIONS)[number];

export const WATERMARK_SIZE_RANGE = { min: 5, max: 50 } as const;
export const WATERMARK_OPACITY_RANGE = { min: 0, max: 100 } as const;

/** Margen entre el logo y el borde de la foto, en porcentaje del lado más corto. */
const MARGIN_PERCENT = 3;

export type InvalidWatermarkError =
  | { readonly type: 'InvalidWatermark'; readonly reason: 'size' | 'opacity' }
  | { readonly type: 'WatermarkLogoRequired' };

export interface WatermarkProps {
  readonly enabled: boolean;
  /** Logo de la marca de agua en el storage. */
  readonly logoKey: string | undefined;
  /** Ancho del logo en porcentaje del ancho de la foto. */
  readonly sizePercent: number;
  readonly position: WatermarkPosition;
  /** 0 es transparente y 100, opaco. */
  readonly opacity: number;
}

export interface WatermarkPlacement {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function inRange(value: number, range: { readonly min: number; readonly max: number }): boolean {
  return Number.isInteger(value) && value >= range.min && value <= range.max;
}

/**
 * Marca de agua de las fotos. Se aplica al generar las variantes para portales y PDF; el original
 * nunca se modifica.
 */
export class Watermark {
  private constructor(private readonly props: WatermarkProps) {}

  static readonly DEFAULTS: WatermarkProps = {
    enabled: false,
    logoKey: undefined,
    sizePercent: 20,
    position: 'bottom-right',
    opacity: 60,
  };

  static create(props: WatermarkProps): Result<Watermark, InvalidWatermarkError> {
    if (!inRange(props.sizePercent, WATERMARK_SIZE_RANGE)) {
      return err({ type: 'InvalidWatermark', reason: 'size' });
    }
    if (!inRange(props.opacity, WATERMARK_OPACITY_RANGE)) {
      return err({ type: 'InvalidWatermark', reason: 'opacity' });
    }
    if (props.enabled && props.logoKey === undefined) return err({ type: 'WatermarkLogoRequired' });
    return ok(new Watermark(props));
  }

  static disabled(): Watermark {
    return new Watermark(Watermark.DEFAULTS);
  }

  get enabled(): boolean {
    return this.props.enabled;
  }

  get logoKey(): string | undefined {
    return this.props.logoKey;
  }

  get sizePercent(): number {
    return this.props.sizePercent;
  }

  get position(): WatermarkPosition {
    return this.props.position;
  }

  get opacity(): number {
    return this.props.opacity;
  }

  toProps(): WatermarkProps {
    return { ...this.props };
  }

  /**
   * Dónde va el logo sobre una foto, en píxeles: lo escala al porcentaje configurado del ancho
   * (sin pasarse del alto) y lo ubica en la posición elegida, con margen.
   */
  placement(
    image: { readonly width: number; readonly height: number },
    logo: {
      readonly width: number;
      readonly height: number;
    },
  ): WatermarkPlacement {
    const margin = Math.round((Math.min(image.width, image.height) * MARGIN_PERCENT) / 100);
    const maxWidth = Math.max(1, Math.round((image.width * this.props.sizePercent) / 100));
    const maxHeight = Math.max(1, image.height - 2 * margin);
    const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height);
    const width = Math.max(1, Math.round(logo.width * scale));
    const height = Math.max(1, Math.round(logo.height * scale));

    const [vertical, horizontal] = this.axes();
    const left =
      horizontal === 'left'
        ? margin
        : horizontal === 'right'
          ? image.width - width - margin
          : Math.round((image.width - width) / 2);
    const top =
      vertical === 'top'
        ? margin
        : vertical === 'bottom'
          ? image.height - height - margin
          : Math.round((image.height - height) / 2);
    return { left: Math.max(0, left), top: Math.max(0, top), width, height };
  }

  private axes(): readonly ['top' | 'middle' | 'bottom', 'left' | 'center' | 'right'] {
    switch (this.props.position) {
      case 'top-left':
        return ['top', 'left'];
      case 'top-center':
        return ['top', 'center'];
      case 'top-right':
        return ['top', 'right'];
      case 'middle-left':
        return ['middle', 'left'];
      case 'center':
        return ['middle', 'center'];
      case 'middle-right':
        return ['middle', 'right'];
      case 'bottom-left':
        return ['bottom', 'left'];
      case 'bottom-center':
        return ['bottom', 'center'];
      case 'bottom-right':
        return ['bottom', 'right'];
    }
  }
}
