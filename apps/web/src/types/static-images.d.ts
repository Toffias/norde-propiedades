// Tipos de los imports de imágenes (`import foto from './foto.jpg'`). Next los declara en
// `next-env.d.ts`, pero ese archivo se genera y no se commitea: sin esta referencia, el lint
// del CI (que corre antes de `next typegen`) ve esos imports como `error`.
/// <reference types="next/image-types/global" />
