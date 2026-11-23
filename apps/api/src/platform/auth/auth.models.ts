import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SafeUser {
  @ApiProperty({ example: 'uuid' }) id!: string;
  @ApiProperty({ example: 'anna@example.com' }) email!: string;
  @ApiProperty({ required: false, nullable: true, example: 'Anna' })
  name?: string | null;
}

export class Tokens {
  @ApiProperty({ example: 'jwt...' }) accessToken!: string;
  @ApiProperty({ example: 'jwt...' }) refreshToken!: string;
}

export type RefreshBundle = Tokens;

export class AuthBundle {
  @ApiProperty({ type: SafeUser }) user!: SafeUser;
  @ApiProperty({ type: Tokens }) tokens!: Tokens;
}

export class MePayload {
  @ApiProperty({ example: 'uuid' }) userId!: string;
  @ApiProperty({ example: 'anna@example.com' }) email!: string;
}

export class LogoutResult {
  @ApiProperty({ example: true }) success!: true;
}


export class RegisterDto {
  @ApiProperty({ example: 'anna@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'S3curePass1' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ required: false, example: 'Anna' })
  @IsOptional()
  @IsString()
  name?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'anna@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'S3curePass1' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ required: false, example: '123456', description: 'authenticator app code, when the second factor is on' })
  @IsOptional()
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/)
  code?: string;
}

const TOTP_CODE = /^\s*\d{3}\s?\d{3}\s*$/;

/** A new password for the signed-in user: the current one first, and the app's code when it is on. */
export class ChangePasswordDto {
  @ApiProperty({ example: 'S3curePass1' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  currentPassword!: string;

  @ApiProperty({ minLength: 8, example: 'An0ther-pass' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword!: string;

  @ApiProperty({ required: false, example: '123456', description: 'authenticator app code, when the second factor is on' })
  @IsOptional()
  @Matches(TOTP_CODE)
  code?: string;
}

export class PasswordChanged {
  @ApiProperty({ example: true }) success!: true;
  @ApiProperty({ example: 1, description: 'sessions on other devices that were ended' }) signedOut!: number;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'anna@example.com' })
  @IsEmail()
  email!: string;
}

export class ForgotPasswordResult {
  @ApiProperty({
    enum: ['email', 'server'],
    description: 'email: a link is on its way if the account exists; server: this server sends no email, its owner prints a link',
  })
  delivery!: 'email' | 'server';
}

/** A new password through a one-time link. */
export class ResetPasswordDto {
  @ApiProperty({ description: 'the token from the link' })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  @ApiProperty({ minLength: 8, example: 'An0ther-pass' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  newPassword!: string;
}

export class TotpCodeDto {
  @ApiProperty({ example: '123456' })
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/)
  code!: string;
}

/** Who is changing how they sign in: the password again, and the app's code when it is on. */
export class ConfirmIdentityDto {
  @ApiProperty({ example: 'S3curePass1' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;

  @ApiProperty({ required: false, example: '123456', description: 'authenticator app code, when the second factor is on' })
  @IsOptional()
  @Matches(/^\s*\d{3}\s?\d{3}\s*$/)
  code?: string;
}

export class TotpSetup {
  @ApiProperty({ description: 'base32 secret, for typing into the app' }) secret!: string;
  @ApiProperty({ example: 'otpauth://totp/Workbench:anna%40example.com?secret=...' }) otpauthUrl!: string;
  @ApiProperty({ description: 'QR code of otpauthUrl as a PNG data URL' }) qrDataUrl!: string;
}

export class PasskeySummary {
  @ApiProperty() id!: string;
  @ApiProperty({ required: false, nullable: true }) name!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ required: false, nullable: true }) lastUsedAt!: Date | null;
}

export class SecondFactorStatusResponse {
  @ApiProperty() totpEnabled!: boolean;
  @ApiProperty({ type: [PasskeySummary] }) passkeys!: PasskeySummary[];
}

export class TotpState {
  @ApiProperty() totpEnabled!: boolean;
}

export class PasskeyRegisterDto {
  @ApiProperty({ description: 'RegistrationResponseJSON from navigator.credentials.create' })
  @IsObject()
  response!: Record<string, unknown>;

  @ApiProperty({ required: false, example: 'MacBook Touch ID' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}

export class PasskeyLoginOptionsDto {
  @ApiProperty({ required: false, example: 'anna@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class PasskeyLoginDto {
  @ApiProperty({ description: 'AuthenticationResponseJSON from navigator.credentials.get' })
  @IsObject()
  response!: Record<string, unknown>;
}

export class WebAuthnOptions {
  @ApiProperty({ description: 'PublicKeyCredentialCreationOptionsJSON or ...RequestOptionsJSON' })
  challenge!: string;
}

export class RemovedResponse {
  @ApiProperty({ example: true }) removed!: true;
}

export class RefreshDto {
  @ApiProperty({ example: 'Bearer eyJhbGciOi...' })
  @IsString()
  refreshToken!: string;
}
