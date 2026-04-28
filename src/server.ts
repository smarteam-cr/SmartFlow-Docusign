import 'dotenv/config';
import { loadEnv } from './config/env.js';
import { buildApp } from './app.js';

async function start(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp(env);

  try {
    const address = await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info({ address }, 'server listening');
  } catch (err) {
    app.log.error({ err }, 'failed to start server');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutdown signal received');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('[FATAL] unable to bootstrap server', err);
  process.exit(1);
});
