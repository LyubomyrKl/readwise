import { createTransport } from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn(() => ({ sendMail: jest.fn(async () => ({})) })) }));

describe('MailService', () => {
  const saved = { url: process.env.SMTP_URL, from: process.env.MAIL_FROM };
  afterEach(() => {
    process.env.SMTP_URL = saved.url;
    process.env.MAIL_FROM = saved.from;
    jest.clearAllMocks();
  });

  it('sends nothing without SMTP_URL', async () => {
    delete process.env.SMTP_URL;
    const mail = new MailService();
    expect(mail.enabled).toBe(false);
    await expect(mail.send({ to: 'a@example.com', subject: 's', text: 't' })).rejects.toThrow(/sends no email/);
    expect(createTransport).not.toHaveBeenCalled();
  });

  it('sends through SMTP_URL, from its account unless MAIL_FROM says otherwise', async () => {
    process.env.SMTP_URL = 'smtps://you%40gmail.com:app-password@smtp.gmail.com:465';
    delete process.env.MAIL_FROM;
    const mail = new MailService();
    expect(mail.enabled).toBe(true);
    await mail.send({ to: 'you@gmail.com', subject: 'Set a new password', text: 'link' });
    const transport = (createTransport as jest.Mock).mock.results[0].value as { sendMail: jest.Mock };
    expect(createTransport).toHaveBeenCalledWith('smtps://you%40gmail.com:app-password@smtp.gmail.com:465');
    expect(transport.sendMail).toHaveBeenCalledWith({ from: 'Workbench <you@gmail.com>', to: 'you@gmail.com', subject: 'Set a new password', text: 'link' });

    process.env.MAIL_FROM = 'Money <money@example.com>';
    await new MailService().send({ to: 'you@gmail.com', subject: 's', text: 't' });
    const second = (createTransport as jest.Mock).mock.results[1].value as { sendMail: jest.Mock };
    expect(second.sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'Money <money@example.com>' }));
  });
});
