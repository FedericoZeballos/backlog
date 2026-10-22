import { startLocalPostgres } from '../scripts/pg';

// A separate cluster (port 5434) so tests never touch the development data.
export default async function setup() {
  const { stop } = await startLocalPostgres({ dataDir: 'pg-test', port: 5434, database: 'backlog_test', quiet: true });
  return async () => {
    await stop();
  };
}
