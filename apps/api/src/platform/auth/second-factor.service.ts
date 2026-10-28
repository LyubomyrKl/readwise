import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
} from '@simplewebauthn/server';
import * as QRCode from 'qrcode';
import { PrismaService } from '@platform/db/prisma.service';
import { EnvironmentVariables } from '@platform/config/env.validation';
import { AuthBundle, AuthService } from './auth.service';
import { generateTotpSecret, otpauthUri, verifyTotp } from './totp';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const ISSUER = 'Workbench';

export interface SecondFactorStatus {
  totpEnabled: boolean;
  passkeys: { id: string; name: string | null; createdAt: Date; lastUsedAt: Date | null }[];
}

/**
 * The second factor (an authenticator app, RFC 6238) and passkeys (WebAuthn).
 * A passkey signs in on its own: it is something you have, unlocked by
 * something you are or know (user verification is required).
 */
@Injectable()
export class SecondFactorService {
  private readonly rpID: string;
  private readonly origin: string;
  private readonly rpName: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    config: ConfigService<EnvironmentVariables>,
  ) {
    this.rpID = config.get('WEBAUTHN_RP_ID', { infer: true }) || 'localhost';
    this.origin = config.get('WEBAUTHN_ORIGIN', { infer: true }) || 'http://localhost:3000';
    this.rpName = config.get('WEBAUTHN_RP_NAME', { infer: true }) || ISSUER;
  }

  async status(userId: string): Promise<SecondFactorStatus> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        totpEnabledAt: true,
        passkeys: { select: { id: true, name: true, createdAt: true, lastUsedAt: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    return { totpEnabled: !!user.totpEnabledAt, passkeys: user.passkeys };
  }

  // ---- authenticator app ----------------------------------------------------------

  /** Starts (or restarts) setup: a new secret, not yet required at login. */
  async startTotp(userId: string): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabledAt) throw new BadRequestException('The authenticator app is already on; turn it off first');
    const secret = generateTotpSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecret: secret, totpLastStep: null } });
    const otpauthUrl = otpauthUri(secret, user.email, ISSUER);
    return { secret, otpauthUrl, qrDataUrl: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 240 }) };
  }

  /** Turns the second factor on once the app shows a matching code. */
  async enableTotp(userId: string, code: string): Promise<{ totpEnabled: true }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpSecret) throw new BadRequestException('Start the setup first');
    const step = verifyTotp(user.totpSecret, code, Date.now(), user.totpLastStep);
    if (step === null) throw new BadRequestException('That code does not match; check the time on your phone');
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabledAt: new Date(), totpLastStep: step },
    });
    return { totpEnabled: true };
  }

  async disableTotp(userId: string, code: string): Promise<{ totpEnabled: false }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpEnabledAt || !user.totpSecret) return { totpEnabled: false };
    if (verifyTotp(user.totpSecret, code, Date.now(), user.totpLastStep) === null) {
      throw new BadRequestException('That code does not match');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabledAt: null, totpSecret: null, totpLastStep: null },
    });
    return { totpEnabled: false };
  }

  // ---- passkeys -------------------------------------------------------------------

  async registrationOptions(userId: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { passkeys: true } });
    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userName: user.email,
      userDisplayName: user.name ?? user.email,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials: user.passkeys.map((p) => ({
        id: p.id,
        transports: p.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    await this.saveChallenge(options.challenge, 'passkey-register', userId);
    return options;
  }

  async registerPasskey(userId: string, response: RegistrationResponseJSON, name?: string) {
    const challenge = await this.takeChallenge(clientChallenge(response.response.clientDataJSON), 'passkey-register');
    if (challenge.userId !== userId) throw new BadRequestException('Challenge does not belong to this session');
    let verification: VerifiedRegistrationResponse;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        requireUserVerification: true,
      });
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Passkey could not be verified');
    }
    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Passkey could not be verified');
    }
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const saved = await this.prisma.passkeyCredential.create({
      data: {
        id: credential.id,
        userId,
        publicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: credential.transports ?? response.response.transports ?? [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        name: name?.trim() || null,
      },
      select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    });
    return saved;
  }

  async removePasskey(userId: string, id: string): Promise<{ removed: true }> {
    const { count } = await this.prisma.passkeyCredential.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Passkey not found');
    return { removed: true };
  }

  /** Sign-in options; without an email any passkey of this site may answer (discoverable). */
  async authenticationOptions(email?: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const user = email
      ? await this.prisma.user.findUnique({ where: { email }, include: { passkeys: true } })
      : null;
    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: 'required',
      allowCredentials: user?.passkeys.map((p) => ({
        id: p.id,
        transports: p.transports as AuthenticatorTransportFuture[],
      })),
    });
    await this.saveChallenge(options.challenge, 'passkey-login', user?.id ?? null);
    return options;
  }

  async signInWithPasskey(response: AuthenticationResponseJSON): Promise<AuthBundle> {
    const challenge = await this.takeChallenge(clientChallenge(response.response.clientDataJSON), 'passkey-login');
    const passkey = await this.prisma.passkeyCredential.findUnique({ where: { id: response.id }, include: { user: true } });
    if (!passkey || (challenge.userId && challenge.userId !== passkey.userId)) {
      throw new UnauthorizedException('Unknown passkey');
    }
    let verification: VerifiedAuthenticationResponse;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        requireUserVerification: true,
        credential: {
          id: passkey.id,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: Number(passkey.counter),
          transports: passkey.transports as AuthenticatorTransportFuture[],
        },
      });
    } catch {
      throw new UnauthorizedException('Passkey could not be verified');
    }
    if (!verification.verified) throw new UnauthorizedException('Passkey could not be verified');
    await this.prisma.passkeyCredential.update({
      where: { id: passkey.id },
      data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: new Date() },
    });
    return this.auth.issueBundle(passkey.user);
  }

  private async saveChallenge(challenge: string, purpose: string, userId: string | null): Promise<void> {
    await this.prisma.authChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await this.prisma.authChallenge.create({
      data: { challenge, purpose, userId, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
    });
  }

  /** Single use: the challenge row is deleted whether or not the response verifies. */
  private async takeChallenge(challenge: string, purpose: string) {
    const row = await this.prisma.authChallenge.findUnique({ where: { challenge } });
    if (row) await this.prisma.authChallenge.delete({ where: { id: row.id } });
    if (!row || row.purpose !== purpose || row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('The sign-in request expired; try again');
    }
    return row;
  }
}

/** The challenge the browser signed, read from clientDataJSON (base64url JSON). */
export function clientChallenge(clientDataJSON: string): string {
  try {
    const data = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf-8')) as { challenge?: unknown };
    if (typeof data.challenge === 'string') return data.challenge;
  } catch {
    // fall through
  }
  throw new BadRequestException('Malformed passkey response');
}
