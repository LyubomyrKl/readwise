import { Prisma } from '@prisma/client';

export const BOOK_WITH_RELATIONS = Prisma.validator<Prisma.BookFindManyArgs>()({
  include: {
    notes: true,
    highlights: true,
    searchItems: true,
    // Book.tags is a join table. If you want Tag entities, include them:
    tags: { include: { tag: true } },
  },
});

export type BookWithRelations = Prisma.BookGetPayload<
  typeof BOOK_WITH_RELATIONS
>;
