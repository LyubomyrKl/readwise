import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SummarizationStrategy, SummaryType } from '@prisma/client';
import { SummarizerService } from './summarizer.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { RabbitMQService } from '@/infrastructure/rabbitmq/rabbitmq.service';
import { S3Service } from '@/infrastructure/s3/s3.service';
import { makeBook } from '../../../test/fixtures/book.fixture';

describe('SummarizerService', () => {
  const prisma = { book: { findFirst: jest.fn() } };
  const rabbit = { publishSummaryRequest: jest.fn() };
  const s3 = { getJsonObject: jest.fn() };
  let service: SummarizerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SummarizerService,
        { provide: PrismaService, useValue: prisma },
        { provide: RabbitMQService, useValue: rabbit },
        { provide: S3Service, useValue: s3 },
      ],
    }).compile();
    service = moduleRef.get(SummarizerService);
  });

  describe('requestSummary', () => {
    it('rejects books that do not belong to the user', async () => {
      prisma.book.findFirst.mockResolvedValue(null);

      await expect(
        service.requestSummary('user-1', 'book-1', SummaryType.abstractive),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(rabbit.publishSummaryRequest).not.toHaveBeenCalled();
    });

    it('queues a request with the chosen type and strategy', async () => {
      prisma.book.findFirst.mockResolvedValue({ summaryStorageKey: null });
      rabbit.publishSummaryRequest.mockResolvedValue({
        success: true,
        message: 'queued',
      });

      const result = await service.requestSummary(
        'user-1',
        'book-1',
        SummaryType.abstractive,
        SummarizationStrategy.two_pass,
      );

      expect(prisma.book.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'book-1', userId: 'user-1' } }),
      );
      expect(rabbit.publishSummaryRequest).toHaveBeenCalledWith(
        'user-1',
        'book-1',
        'abstractive',
        'two_pass',
      );
      expect(result).toEqual({
        success: true,
        message: 'queued',
        userId: 'user-1',
        bookId: 'book-1',
      });
    });

    it('does not queue again when a summary already exists', async () => {
      prisma.book.findFirst.mockResolvedValue({
        summaryStorageKey: 'summary/book-1_abstractive_summary.json',
      });

      const result = await service.requestSummary(
        'user-1',
        'book-1',
        SummaryType.abstractive,
      );

      expect(rabbit.publishSummaryRequest).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        success: true,
        summaryKey: 'summary/book-1_abstractive_summary.json',
      });
    });
  });

  describe('getSummaryStatus', () => {
    it.each([
      ['ready', 'summary/x.json', true],
      ['ready', null, false],
      ['processing', null, false],
      ['error', null, false],
    ])(
      'status %s with key %s reports isReady=%s',
      async (status, summaryStorageKey, isReady) => {
        prisma.book.findFirst.mockResolvedValue({
          id: 'book-1',
          status,
          summaryStorageKey,
          summaryType: null,
          summarizationStrategy: null,
          errorMessage: null,
        });

        const result = await service.getSummaryStatus('user-1', 'book-1');

        expect(result.status).toBe(status);
        expect(result.isReady).toBe(isReady);
      },
    );

    it('exposes the stored type and strategy once ready', async () => {
      prisma.book.findFirst.mockResolvedValue({
        id: 'book-1',
        status: 'ready',
        summaryStorageKey: 'summary/x.json',
        summaryType: 'abstractive',
        summarizationStrategy: 'two_pass',
        errorMessage: null,
      });

      await expect(
        service.getSummaryStatus('user-1', 'book-1'),
      ).resolves.toEqual({
        status: 'ready',
        bookId: 'book-1',
        isReady: true,
        summaryKey: 'summary/x.json',
        summaryType: 'abstractive',
        summarizationStrategy: 'two_pass',
        errorMessage: null,
      });
    });

    it('surfaces the error message of a failed run', async () => {
      prisma.book.findFirst.mockResolvedValue({
        id: 'book-1',
        status: 'error',
        summaryStorageKey: null,
        summaryType: null,
        summarizationStrategy: null,
        errorMessage: 'LLM host unreachable',
      });

      await expect(
        service.getSummaryStatus('user-1', 'book-1'),
      ).resolves.toMatchObject({
        status: 'error',
        isReady: false,
        errorMessage: 'LLM host unreachable',
      });
    });

    it('404s for a book the user does not own', async () => {
      prisma.book.findFirst.mockResolvedValue(null);

      await expect(
        service.getSummaryStatus('user-1', 'book-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getSummaryByBookId', () => {
    it('returns the stored JSON merged with the book', async () => {
      prisma.book.findFirst.mockResolvedValue(
        makeBook({
          summaryStorageKey: 'summary/book-1_abstractive_summary.json',
        }),
      );
      s3.getJsonObject.mockResolvedValue({
        sections: [
          { id: 's1', title: 'One', level: 'chapter', content: 'Summary.' },
        ],
      });

      const result = await service.getSummaryByBookId('user-1', 'book-1');

      expect(s3.getJsonObject).toHaveBeenCalledWith(
        'summary/book-1_abstractive_summary.json',
      );
      expect(result.id).toBe('book-1');
      expect(result.summaryKey).toBe('summary/book-1_abstractive_summary.json');
      expect(result.summary).toEqual({
        sections: [expect.objectContaining({ id: 's1', title: 'One' })],
      });
    });

    it('404s when the book has no summary yet', async () => {
      prisma.book.findFirst.mockResolvedValue(makeBook());

      await expect(
        service.getSummaryByBookId('user-1', 'book-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(s3.getJsonObject).not.toHaveBeenCalled();
    });
  });
});
