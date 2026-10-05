// Procesos de producción bajo PM2 (docs/arquitectura.md §10). Cada app lee su propio `.env`
// desde su carpeta. Deploy: `turbo build` y después `pm2 reload ecosystem.config.cjs`.
//
// gestion corre el relay del outbox y los workers de pg-boss (ADR 0021): una sola instancia, en
// modo fork. El relay (`FOR UPDATE SKIP LOCKED`) y pg-boss toleran más de una, pero si algún día
// se escala, solo una lleva `JOBS_ENABLED=true` (el webhook de consultas limita por instancia).

/** Le da tiempo al cierre ordenado (jobs en curso, turnos del agente) antes del SIGKILL. */
const KILL_TIMEOUT_MS = 15_000;

module.exports = {
  apps: [
    {
      name: 'web',
      cwd: 'apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3000',
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: KILL_TIMEOUT_MS,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'gestion',
      cwd: 'apps/gestion',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3001',
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: KILL_TIMEOUT_MS,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'agent',
      cwd: 'apps/agent',
      script: 'src/main.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx',
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: KILL_TIMEOUT_MS,
      env: { NODE_ENV: 'production' },
    },
  ],
};
