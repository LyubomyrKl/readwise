import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { CreateHighlightDto, UpdateHighlightDto, HighlightResponse } from './highlight.models';
import { sanitizeHtml } from '@/common/sanitize';

const DEFAULT_HIGHLIGHT_COLOR = '#ffe066';

@Injectable()
export class HighlightsService {
  constructor(private readonly prisma: PrismaService) {}

  async getHighlightsForBook(userId: string, bookId: string): Promise<HighlightResponse[]> {
    // Verify book belongs to user
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, userId },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    const highlights = await this.prisma.highlight.findMany({
      where: {
        bookId,
        userId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });

    return highlights;
  }

  async createHighlight(
    userId: string,
    bookId: string,
    dto: CreateHighlightDto,
  ): Promise<HighlightResponse> {
    // Verify book belongs to user
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, userId },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    // Verify note belongs to user if provided
    if (dto.noteId) {
      const note = await this.prisma.note.findFirst({
        where: { id: dto.noteId, userId },
      });
      if (!note) {
        throw new NotFoundException('Note not found');
      }
    }

    const highlight = await this.prisma.highlight.create({
      data: {
        userId,
        bookId,
        text: sanitizeHtml(dto.text),
        anchor: dto.anchor as unknown as Prisma.InputJsonValue,
        color: dto.color || DEFAULT_HIGHLIGHT_COLOR,
        noteId: dto.noteId,
      },
    });

    return highlight;
  }

  async updateHighlight(
    userId: string,
    highlightId: string,
    dto: UpdateHighlightDto,
  ): Promise<HighlightResponse> {
    const highlight = await this.prisma.highlight.findFirst({
      where: { id: highlightId, deletedAt: null },
    });

    if (!highlight) {
      throw new NotFoundException('Highlight not found');
    }

    if (highlight.userId !== userId) {
      throw new ForbiddenException('Not authorized to update this highlight');
    }

    // Verify note belongs to user if provided
    if (dto.noteId) {
      const note = await this.prisma.note.findFirst({
        where: { id: dto.noteId, userId },
      });
      if (!note) {
        throw new NotFoundException('Note not found');
      }
    }

    const updated = await this.prisma.highlight.update({
      where: { id: highlightId },
      data: {
        color: dto.color !== undefined ? dto.color : undefined,
        noteId: dto.noteId !== undefined ? dto.noteId : undefined,
      },
    });

    return updated;
  }

  async deleteHighlight(userId: string, highlightId: string): Promise<void> {
    const highlight = await this.prisma.highlight.findFirst({
      where: { id: highlightId, deletedAt: null },
    });

    if (!highlight) {
      throw new NotFoundException('Highlight not found');
    }

    if (highlight.userId !== userId) {
      throw new ForbiddenException('Not authorized to delete this highlight');
    }

    // Soft delete
    await this.prisma.highlight.update({
      where: { id: highlightId },
      data: { deletedAt: new Date() },
    });
  }
}
