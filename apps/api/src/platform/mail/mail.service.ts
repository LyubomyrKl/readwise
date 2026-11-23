import { Injectable } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Email from the server, only when SMTP_URL is set (for Gmail an app password:
 * `smtps://you%40gmail.com:<app password>@smtp.gmail.com:465`); MAIL_FROM is the sender, by
 * default the SMTP account. Without it the server sends nothing, and the features that would
 * (forgot password) say how to do without.
 */
@Injectable()
export class MailService {
  private readonly transport: Transporter | null;
  private readonly from: string;

  constructor() {
    const url = process.env.SMTP_URL?.trim();
    this.transport = url ? createTransport(url) : null;
    this.from = process.env.MAIL_FROM?.trim() || (url ? `Workbench <${decodeURIComponent(new URL(url).username)}>` : '');
  }

  get enabled(): boolean {
    return this.transport !== null;
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transport) throw new Error('This server sends no email (SMTP_URL is not set)');
    await this.transport.sendMail({ from: this.from, ...message });
  }
}
