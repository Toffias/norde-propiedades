import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');

/** Corre `pnpm <args>` desde la raíz del monorepo y falla si el comando falla. */
export function runPnpm(
  label: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): void {
  console.log(`\n→ ${label}`);
  // Un solo string de comando: los argumentos son constantes de los scripts (nunca input externo).
  const result = spawnSync(`pnpm ${args.join(' ')}`, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env,
  });
  if (result.status !== 0) throw new Error(`Falló: ${label}`);
}
