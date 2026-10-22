import { startLocalPostgres } from './pg';

const { url, stop } = await startLocalPostgres({ dataDir: 'pg', port: 5433, database: 'backlog' });

console.log(`\nPostgreSQL listo en ${url}`);
console.log('Dejá esta terminal abierta. Ctrl+C para detenerlo.\n');

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await stop();
    process.exit(0);
  });
}
