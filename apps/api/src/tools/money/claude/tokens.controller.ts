import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import { CreatedTokenResponse, CreateTokenDto, TokenResponse } from './claude.models';
import { TokensService } from './tokens.service';

@ApiTags('money')
@Controller('money/tokens')
export class TokensController {
  constructor(private readonly tokens: TokensService) {}

  @Get()
  @ApiEndpoint({ summary: "Claude's access tokens", response: [TokenResponse] })
  list(@Req() req: UserModel) {
    return this.tokens.list(req.user.userId);
  }

  @Post()
  @ApiEndpoint({ summary: 'Create a token for Claude (shown once)', response: CreatedTokenResponse })
  create(@Req() req: UserModel, @Body() dto: CreateTokenDto) {
    return this.tokens.create(req.user.userId, dto);
  }

  @Delete(':id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Revoke a token; it stops working at once', response: TokenResponse })
  revoke(@Req() req: UserModel, @Param('id') id: string) {
    return this.tokens.revoke(req.user.userId, id);
  }
}
