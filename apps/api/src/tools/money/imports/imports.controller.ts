import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import {
  BalancePreview,
  BalanceTargetsDto,
  CommitResult,
  CreateAccountsDto,
  ImportBatchResponse,
  ImportRowPage,
  ImportRowsQuery,
  MappingDto,
  RowDecisionDto,
  UploadImportDto,
} from './import.models';
import { ImportsService } from './imports.service';

/** Statements and exports are small; this bounds what multer buffers in memory. */
const IMPORT_MAX_FILE_BYTES = 20 * 1024 * 1024;

class ImportProfileResponse {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() needsAccount!: boolean;
  @ApiProperty() needsMapping!: boolean;
}

class RemovedResponse {
  @ApiProperty({ example: true }) removed!: true;
}

class RowStatusResponse {
  @ApiProperty() status!: string;
}

@ApiTags('money')
@Controller('money/imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get('profiles')
  @ApiEndpoint({ summary: 'Import formats: the money-manager export and each bank or broker', response: [ImportProfileResponse] })
  profiles() {
    return this.imports.listProfiles();
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: IMPORT_MAX_FILE_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'profile'],
      properties: { file: { type: 'string', format: 'binary' }, profile: { type: 'string' }, accountId: { type: 'string' } },
    },
  })
  @ApiEndpoint({ summary: 'Upload a CSV; it waits for review before anything is posted', response: ImportBatchResponse })
  upload(@Req() req: UserModel, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: UploadImportDto) {
    return this.imports.upload(req.user.userId, file, dto);
  }

  @Get()
  @ApiEndpoint({ summary: 'Imports, newest first', response: [ImportBatchResponse] })
  list(@Req() req: UserModel) {
    return this.imports.list(req.user.userId);
  }

  @Get(':id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'An import with its first lines, mapping and counts', response: ImportBatchResponse })
  get(@Req() req: UserModel, @Param('id') id: string) {
    return this.imports.get(req.user.userId, id);
  }

  @Get(':id/rows')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Rows of an import with what each becomes', response: ImportRowPage })
  rows(@Req() req: UserModel, @Param('id') id: string, @Query() query: ImportRowsQuery) {
    return this.imports.rows(req.user.userId, id, query);
  }

  @Put(':id/mapping')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Map the columns and accounts of a money-manager export', response: ImportBatchResponse })
  mapping(@Req() req: UserModel, @Param('id') id: string, @Body() dto: MappingDto) {
    return this.imports.applyMapping(req.user.userId, id, dto);
  }

  @Post(':id/accounts')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Create the accounts named in the file and map them', response: ImportBatchResponse })
  createAccounts(@Req() req: UserModel, @Param('id') id: string, @Body() dto: CreateAccountsDto) {
    return this.imports.createAccounts(req.user.userId, id, dto);
  }

  @Patch(':id/rows/:rowId')
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'rowId' })
  @ApiEndpoint({ summary: 'Include or skip one row', response: RowStatusResponse })
  decide(@Req() req: UserModel, @Param('id') id: string, @Param('rowId') rowId: string, @Body() dto: RowDecisionDto) {
    return this.imports.setRowStatus(req.user.userId, id, rowId, dto.status);
  }

  @Get(':id/balances')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Each account before and after the import, and the opening balance to post', response: [BalancePreview] })
  balances(@Req() req: UserModel, @Param('id') id: string) {
    return this.imports.balancePreview(req.user.userId, id);
  }

  @Put(':id/balances')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: "Today's balance of each account (from the bank), to derive opening balances", response: [BalancePreview] })
  targets(@Req() req: UserModel, @Param('id') id: string, @Body() dto: BalanceTargetsDto) {
    return this.imports.setTargets(req.user.userId, id, dto.targets);
  }

  @Post(':id/commit')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Post every included row and the opening balances, all or nothing', response: CommitResult })
  commit(@Req() req: UserModel, @Param('id') id: string) {
    return this.imports.commit(req.user.userId, id);
  }

  @Delete(':id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Drop an import that was not committed', response: RemovedResponse })
  remove(@Req() req: UserModel, @Param('id') id: string) {
    return this.imports.remove(req.user.userId, id);
  }
}
