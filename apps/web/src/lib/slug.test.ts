import { describe, expect, it } from 'vitest';

import { slugify } from './slug';

describe('slugify', () => {
  it('removes accents and ñ instead of dropping the letters', () => {
    expect(slugify('Cómo se calcula el aumento por IPC')).toBe(
      'como-se-calcula-el-aumento-por-ipc',
    );
    expect(slugify('Vivir en Núñez: año 2026')).toBe('vivir-en-nunez-ano-2026');
  });

  it('collapses symbols and trims the separators', () => {
    expect(slugify('  ¿Cuánto cuesta escriturar?  ')).toBe('cuanto-cuesta-escriturar');
    expect(slugify('Créditos -- hipotecarios / UVA')).toBe('creditos-hipotecarios-uva');
  });
});
