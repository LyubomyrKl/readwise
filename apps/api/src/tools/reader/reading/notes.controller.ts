import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiParam } from '@nestjs/swagger';
import { NotesService } from './notes.service';
import {
  CreateNoteDto,
  UpdateNoteDto,
  NoteResponse,
} from './note.models';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { SuccessEmptyResponse, UserModel } from '@platform/common/models';

// Paths: the reader's own prefix plus the pre-Phase-4 aliases, dropped in Phase 5.
@ApiTags('notes')
@Controller()
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get(['books/:bookId/notes', 'reader/documents/:bookId/notes'])
  @ApiParam({ name: 'bookId' })
  @ApiEndpoint({ summary: 'Get all notes for a book', response: [NoteResponse] })
  getNotesForBook(
    @Req() req: UserModel,
    @Param('bookId') bookId: string,
  ): Promise<NoteResponse[]> {
    return this.notesService.getNotesForBook(req.user.userId, bookId);
  }

  @Post(['books/:bookId/notes', 'reader/documents/:bookId/notes'])
  @ApiParam({ name: 'bookId' })
  @ApiEndpoint({ summary: 'Create a new note', response: NoteResponse })
  createNote(
    @Req() req: UserModel,
    @Param('bookId') bookId: string,
    @Body() dto: CreateNoteDto,
  ): Promise<NoteResponse> {
    return this.notesService.createNote(req.user.userId, bookId, dto);
  }

  @Get(['notes/:id', 'reader/notes/:id'])
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Get a specific note', response: NoteResponse })
  getNote(
    @Req() req: UserModel,
    @Param('id') id: string,
  ): Promise<NoteResponse> {
    return this.notesService.getNote(req.user.userId, id);
  }

  @Patch(['notes/:id', 'reader/notes/:id'])
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Update a note', response: NoteResponse })
  updateNote(
    @Req() req: UserModel,
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ): Promise<NoteResponse> {
    return this.notesService.updateNote(req.user.userId, id, dto);
  }

  @Delete(['notes/:id', 'reader/notes/:id'])
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Delete a note', response: SuccessEmptyResponse })
  async deleteNote(
    @Req() req: UserModel,
    @Param('id') id: string,
  ): Promise<SuccessEmptyResponse> {
    await this.notesService.deleteNote(req.user.userId, id);
    return { status: 'success' };
  }
}
