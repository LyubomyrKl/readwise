import { z } from 'zod';

/**
 * Message contracts shared with the Python workers. The JSON Schema files in
 * packages/contracts/jobs/ are the reference; this zod mirror and the pydantic
 * mirror in apps/workers are both tested against the same fixtures.
 */

export const CONTRACT_VERSION = 1;

/** "<toolId>.<name>", e.g. "reader.extract"; the routing key is "jobs.<type>". */
export const JOB_TYPE_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

export const jobEnvelopeSchema = z
  .object({
    v: z.literal(CONTRACT_VERSION),
    jobId: z.string().min(1),
    type: z.string().regex(JOB_TYPE_PATTERN),
    toolId: z.string().min(1),
    userId: z.string().min(1),
    attempt: z.number().int().min(1),
    /** when the envelope was published; a cancel received before it does not apply (retries) */
    publishedAt: z.iso.datetime({ offset: true }),
    correlationId: z.string().min(1).nullable().optional(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;

export const JOB_EVENT_KINDS = [
  'started',
  'progress',
  'waiting',
  'succeeded',
  'failed',
  'cancelled',
] as const;

export type JobEventKind = (typeof JOB_EVENT_KINDS)[number];

export const jobEventSchema = z
  .object({
    v: z.literal(CONTRACT_VERSION),
    jobId: z.string().min(1),
    event: z.enum(JOB_EVENT_KINDS),
    at: z.iso.datetime({ offset: true }),
    workerId: z.string().min(1),
    attempt: z.number().int().min(1).optional(),
    stage: z.string().max(200).nullable().optional(),
    progress: z.number().int().min(0).max(100).nullable().optional(),
    /** why the job is waiting (event = waiting) */
    reason: z.string().max(2000).nullable().optional(),
    /** tool-specific outcome (event = succeeded) */
    result: z.record(z.string(), z.unknown()).nullable().optional(),
    /** event = failed | cancelled */
    error: z.string().max(4000).nullable().optional(),
    /** event = failed: whether a re-run may succeed (default true) */
    retryable: z.boolean().optional(),
  })
  .strict();

export type JobEvent = z.infer<typeof jobEventSchema>;

/** Sent by the API to workers on the control exchange. */
export const jobControlSchema = z
  .object({
    v: z.literal(CONTRACT_VERSION),
    jobId: z.string().min(1),
    action: z.literal('cancel'),
  })
  .strict();

export type JobControl = z.infer<typeof jobControlSchema>;
