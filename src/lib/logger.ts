type Level = 'info' | 'warn' | 'error' | 'debug';

type LogData = Record<string, unknown>;

const IS_PROD = process.env.NODE_ENV === 'production';

function emit(level: Level, scope: string, event: string, data?: LogData): void {
  const entry = {
    level,
    scope,
    event,
    ts: new Date().toISOString(),
    ...(data ?? {}),
  };

  if (IS_PROD) {
    const line = JSON.stringify(entry);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    return;
  }

  const extras = data ? ' ' + Object.entries(data).map(([k, v]) => `${k}=${format(v)}`).join(' ') : '';
  const head = `[${scope}] ${event}`;
  if (level === 'error') console.error(head + extras);
  else if (level === 'warn') console.warn(head + extras);
  else console.log(head + extras);
}

function format(v: unknown): string {
  if (v == null) return String(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

export function createLogger(scope: string) {
  return {
    info: (event: string, data?: LogData) => emit('info', scope, event, data),
    warn: (event: string, data?: LogData) => emit('warn', scope, event, data),
    error: (event: string, data?: LogData) => emit('error', scope, event, data),
    debug: (event: string, data?: LogData) => emit('debug', scope, event, data),
  };
}

export type Logger = ReturnType<typeof createLogger>;
