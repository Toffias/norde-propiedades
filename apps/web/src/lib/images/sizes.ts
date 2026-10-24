// Anchos que entrega el optimizador de `next/image`. Pocos a propósito: cada ancho es una
// conversión y una entrada de caché distinta, y con menos anchos la caché se calienta antes.
// Las fotos de las propiedades llegan de 1600 px (la variante web): no se agrandan.

/** Anchos para imágenes que ocupan buena parte de la pantalla (`sizes` en vw). */
export const DEVICE_SIZES = [640, 828, 1080, 1280, 1600, 1920];

/** Anchos para imágenes chicas de tamaño fijo (avatares, miniaturas del chat). */
export const IMAGE_SIZES = [96, 256, 384];

/** La calidad por defecto de `next/image`: la única que se usa en el sitio. */
export const IMAGE_QUALITY = 75;

/**
 * Los anchos que se precalientan para cada foto de una propiedad: los que piden las tarjetas, el
 * mosaico de la ficha y el visor (de 384 px en adelante).
 */
export const WARM_WIDTHS = [...IMAGE_SIZES, ...DEVICE_SIZES].filter((width) => width >= 384);
