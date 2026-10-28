import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import { ApiParam, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { ApiEndpoint } from '@platform/common/api-endpoint.decorator';
import { UserModel } from '@platform/common/models';
import {
  AuthBundle,
  PasskeyLoginDto,
  PasskeyLoginOptionsDto,
  PasskeyRegisterDto,
  PasskeySummary,
  RemovedResponse,
  SecondFactorStatusResponse,
  TotpCodeDto,
  TotpSetup,
  TotpState,
  WebAuthnOptions,
} from './auth.models';
import { SecondFactorService } from './second-factor.service';

const CREDENTIAL_LIMITS = {
  short: { limit: 5, ttl: 1000 },
  medium: { limit: 30, ttl: 60_000 },
  long: { limit: 200, ttl: 3_600_000 },
};

@ApiTags('auth')
@Controller('auth')
export class SecondFactorController {
  constructor(private readonly secondFactor: SecondFactorService) {}

  @Get('second-factor')
  @ApiEndpoint({ summary: 'Authenticator app and passkeys of the current user', response: SecondFactorStatusResponse })
  status(@Req() req: UserModel) {
    return this.secondFactor.status(req.user.userId);
  }

  @Post('totp/setup')
  @ApiEndpoint({ summary: 'Start authenticator app setup: a new secret and its QR code', response: TotpSetup })
  startTotp(@Req() req: UserModel) {
    return this.secondFactor.startTotp(req.user.userId);
  }

  @Post('totp/enable')
  @Throttle(CREDENTIAL_LIMITS)
  @ApiEndpoint({ summary: 'Turn the authenticator app on with a code it shows', response: TotpState })
  enableTotp(@Req() req: UserModel, @Body() dto: TotpCodeDto) {
    return this.secondFactor.enableTotp(req.user.userId, dto.code);
  }

  @Post('totp/disable')
  @Throttle(CREDENTIAL_LIMITS)
  @ApiEndpoint({ summary: 'Turn the authenticator app off (needs a current code)', response: TotpState })
  disableTotp(@Req() req: UserModel, @Body() dto: TotpCodeDto) {
    return this.secondFactor.disableTotp(req.user.userId, dto.code);
  }

  @Post('passkeys/register/options')
  @ApiEndpoint({ summary: 'Options for creating a passkey', response: WebAuthnOptions })
  registrationOptions(@Req() req: UserModel) {
    return this.secondFactor.registrationOptions(req.user.userId);
  }

  @Post('passkeys/register')
  @ApiEndpoint({ summary: 'Save a passkey created in the browser', response: PasskeySummary })
  register(@Req() req: UserModel, @Body() dto: PasskeyRegisterDto) {
    return this.secondFactor.registerPasskey(
      req.user.userId,
      dto.response as unknown as RegistrationResponseJSON,
      dto.name,
    );
  }

  @Delete('passkeys/:id')
  @ApiParam({ name: 'id' })
  @ApiEndpoint({ summary: 'Remove a passkey', response: RemovedResponse })
  remove(@Req() req: UserModel, @Param('id') id: string) {
    return this.secondFactor.removePasskey(req.user.userId, id);
  }

  @Post('passkeys/login/options')
  @Throttle(CREDENTIAL_LIMITS)
  @ApiEndpoint({ summary: 'Options for signing in with a passkey', response: WebAuthnOptions, auth: false })
  loginOptions(@Body() dto: PasskeyLoginOptionsDto) {
    return this.secondFactor.authenticationOptions(dto.email);
  }

  @Post('passkeys/login')
  @Throttle(CREDENTIAL_LIMITS)
  @ApiEndpoint({ summary: 'Sign in with a passkey (opens a session)', response: AuthBundle, auth: false })
  login(@Body() dto: PasskeyLoginDto) {
    return this.secondFactor.signInWithPasskey(dto.response as unknown as AuthenticationResponseJSON);
  }
}
