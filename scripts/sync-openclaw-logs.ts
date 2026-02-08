/**
 * Sync OpenClaw logs to Pixan Postgres
 * Reads JSONL log files and sends new entries to the API
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';

const API_URL = process.env.PIXAN_LOGS_API || 'https://pixan-logs.vercel.app/api/logs';
const OPENCLAW_LOG_DIR = '/tmp/openclaw';
const STATE_FILE = '/tmp/pixan-log-sync-state.json';

interface SyncState {
  lastFile: string;
  lastLine: number;
  lastTimestamp: string;
}

interface OpenClawLogEntry {
  '0'?: string;
  '1'?: string;
  _meta?: {
    date: string;
    logLevelName: string;
  };
  time?: string;
}

function loadState(): SyncState {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  }
  return { lastFile: '', lastLine: 0, lastTimestamp: '' };
}

function saveState(state: SyncState) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getTodayLogFile(): string {
  const today = new Date().toISOString().split('T')[0];
  return `${OPENCLAW_LOG_DIR}/openclaw-${today}.log`;
}

function parseLogEntry(line: string): { category: string; action: string; details: Record<string, unknown>; timestamp: string } | null {
  try {
    const entry: OpenClawLogEntry = JSON.parse(line);
    const message = entry['1'] || '';
    const subsystem = entry['0'] || '';
    const timestamp = entry.time || entry._meta?.date || new Date().toISOString();

    // Parse tool calls
    if (message.includes('tool start:')) {
      const match = message.match(/tool=(\w+) toolCallId=(\S+)/);
      if (match) {
        return {
          category: 'exec',
          action: `tool:${match[1]}:start`,
          details: { toolCallId: match[2], raw: message },
          timestamp
        };
      }
    }

    if (message.includes('tool end:')) {
      const match = message.match(/tool=(\w+) toolCallId=(\S+)/);
      if (match) {
        return {
          category: 'exec',
          action: `tool:${match[1]}:end`,
          details: { toolCallId: match[2], raw: message },
          timestamp
        };
      }
    }

    // Parse run completions
    if (message.includes('run complete')) {
      return {
        category: 'conversation',
        action: 'run:complete',
        details: { raw: message },
        timestamp
      };
    }

    // Parse model usage
    if (message.includes('model.usage') || message.includes('tokens')) {
      return {
        category: 'cost',
        action: 'model:usage',
        details: { raw: message },
        timestamp
      };
    }

    // Parse errors
    if (entry._meta?.logLevelName === 'ERROR') {
      return {
        category: 'error',
        action: 'error',
        details: { raw: message, subsystem },
        timestamp
      };
    }

    return null; // Skip non-interesting entries
  } catch {
    return null;
  }
}

async function sendToApi(entry: { category: string; action: string; details: Record<string, unknown>; timestamp: string }) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry)
    });
    return response.ok;
  } catch (error) {
    console.error('Failed to send log:', error);
    return false;
  }
}

async function sync() {
  const state = loadState();
  const logFile = getTodayLogFile();

  if (!existsSync(logFile)) {
    console.log(`Log file not found: ${logFile}`);
    return;
  }

  const content = readFileSync(logFile, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  // If new file, reset state
  if (state.lastFile !== logFile) {
    state.lastFile = logFile;
    state.lastLine = 0;
  }

  const newLines = lines.slice(state.lastLine);
  console.log(`Processing ${newLines.length} new lines from ${logFile}`);

  let sent = 0;
  for (const line of newLines) {
    const parsed = parseLogEntry(line);
    if (parsed) {
      const success = await sendToApi(parsed);
      if (success) sent++;
    }
  }

  state.lastLine = lines.length;
  state.lastTimestamp = new Date().toISOString();
  saveState(state);

  console.log(`Synced ${sent} log entries`);
}

sync().catch(console.error);
