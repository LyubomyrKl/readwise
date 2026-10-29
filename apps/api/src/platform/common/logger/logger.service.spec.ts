const calls: { level: string; fields: Record<string, unknown>; msg?: string }[] = [];
jest.mock('./pino', () => {
  const at = (level: string) => (fields: Record<string, unknown>, msg?: string) => calls.push({ level, fields, msg });
  return { rootLogger: () => ({ info: at('info'), error: at('error'), warn: at('warn'), debug: at('debug'), trace: at('trace') }) };
});

import { PinoLoggerService } from './logger.service';

describe('PinoLoggerService', () => {
  it('logs an Error passed after the message under err, with its message and stack', () => {
    new PinoLoggerService().error('Failed to upload book for user u1', new Error('S3 PutObject failed: NoSuchBucket'), 'DocumentsService');
    const [call] = calls;
    expect(call.msg).toBe('Failed to upload book for user u1');
    expect(call.fields.context).toBe('DocumentsService');
    expect((call.fields.err as Error).message).toBe('S3 PutObject failed: NoSuchBucket');
    expect(call.fields.params).toBeUndefined();
  });
});
