import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLogger } from '@/lib/logger';

describe('logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cria logger com escopo', () => {
    const log = createLogger('webhook');
    log.info('hello');
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[webhook]'));
    expect(logSpy.mock.calls[0][0]).toContain('hello');
  });

  it('formata key=value em dev', () => {
    const log = createLogger('test');
    log.info('event_name', { msg_id: 'wamid.1', from: '5531' });
    const out = logSpy.mock.calls[0][0] as string;
    expect(out).toContain('event_name');
    expect(out).toContain('msg_id=wamid.1');
    expect(out).toContain('from=5531');
  });

  it('usa console.warn para warn', () => {
    const log = createLogger('s');
    log.warn('e');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('usa console.error para error', () => {
    const log = createLogger('s');
    log.error('e');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('inclui null/undefined formatados', () => {
    const log = createLogger('s');
    log.info('e', { a: null, b: undefined });
    const out = logSpy.mock.calls[0][0] as string;
    expect(out).toContain('a=null');
    expect(out).toContain('b=undefined');
  });

  it('serializa objetos como JSON', () => {
    const log = createLogger('s');
    log.info('e', { obj: { x: 1 } });
    const out = logSpy.mock.calls[0][0] as string;
    expect(out).toContain('obj={"x":1}');
  });
});
