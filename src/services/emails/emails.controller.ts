import nodemailer from 'nodemailer';

import BaseController from '../base/base.controller';
import Email from './email.model';

class EmailsController extends BaseController {
  transporter: nodemailer.Transporter;
  constructor() {
    super(Email);
    this.transporter = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: Number(this.config.smtpPort),
      secure: false, // true for 465, false for other ports
      auth: {
        user: this.config.smtpUser,
        pass: this.config.smtpPass,
      },
    });
  }

  async send(to: string, subject: string, text: string, html?: string) {
    try {
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || '',
        to,
        subject,
        text,
        html,
      });

      this.logger.info(`Email sent: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`Error sending email: ${error}`);
      throw error;
    }
  }

  async createVerificationLink(email: string) {
    const token = this.jwt.createAccessToken({ email });
    const verificationLink = `http://localhost:${this.config.port}/api/v1/auth/verify/${token}`;
    return verificationLink;
  }

  listeners() {
    this.broker.on(
      'user:registered',
      async (data: {
        to: string;
        subject: string;
        text: string;
        // html?: string;
      }) => {
        this.logger.info('user:registered event received:', data);
        const { to, subject, text } = data;

        try {
          const verifyLink = await this.createVerificationLink(data.to);

          const html = `
            <p>please click the link below to verify your email address:</p>
            <a href=${verifyLink}>Verify Email</a>
          `;

          await this.send(to, subject, text, html);
        } catch (error) {
          // EventEmitter does not await listeners, so an uncaught rejection
          // here would otherwise crash the whole process (registration
          // itself already succeeded and must not be affected by this).
          this.logger.error(`user:registered email delivery failed: ${error}`);
        }
      }
    );
  }
}

const emailsController = new EmailsController();

export default emailsController;
