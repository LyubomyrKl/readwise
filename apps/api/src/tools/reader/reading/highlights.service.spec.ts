import { ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { HighlightsService } from './highlights.service';
import { UpdateHighlightDto } from './highlight.models';
import type { PrismaService } from '@platform/db/prisma.service';

const stored = { id: 'h1', userId: 'u1', bookId: 'b1', deletedAt: null };
const anchor = {
  v: 2,
  format: 'epub',
  href: 'OEBPS/ch03.xhtml',
  cfi: 'epubcfi(/6/8!/4/2,/1:0,/1:20)',
  quote: { exact: 'the quick brown fox', prefix: 'jumps over ', suffix: ' again' },
};

function service() {
  const prisma = {
    highlight: {
      findFirst: jest.fn().mockResolvedValue(stored),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...stored, ...data })),
    },
    note: { findFirst: jest.fn() },
  };
  return { prisma, highlights: new HighlightsService(prisma as unknown as PrismaService) };
}

describe('HighlightsService.updateHighlight', () => {
  it('stores a refreshed anchor as plain JSON and leaves the rest alone', async () => {
    const { prisma, highlights } = service();
    await highlights.updateHighlight('u1', 'h1', plainToInstance(UpdateHighlightDto, { anchor }));
    const { data } = prisma.highlight.update.mock.calls[0][0];
    expect(data).toEqual({ color: undefined, noteId: undefined, anchor });
    expect(Object.getPrototypeOf(data.anchor)).toBe(Object.prototype);
  });

  it('keeps the anchor when only the colour changes', async () => {
    const { prisma, highlights } = service();
    await highlights.updateHighlight('u1', 'h1', plainToInstance(UpdateHighlightDto, { color: '#a5d8ff' }));
    expect(prisma.highlight.update.mock.calls[0][0].data.anchor).toBeUndefined();
  });

  it("refuses another user's highlight", async () => {
    const { prisma, highlights } = service();
    await expect(highlights.updateHighlight('u2', 'h1', plainToInstance(UpdateHighlightDto, { anchor }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.highlight.update).not.toHaveBeenCalled();
  });
});
