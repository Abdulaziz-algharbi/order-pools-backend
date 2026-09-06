import jwt from 'jsonwebtoken';

const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail }));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: () => mockCreateTransport(),
  },
}));

import appBroker from '../../src/app.broker';
import config from '../../src/config/config';
import emailsController from '../../src/services/emails/emails.controller';

// Flushes the microtask queue so an event-emitter listener's internal
// async work (not awaited by EventEmitter itself) has a chance to settle
// before assertions run — see EmailsController.listeners(), which has no
// named handler method to await directly (unlike e.g.
// SupplierPayoutController.handleDeliveryCompleted).
function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('EmailsController.send', () => {
  it('sends mail with the given fields', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'msg-1' });

    await emailsController.send('to@example.com', 'Subject', 'Body text');

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'to@example.com',
        subject: 'Subject',
        text: 'Body text',
      })
    );
  });

  it('logs and rethrows when the transport fails', async () => {
    mockSendMail.mockRejectedValue(new Error('smtp down'));

    await expect(
      emailsController.send('to@example.com', 'Subject', 'Body text')
    ).rejects.toThrow('smtp down');
  });
});

describe('EmailsController.createVerificationLink', () => {
  it('returns a verify link carrying a token that decodes back to the given email', async () => {
    const link =
      await emailsController.createVerificationLink('user@example.com');

    expect(link).toMatch(
      new RegExp(`^http://localhost:${config.port}/api/v1/auth/verify/`)
    );

    const token = link.split('/').pop() as string;
    const decoded = jwt.verify(token, config.jwtTokenSecret) as unknown as {
      email: string;
    };
    expect(decoded.email).toBe('user@example.com');
  });
});

describe('EmailsController user:registered listener (wired through the real AppBroker)', () => {
  it('sends a welcome email containing a verification link', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'msg-1' });
    const sendSpy = jest.spyOn(emailsController, 'send');

    appBroker.emit('user:registered', {
      to: 'new-user@example.com',
      subject: 'Welcome',
      text: 'Hello!',
    });

    await flush();
    await flush();

    expect(sendSpy).toHaveBeenCalledWith(
      'new-user@example.com',
      'Welcome',
      'Hello!',
      expect.stringContaining('/api/v1/auth/verify/')
    );
  });

  it('does not throw when sending the welcome email fails', async () => {
    mockSendMail.mockRejectedValue(new Error('smtp down'));

    expect(() =>
      appBroker.emit('user:registered', {
        to: 'new-user@example.com',
        subject: 'Welcome',
        text: 'Hello!',
      })
    ).not.toThrow();

    await flush();
    await flush();
  });
});
