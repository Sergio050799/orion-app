import { Pool } from 'pg';

// Singleton pool — reused across all API routes in the same Node process
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 3_000,
});

export default pool;

export async function logUsage(
  action: string,
  meta?: Record<string, unknown>,
  ipHash?: string,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await pool.query(
      'INSERT INTO usage_log (action, meta, ip_hash) VALUES ($1, $2, $3)',
      [action, meta ? JSON.stringify(meta) : null, ipHash ?? null],
    );
  } catch {
    // no crítico
  }
}
