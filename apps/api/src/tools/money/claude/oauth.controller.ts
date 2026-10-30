import { Body, Controller, Get, Header, HttpCode, Post, Req } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import { OAuthService } from './oauth.service';

export class AuthorizeDto {
  @ApiProperty() @IsString() @MaxLength(200) clientId!: string;
  @ApiProperty({ example: 'https://claude.ai/api/mcp/auth_callback' }) @IsString() @MaxLength(500) redirectUri!: string;
  @ApiProperty() @IsString() @MaxLength(200) codeChallenge!: string;
  @ApiProperty({ enum: ['S256'] }) @IsIn(['S256']) codeChallengeMethod!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(1000) state?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(200) scope?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MaxLength(500) resource?: string;
}

export class OAuthInfoResponse {
  @ApiProperty({ nullable: true, example: 'https://host.ts.net:8443/api/money/claude/mcp' }) mcpUrl!: string | null;
}

export class AuthorizeResponse {
  @ApiProperty({ description: "Claude's callback with the code and state" }) redirect!: string;
}

/** OAuth documents and replies as RFC 8414, 9728, 7591 and 6749 write them (snake_case). */
export class OAuthJson {}

/**
 * OAuth for Claude's custom connector. Public (Claude's cloud calls them):
 * the two metadata documents (Caddy maps /.well-known/oauth-* here), client
 * registration and the token endpoint. Behind the owner's session: the info for
 * the settings page and the approval the connect page posts.
 */
@ApiTags('money: claude')
@Controller('money/oauth')
export class OAuthController {
  constructor(private readonly oauth: OAuthService) {}

  @Get('info')
  @ApiEndpoint({ summary: "The public MCP URL for Claude's custom connector (null when not set up)", response: OAuthInfoResponse })
  info() {
    return this.oauth.info();
  }

  @Post('authorize')
  @HttpCode(200)
  @ApiEndpoint({ summary: 'The owner allows Claude read-only access: a one-time code in the redirect back to Claude', response: AuthorizeResponse })
  authorize(@Req() req: UserModel, @Body() dto: AuthorizeDto) {
    return this.oauth.authorize(req.user.userId, dto);
  }

  @Get('.well-known/oauth-authorization-server')
  @Header('Cache-Control', 'no-store')
  @ApiEndpoint({ summary: 'OAuth authorization server metadata (RFC 8414)', response: OAuthJson, auth: false })
  authorizationServer() {
    return this.oauth.authorizationServer();
  }

  @Get(['.well-known/oauth-protected-resource', '.well-known/oauth-protected-resource/*rest'])
  @Header('Cache-Control', 'no-store')
  @ApiEndpoint({ summary: 'OAuth protected resource metadata of the MCP server (RFC 9728)', response: OAuthJson, auth: false })
  protectedResource() {
    return this.oauth.protectedResource();
  }

  @Post('register')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiEndpoint({ summary: "Dynamic client registration (RFC 7591), for Claude's callback only", response: OAuthJson, auth: false })
  register(@Body() body: Record<string, unknown>) {
    return this.oauth.register(body ?? {});
  }

  @Post('token')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiEndpoint({ summary: 'Token endpoint: an authorization code and its PKCE verifier for a read token', response: OAuthJson, auth: false })
  token(@Body() body: Record<string, unknown>) {
    return this.oauth.token(body ?? {});
  }
}
