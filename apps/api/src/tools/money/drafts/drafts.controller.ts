import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import { MovementDto } from '../movements/movement.models';
import { TransactionPage, TransactionResponse } from '../transactions/transaction.models';
import { DraftsService } from './drafts.service';

export class ApproveDraftDto {
  @ApiProperty({ required: false, description: 'the corrected input; default: as proposed' })
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}

export class RemovedResponse {
  @ApiProperty({ example: true }) removed!: true;
}

@ApiTags('money')
@Controller('money/drafts')
export class DraftsController {
  constructor(private readonly drafts: DraftsService) {}

  @Get()
  @ApiEndpoint({ summary: 'Movements waiting for approval', response: TransactionPage })
  list(@Req() req: UserModel) {
    return this.drafts.list(req.user.userId);
  }

  @Post()
  @ApiEndpoint({ summary: 'Propose a movement without posting it', response: TransactionResponse })
  create(@Req() req: UserModel, @Body() dto: MovementDto) {
    return this.drafts.create(req.user.userId, dto, { actor: 'user' });
  }

  @Post(':id/approve')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Post a draft, optionally with corrected input', response: TransactionResponse })
  approve(@Req() req: UserModel, @Param('id') id: string, @Body() dto: ApproveDraftDto) {
    return this.drafts.approve(req.user.userId, id, dto.input);
  }

  @Delete(':id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Drop a draft', response: RemovedResponse })
  reject(@Req() req: UserModel, @Param('id') id: string) {
    return this.drafts.reject(req.user.userId, id);
  }
}
