import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { SecondFactorController } from './second-factor.controller';
import { SecondFactorService } from './second-factor.service';
import { PasswordService } from './password.service';
import { MailService } from '@platform/mail/mail.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, SecondFactorController],
  providers: [AuthService, JwtStrategy, SecondFactorService, PasswordService, MailService],
})
export class AuthModule {}
