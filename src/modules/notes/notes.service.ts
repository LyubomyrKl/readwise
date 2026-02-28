import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { CreateNoteDto, UpdateNoteDto, NoteResponse } from './note.models';
import { sanitizeHtml } from '@/common/sanitize';

@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  async getNotesForBook(userId: string, bookId: string): Promise<NoteResponse[]> {
    // Verify book belongs to user
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, userId },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    const notes = await this.prisma.note.findMany({
      where: {
        bookId,
        userId,
        deletedAt: null,
      },
      orderBy: [
        { isPinned: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return notes;
  }

  async createNote(
    userId: string,
    bookId: string,
    dto: CreateNoteDto,
  ): Promise<NoteResponse> {
    // Verify book belongs to user
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, userId },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    const note = await this.prisma.note.create({
      data: {
        userId,
        bookId,
        body: sanitizeHtml(dto.body),
        anchor: dto.anchor ? (dto.anchor as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        isPinned: dto.isPinned || false,
        isArchived: false,
      },
    });

    return note;
  }

  async getNote(userId: string, noteId: string): Promise<NoteResponse> {
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, deletedAt: null },
    });

    if (!note) {
      throw new NotFoundException('Note not found');
    }

    if (note.userId !== userId) {
      throw new ForbiddenException('Not authorized to access this note');
    }

    return note;
  }

  async updateNote(
    userId: string,
    noteId: string,
    dto: UpdateNoteDto,
  ): Promise<NoteResponse> {
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, deletedAt: null },
    });

    if (!note) {
      throw new NotFoundException('Note not found');
    }

    if (note.userId !== userId) {
      throw new ForbiddenException('Not authorized to update this note');
    }

    const updated = await this.prisma.note.update({
      where: { id: noteId },
      data: {
        body: dto.body !== undefined ? sanitizeHtml(dto.body) : undefined,
        isPinned: dto.isPinned !== undefined ? dto.isPinned : undefined,
        isArchived: dto.isArchived !== undefined ? dto.isArchived : undefined,
      },
    });

    return updated;
  }

  async deleteNote(userId: string, noteId: string): Promise<void> {
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, deletedAt: null },
    });

    if (!note) {
      throw new NotFoundException('Note not found');
    }

    if (note.userId !== userId) {
      throw new ForbiddenException('Not authorized to delete this note');
    }

    // Soft delete
    await this.prisma.note.update({
      where: { id: noteId },
      data: { deletedAt: new Date() },
    });

    // Also unlink any highlights that reference this note
    await this.prisma.highlight.updateMany({
      where: { noteId },
      data: { noteId: null },
    });
  }
}
