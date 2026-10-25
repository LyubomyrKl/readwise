import { NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
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
        fileStorageKey: 'user-1-1-a.pdf', customCoverStorageKey: 'user-1-1-cover.jpg', extractionStorageKey: 'extraction/book-1_extraction.md',
      },
    });
    await prisma.note.create({ data: { bookId: 'book-1', userId: 'user-1', body: 'n' } });
    await prisma.note.create({ data: { bookId: 'book-1', userId: 'user-1', body: 'gone', deletedAt: new Date() } });
    await prisma.highlight.create({ data: { bookId: 'book-1', userId: 'user-1', text: 'h', anchor: {} } });
  });

  it('lists books with note and highlight counts instead of the relations, merging compat state', async () => {
    const [book] = await service.getAllBooks('user-1', () => ({ summaryKey: 'summary/book-1/s.json', status: 'ready' }));

    expect(book).toMatchObject({ id: 'book-1', noteCount: 1, highlightCount: 1, summaryKey: 'summary/book-1/s.json', status: 'ready', sizeBytes: '10' });
    expect(book).not.toHaveProperty('notes');
    expect(book).not.toHaveProperty('highlights');
    expect(await service.getAllBooks('user-2')).toEqual([]);
  });

  it('deleteBook removes file, cover and extraction from their own buckets, then the row', async () => {
    await service.deleteBook('user-1', 'book-1');

    expect(storage.deleteObject.mock.calls).toEqual(
      expect.arrayContaining([
        ['books', 'user-1-1-a.pdf'],
        ['covers', 'user-1-1-cover.jpg'],
        ['extractions', 'extraction/book-1_extraction.md'],
      ]),
    );
    expect(storage.deleteObject).toHaveBeenCalledTimes(3);
    expect(await prisma.book.count()).toBe(0);
  });

  it('deleteBook survives a storage failure and still deletes the row', async () => {
    storage.deleteObject.mockRejectedValueOnce(new Error('minio down'));
    await expect(service.deleteBook('user-1', 'book-1')).resolves.toEqual({ status: 'success' });
    expect(await prisma.book.count()).toBe(0);
  });

  it('refuses books of other users', async () => {
    await expect(service.deleteBook('user-2', 'book-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getOwnedBook('user-2', 'book-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.deleteObject).not.toHaveBeenCalled();
  });

  it('setExtraction records the key written by the extract job', async () => {
    await service.setExtraction('book-1', 'extraction/new.md');
    expect((await prisma.book.findUnique({ where: { id: 'book-1' } }))!.extractionStorageKey).toBe('extraction/new.md');
  });
});
