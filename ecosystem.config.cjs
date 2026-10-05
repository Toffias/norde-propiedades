// Procesos de producción bajo PM2 (docs/arquitectura.md §10, docs/deploy.md). Cada app lee su
// propio `.env` desde su carpeta. Deploy: `pm2 startOrReload ecosystem.config.cjs --update-env`.
//
// gestion corre el relay del outbox y los workers de pg-boss (ADR 0021): una sola instancia, en
// modo fork. El relay (`FOR UPDATE SKIP LOCKED`) y pg-boss toleran más de una, pero si algún día
// se escala, solo una lleva `JOBS_ENABLED=true` (el webhook de consultas limita por instancia).
//
// El VPS es compartido con otros proyectos: los nombres llevan el prefijo `norde-` y los puertos
// (3020 y 3021; el agente toma el suyo de `PORT` en su `.env`) no chocan con los de las otras apps.

/** Le da tiempo al cierre ordenado (jobs en curso, turnos del agente) antes del SIGKILL. */
const KILL_TIMEOUT_MS = 15_000;

/**
 * Node con el que corren las tres apps (el monorepo pide >= 24). El deploy lo pasa en
 * `NORDE_NODE_BIN` cuando el Node del sistema es otro; si no, se usa el `node` del PATH.
 */
const NODE_BIN = process.env.NORDE_NODE_BIN || 'node';

module.exports = {
  apps: [
    {
      name: 'norde-web',
      cwd: 'apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3020',
      interpreter: NODE_BIN,
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: KILL_TIMEOUT_MS,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'norde-gestion',
      cwd: 'apps/gestion',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3021',
      interpreter: NODE_BIN,
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: KILL_TIMEOUT_MS,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'norde-agent',
      cwd: 'apps/agent',
      script: 'src/main.ts',
      interpreter: NODE_BIN,
      interpreter_args: '--import tsx',
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: KILL_TIMEOUT_MS,
      env: { NODE_ENV: 'production' },
    },
  ],
};
