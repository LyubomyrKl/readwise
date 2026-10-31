import { NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { pagesRead } from './document.helpers';
import type { UpdateReadingPositionDto } from './document.models';
import { FakePrisma } from '../../../../test/fakes/fake-prisma';

describe('DocumentsService', () => {
  let prisma: FakePrisma;
  let service: DocumentsService;
  const storage = {
    deleteObject: jest.fn().mockResolvedValue(undefined),
    putObject: jest.fn().mockResolvedValue(undefined),
    generateStorageKey: jest.fn((userId: string, name: string) => `${userId}-1-${name}`),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = new FakePrisma();
    service = new DocumentsService(prisma as never, storage as never, {} as never);
    await prisma.book.create({
      data: {
        id: 'book-1', userId: 'user-1', title: 'A Book', author: 'A', mime: 'application/pdf', sizeBytes: BigInt(10),
        fileStorageKey: 'user-1-1-a.pdf', customCoverStorageKey: 'user-1-1-cover.jpg',
      },
    });
    await prisma.note.create({ data: { bookId: 'book-1', userId: 'user-1', body: 'n' } });
    await prisma.note.create({ data: { bookId: 'book-1', userId: 'user-1', body: 'gone', deletedAt: new Date() } });
    await prisma.highlight.create({ data: { bookId: 'book-1', userId: 'user-1', text: 'h', anchor: {} } });
  });

  it('lists books with note and highlight counts instead of the relations and reader-prefixed file URLs', async () => {
    const [book] = await service.getAllBooks('user-1');

    expect(book).toMatchObject({
      id: 'book-1', noteCount: 1, highlightCount: 1, status: 'ready', sizeBytes: '10',
      fileUrl: '/reader/documents/book-1/download', coverUrl: '/reader/documents/book-1/cover',
    });
    expect(book).not.toHaveProperty('notes');
    expect(book).not.toHaveProperty('highlights');
    expect(book).not.toHaveProperty('summaryKey');
    expect(book).not.toHaveProperty('hasExtraction');
    expect(await service.getAllBooks('user-2')).toEqual([]);
  });

  it('deleteBook removes file and cover from their own buckets, then the row', async () => {
    await service.deleteBook('user-1', 'book-1');

    expect(storage.deleteObject.mock.calls).toEqual(
      expect.arrayContaining([
        ['books', 'user-1-1-a.pdf'],
        ['covers', 'user-1-1-cover.jpg'],
      ]),
    );
    expect(storage.deleteObject).toHaveBeenCalledTimes(2);
    expect(await prisma.book.count()).toBe(0);
  });

  it('deleteBook survives a storage failure and still deletes the row', async () => {
    storage.deleteObject.mockRejectedValueOnce(new Error('minio down'));
    await expect(service.deleteBook('user-1', 'book-1')).resolves.toEqual({ status: 'success' });
    expect(await prisma.book.count()).toBe(0);
  });

  it('saving a position moves the pages read with it', async () => {
    await prisma.book.update({ where: { id: 'book-1' }, data: { pageCount: 240, pagePassCount: 7 } });
    const save = (position: object) =>
      service.updateReadingPosition('user-1', { bookId: 'book-1', position } as UpdateReadingPositionDto);
    const book = () => prisma.book.findFirst({ where: { id: 'book-1' } });

    await save({ v: 2, format: 'pdf', page: 41 });
    expect(await book()).toMatchObject({ pagePassCount: 42, readingPosition: { v: 2, format: 'pdf', page: 41 } });

    await save({ v: 2, format: 'epub', cfi: 'epubcfi(/6/4!/4/2)' }); // says neither: the count stays
    expect((await book())?.pagePassCount).toBe(42);
  });

  it('pagesRead: the page in a PDF, the share of a reflowable book, within the book', () => {
    expect(pagesRead({ page: 0 }, 240)).toBe(1);
    expect(pagesRead({ page: 500 }, 240)).toBe(240);
    expect(pagesRead({ totalProgression: 0.5 }, 240)).toBe(120);
    expect(pagesRead({ totalProgression: 0 }, 240)).toBe(0);
    expect(pagesRead({ totalProgression: 0.5 }, 0)).toBeUndefined();
    expect(pagesRead({}, 240)).toBeUndefined();
  });

  it('refuses books of other users', async () => {
    await expect(service.deleteBook('user-2', 'book-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getOwnedBook('user-2', 'book-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });
});
