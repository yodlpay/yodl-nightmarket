/**
 * Entry point: load env, hydrate the store, listen.
 *
 * Bound to 0.0.0.0 rather than localhost on purpose. The app that talks to this
 * runs on a phone, and a phone's `localhost` is the phone. Reachable on the LAN
 * is the difference between the demo working on a device and not.
 */

import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadEnv } from './env';
import { buildSeedPayments } from './lib/seed';
import { PaymentStore } from './lib/store';

const env = loadEnv();

const store = new PaymentStore(env.NIGHTMARKET_DATA_FILE);
await store.hydrate();

// Never seed over existing rows — see lib/seed.ts.
if (env.NIGHTMARKET_SEED && store.size === 0) {
  store.seed(buildSeedPayments());
  console.log(`[seed] planted ${store.size} stalls`);
}

const app = createApp({ env, store });

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: '0.0.0.0' }, (info) => {
  console.log('');
  console.log('  ┌─ nightmarket api ────────────────────────────────');
  console.log(`  │  http://localhost:${info.port}`);
  console.log(`  │  integration  ${env.YODL_INTEGRATION_ADDRESS}`);
  console.log(`  │  webhook      POST /webhooks/yodl`);
  console.log(`  │  store        ${env.NIGHTMARKET_DATA_FILE} (${store.size} payments)`);
  console.log('  └──────────────────────────────────────────────────');
  console.log('');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      // Flush before exiting so a payment recorded milliseconds before Ctrl-C
      // is still there on the next run.
      void store.flush().then(() => process.exit(0));
    });
  });
}
