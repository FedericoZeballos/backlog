import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

export const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(apiRoot, '../..');

interface LocalPgOptions {
  /** Folder under <repo>/.data */
  dataDir: string;
  port: number;
  database: string;
  quiet?: boolean;
}

/**
 * Starts a real PostgreSQL server from npm-provided binaries (no system install needed),
 * creates the database if missing and applies pending migrations.
 */
export async function startLocalPostgres(opts: LocalPgOptions) {
  const databaseDir = path.join(repoRoot, '.data', opts.dataDir);
  const pg = new EmbeddedPostgres({
    databaseDir,
    user: 'backlog',
    password: 'backlog',
    port: opts.port,
    persistent: true,
    // Without this, Windows initialises the cluster in WIN1252 and rejects emoji or non-Latin text.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: opts.quiet ? () => {} : console.log,
  });

  if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) {
    await pg.initialise();
  }
  await stopLeftoverServer(databaseDir);
  await pg.start();

  const client = pg.getPgClient();
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [opts.database]);
  await client.end();
  if (!exists.rowCount) await pg.createDatabase(opts.database);

  const url = `postgresql://backlog:backlog@localhost:${opts.port}/${opts.database}`;
  execSync('npx prisma migrate deploy', {
    cwd: apiRoot,
    stdio: opts.quiet ? 'pipe' : 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });

  return { url, stop: () => pg.stop() };
}

/**
 * Closing the terminal (instead of Ctrl+C) leaves the server running and the next
 * start fails because the data folder is in use. Stop that orphan cleanly first.
 */
async function stopLeftoverServer(databaseDir: string) {
  if (!existsSync(path.join(databaseDir, 'postmaster.pid'))) return;
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const { pg_ctl } = (await import(`@embedded-postgres/${platform}-${process.arch}`)) as { pg_ctl: string };
  if (spawnSync(pg_ctl, ['status', '-D', databaseDir]).status !== 0) return; // stale pid file only
  console.log('Había un PostgreSQL de una sesión anterior; lo detengo antes de arrancar.');
  spawnSync(pg_ctl, ['stop', '-D', databaseDir, '-m', 'fast'], { stdio: 'inherit' });
}
