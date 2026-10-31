import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { PANEL_TOURS } from './panel-tours';

const SOURCE_DIRS = [
  join(import.meta.dirname, '../../..'),
  join(import.meta.dirname, '../../../../../../packages/ui/src'),
];

/** Los `data-tour` que hay en los componentes de gestion y de @norde/ui. */
function anchorsInSource(): ReadonlySet<string> {
  const anchors = new Set<string>();
  for (const dir of SOURCE_DIRS) {
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((file) =>
      file.endsWith('.tsx'),
    );
    for (const file of files) {
      for (const match of readFileSync(join(dir, file), 'utf8').matchAll(/data-tour="([^"]+)"/g)) {
        if (match[1] !== undefined) anchors.add(match[1]);
      }
    }
  }
  return anchors;
}

describe('PANEL_TOURS', () => {
  it('points every step to an element that exists', () => {
    const anchors = anchorsInSource();
    const missing = PANEL_TOURS.flatMap((tour) => tour.steps)
      .flatMap((step) => (step.target === undefined ? [] : [step.target]))
      .filter((target) => !anchors.has(target));
    expect(missing).toEqual([]);
  });

  it('gives each screen a single tour', () => {
    const paths = PANEL_TOURS.flatMap((tour) => tour.paths);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
