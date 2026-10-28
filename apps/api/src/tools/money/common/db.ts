import type { Prisma } from '@prisma/client';

/** A Prisma client or the client of an open interactive transaction. */
export type Db = Prisma.TransactionClient;

/** Interactive transaction options for money writes: imports may post thousands of rows. */
export const WRITE_TX = { maxWait: 10_000, timeout: 60_000 } as const;
export const BULK_TX = { maxWait: 10_000, timeout: 600_000 } as const;
