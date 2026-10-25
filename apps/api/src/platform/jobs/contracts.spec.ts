import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import Ajv from 'ajv';
import { jobControlSchema, jobEnvelopeSchema, jobEventSchema } from './contracts';

/**
 * The zod mirror and the JSON Schema reference must agree on every fixture in
 * packages/contracts/jobs/fixtures; the Python mirror runs the same files.
 */
const CONTRACTS = join(__dirname, '../../../../../packages/contracts/jobs');

const ajv = new Ajv({ allErrors: true, strict: true });
ajv.addFormat('date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/);

const schemas = {
  envelope: {
    zod: jobEnvelopeSchema,
    json: ajv.compile(JSON.parse(readFileSync(join(CONTRACTS, 'job-envelope.schema.json'), 'utf-8'))),
  },
  event: {
    zod: jobEventSchema,
    json: ajv.compile(JSON.parse(readFileSync(join(CONTRACTS, 'job-event.schema.json'), 'utf-8'))),
  },
  control: {
    zod: jobControlSchema,
    json: ajv.compile(JSON.parse(readFileSync(join(CONTRACTS, 'job-control.schema.json'), 'utf-8'))),
  },
} as const;

type Kind = keyof typeof schemas;

function fixtures(dir: 'valid' | 'invalid'): Array<[name: string, kind: Kind, body: unknown]> {
  return readdirSync(join(CONTRACTS, 'fixtures', dir))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const kind = f.split('.')[0] as Kind;
      if (!(kind in schemas)) throw new Error(`fixture ${f} has no schema prefix`);
      return [f, kind, JSON.parse(readFileSync(join(CONTRACTS, 'fixtures', dir, f), 'utf-8'))];
    });
}

describe('job contracts (packages/contracts/jobs)', () => {
  it('has fixtures for every schema', () => {
    const kinds = new Set(fixtures('valid').map(([, kind]) => kind));
    expect([...kinds].sort()).toEqual(['control', 'envelope', 'event']);
  });

  it.each(fixtures('valid'))('%s is accepted by zod and by the JSON Schema', (_name, kind, body) => {
    expect(schemas[kind].zod.safeParse(body).success).toBe(true);
    expect(schemas[kind].json(body)).toBe(true);
  });

  it.each(fixtures('invalid'))('%s is rejected by zod and by the JSON Schema', (_name, kind, body) => {
    expect(schemas[kind].zod.safeParse(body).success).toBe(false);
    expect(schemas[kind].json(body)).toBe(false);
  });

  it('covers every event kind with a valid fixture', () => {
    const kinds = fixtures('valid')
      .filter(([, kind]) => kind === 'event')
      .map(([, , body]) => (body as { event: string }).event)
      .sort();
    expect(kinds).toEqual(['cancelled', 'failed', 'progress', 'started', 'succeeded', 'waiting']);
  });
});
