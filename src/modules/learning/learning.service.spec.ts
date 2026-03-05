import { Test, TestingModule } from '@nestjs/testing';
import { LearningService } from './learning.service';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { ValidatorService } from './services/validator.service';
import { CardGeneratorService } from './services/card-generator.service';
import { SchedulerService } from './services/scheduler.service';
import { StatsService } from './services/stats.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NoteSourceType, ReviewRating } from './learning.models';

describe('LearningService', () => {
  let service: LearningService;
  let prisma: jest.Mocked<PrismaService>;

  const mockPrisma = {
    learningNote: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    learningCard: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    learningSession: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    cardReview: {
      count: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    userLearningSettings: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    book: {
      findFirst: jest.fn(),
    },
    highlight: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LearningService,
        { provide: PrismaService, useValue: mockPrisma },
        ValidatorService,
        CardGeneratorService,
        SchedulerService,
        StatsService,
      ],
    }).compile();

    service = module.get<LearningService>(LearningService);
    prisma = module.get(PrismaService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('getNotes', () => {
    it('should return all notes for a user', async () => {
      const mockNotes = [
        {
          id: 'note-1',
          userId: 'user-1',
          targetSentence: 'Test sentence',
          meaning: 'Test meaning',
          targetWord: 'test',
          sourceType: NoteSourceType.MANUAL,
          isArchived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          cards: [],
        },
      ];

      mockPrisma.learningNote.findMany.mockResolvedValue(mockNotes);

      const result = await service.getNotes('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('note-1');
      expect(mockPrisma.learningNote.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', deletedAt: null },
        include: { cards: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getNote', () => {
    it('should return a specific note', async () => {
      const mockNote = {
        id: 'note-1',
        userId: 'user-1',
        targetSentence: 'Test sentence',
        meaning: 'Test meaning',
        targetWord: 'test',
        sourceType: NoteSourceType.MANUAL,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        cards: [],
      };

      mockPrisma.learningNote.findFirst.mockResolvedValue(mockNote);

      const result = await service.getNote('user-1', 'note-1');

      expect(result.id).toBe('note-1');
    });

    it('should throw NotFoundException if note not found', async () => {
      mockPrisma.learningNote.findFirst.mockResolvedValue(null);

      await expect(service.getNote('user-1', 'note-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('createNote', () => {
    const createDto = {
      targetSentence: 'The cat sat on the mat.',
      meaning: 'A soft floor covering',
      targetWord: 'mat',
    };

    it('should create a note with cards', async () => {
      const mockNote = {
        id: 'note-1',
        userId: 'user-1',
        ...createDto,
        sourceType: NoteSourceType.MANUAL,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockSettings = {
        generateRecognition: false,
        generateProduction: true,
        generateCloze: false,
      };

      mockPrisma.userLearningSettings.findUnique.mockResolvedValue(mockSettings);
      mockPrisma.learningNote.create.mockResolvedValue(mockNote);
      mockPrisma.learningCard.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.learningNote.findFirst.mockResolvedValue({
        ...mockNote,
        cards: [{ id: 'card-1', cardType: 'production', isActive: true }],
      });

      const result = await service.createNote('user-1', createDto);

      expect(result.id).toBe('note-1');
      expect(mockPrisma.learningNote.create).toHaveBeenCalled();
      expect(mockPrisma.learningCard.createMany).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid content', async () => {
      const invalidDto = {
        targetSentence: '',
        meaning: 'Test',
        targetWord: 'test',
      };

      await expect(service.createNote('user-1', invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateNote', () => {
    it('should return validation result', () => {
      const result = service.validateNote({
        targetSentence: 'This is a valid sentence example.',
        meaning: 'An example meaning in another language',
        targetWord: 'valid',
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid content', () => {
      const result = service.validateNote({
        targetSentence: '',
        meaning: '',
        targetWord: '',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('startSession', () => {
    it('should create a new session', async () => {
      const mockSession = {
        id: 'session-1',
        userId: 'user-1',
        startedAt: new Date(),
      };

      mockPrisma.learningSession.create.mockResolvedValue(mockSession);

      const result = await service.startSession('user-1');

      expect(result.sessionId).toBe('session-1');
      expect(result.startedAt).toEqual(mockSession.startedAt);
    });
  });

  describe('submitReview', () => {
    it('should update card based on review', async () => {
      const mockCard = {
        id: 'card-1',
        userId: 'user-1',
        noteId: 'note-1',
        difficulty: 0.3,
        stability: 1.0,
        state: 'review',
        lapseCount: 0,
        reviewCount: 5,
        isActive: true,
        avgResponseTime: 5000,
        hesitationCount: 0,
        consecutiveCorrect: 3,
      };

      mockPrisma.learningCard.findFirst.mockResolvedValue(mockCard);
      mockPrisma.cardReview.create.mockResolvedValue({});
      mockPrisma.learningCard.update.mockResolvedValue({});

      const result = await service.submitReview('user-1', {
        cardId: 'card-1',
        rating: ReviewRating.GOOD,
        responseTimeMs: 4000,
        wasHesitant: false,
      });

      expect(result.cardId).toBe('card-1');
      expect(mockPrisma.cardReview.create).toHaveBeenCalled();
      expect(mockPrisma.learningCard.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException for missing card', async () => {
      mockPrisma.learningCard.findFirst.mockResolvedValue(null);

      await expect(
        service.submitReview('user-1', {
          cardId: 'card-1',
          rating: ReviewRating.GOOD,
          responseTimeMs: 4000,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
