import { neon } from '@neondatabase/serverless';

export const sql = neon(process.env.DATABASE_URL!);

// Log entry type
export interface LogEntry {
  id?: number;
  timestamp: string;
  category: 'conversation' | 'exec' | 'file' | 'api' | 'deploy' | 'cost' | 'error' | 'system';
  action: string;
  details: Record<string, unknown>;
  session_id?: string;
  duration_ms?: number;
  cost?: number;
  created_at?: string;
}

// Initialize database tables
export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS logs (
      id SERIAL PRIMARY KEY,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      category VARCHAR(50) NOT NULL,
      action VARCHAR(255) NOT NULL,
      details JSONB DEFAULT '{}',
      session_id VARCHAR(100),
      duration_ms INTEGER,
      cost DECIMAL(10, 6),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(category)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_logs_session ON logs(session_id)
  `;

  // Cost tracking table
  await sql`
    CREATE TABLE IF NOT EXISTS costs (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      service VARCHAR(100) NOT NULL,
      metric VARCHAR(100) NOT NULL,
      value DECIMAL(15, 6) NOT NULL,
      unit VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(date, service, metric)
    )
  `;

  return { success: true };
}

// Insert a log entry
export async function insertLog(entry: Omit<LogEntry, 'id' | 'created_at'>) {
  const result = await sql`
    INSERT INTO logs (timestamp, category, action, details, session_id, duration_ms, cost)
    VALUES (
      ${entry.timestamp || new Date().toISOString()},
      ${entry.category},
      ${entry.action},
      ${JSON.stringify(entry.details)},
      ${entry.session_id || null},
      ${entry.duration_ms || null},
      ${entry.cost || null}
    )
    RETURNING id
  `;
  return result[0];
}

// Query logs
export async function queryLogs(options: {
  category?: string;
  session_id?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}) {
  const { category, session_id, from, to, limit = 100, offset = 0 } = options;

  // Build query dynamically
  let query = sql`
    SELECT * FROM logs
    WHERE 1=1
    ${category ? sql`AND category = ${category}` : sql``}
    ${session_id ? sql`AND session_id = ${session_id}` : sql``}
    ${from ? sql`AND timestamp >= ${from}` : sql``}
    ${to ? sql`AND timestamp <= ${to}` : sql``}
    ORDER BY timestamp DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  return query;
}

// Get daily cost summary
export async function getDailyCosts(date: string) {
  return sql`
    SELECT service, metric, SUM(value) as total, unit
    FROM costs
    WHERE date = ${date}
    GROUP BY service, metric, unit
  `;
}
