/**
 * Chat por consola contra el agente real: base de datos, casos de uso y OpenAI, con la
 * respuesta impresa en lugar de enviada por WhatsApp. Sirve para probar cambios de prompt.
 *
 *   pnpm db:setup && pnpm db:seed          # una vez: tablas y propiedades de prueba
 *   pnpm --filter @norde/agent simulate
 *
 * Necesita OPENAI_API_KEY y DATABASE_URL en apps/agent/.env. No hacen falta credenciales
 * de WhatsApp. Las conversaciones y los clientes quedan guardados en la base local.
 */

import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';

import type { ChannelMessenger, OutboundMessage } from '@norde/core/conversations';
import { ok } from '@norde/core/shared';

import { loadEnv } from '../src/config/env';
import { createLogger } from '../src/config/logger';
import { createContainer } from '../src/container';

/** Costo aproximado de un mensaje de servicio de WhatsApp en Argentina (USD). */
const COST_PER_MESSAGE_USD = 0.026;

function render(message: OutboundMessage): string {
  switch (message.type) {
    case 'text':
      return message.text;
    case 'image':
      return `[FOTO ${message.imageUrl}]\n${message.caption ?? ''}`;
    case 'buttons':
      return `${message.text}\n  ${message.buttons.map((b) => `[ ${b.title} ]`).join('  ')}`;
  }
}

let sent = 0;
const consoleMessenger: ChannelMessenger = {
  send: (_to, message) => {
    sent += 1;
    stdout.write(`\nnorde > ${render(message).replaceAll('\n', '\n        ')}\n`);
    return Promise.resolve(ok({ channelMessageId: `sim-${Date.now()}-${sent}` }));
  },
  markAsRead: () => Promise.resolve(),
};

const randomPhone = () => `54911${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

const env = loadEnv();
const logger = createLogger({
  ...env,
  LOG_LEVEL: env.LOG_LEVEL === 'info' ? 'warn' : env.LOG_LEVEL,
});
const container = createContainer(env, logger, { whatsappMessenger: consoleMessenger });

if (!container.whatsapp) {
  stdout.write('Falta OPENAI_API_KEY en apps/agent/.env\n');
  process.exit(1);
}
const { handler } = container.whatsapp;
await container.startJobs();

let phone = randomPhone();
let sequence = 0;
stdout.write(
  `Simulador de Norde · modelo ${env.OPENAI_MODEL} · contacto +${phone}\n` +
    'Escribí "salir" para terminar o "nuevo" para empezar otra conversación con otro número.\n\n',
);

const rl = createInterface({ input: stdin, output: stdout });
for (;;) {
  const line = (await rl.question('vos > ')).trim();
  if (!line) continue;
  if (line === 'salir') break;
  if (line === 'nuevo') {
    phone = randomPhone();
    stdout.write(`  (conversación nueva con +${phone})\n\n`);
    continue;
  }

  const started = Date.now();
  const before = sent;
  sequence += 1;
  await handler.handle([
    {
      phoneNumberId: 'simulator',
      from: phone,
      profileName: 'Cliente de prueba',
      message: {
        channelMessageId: `sim-in-${Date.now()}-${sequence}`,
        kind: 'text',
        text: line,
        sentAt: new Date(),
        rawType: 'text',
      },
    },
  ]);
  const replied = sent > before;
  stdout.write(
    `\n  (${Date.now() - started} ms · ${replied ? 'respondió' : 'sin respuesta'} · mensajes enviados: ${sent} ≈ ${(sent * COST_PER_MESSAGE_USD).toFixed(3)} USD)\n\n`,
  );
}

rl.close();
await container.close();
