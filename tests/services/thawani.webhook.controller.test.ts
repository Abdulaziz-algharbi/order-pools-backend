import { Request, Response } from 'express';

const mockConfirmPaymentById = jest.fn();

jest.mock('../../src/services/payments/payments.controller', () => ({
  __esModule: true,
  default: {
    confirmPaymentById: (...args: unknown[]) => mockConfirmPaymentById(...args),
  },
}));

import thawaniWebhookController from '../../src/services/webhooks/thawani.webhook.controller';

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('thawaniWebhookController.handleThawaniWebhook', () => {
  it('responds 200 immediately and never trusts the payload beyond the reference id', async () => {
    mockConfirmPaymentById.mockResolvedValue(undefined);
    const req = {
      body: {
        data: { client_reference_id: 'payment-1', payment_status: 'paid' },
      },
    } as unknown as Request;
    const res = mockRes();

    await thawaniWebhookController.handleThawaniWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockConfirmPaymentById).toHaveBeenCalledWith('payment-1');
  });

  it('also accepts a top-level client_reference_id', async () => {
    mockConfirmPaymentById.mockResolvedValue(undefined);
    const req = {
      body: { client_reference_id: 'payment-2' },
    } as unknown as Request;
    const res = mockRes();

    await thawaniWebhookController.handleThawaniWebhook(req, res);

    expect(mockConfirmPaymentById).toHaveBeenCalledWith('payment-2');
  });

  it('does nothing but still responds 200 when no reference id is present', async () => {
    const req = { body: {} } as unknown as Request;
    const res = mockRes();

    await thawaniWebhookController.handleThawaniWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockConfirmPaymentById).not.toHaveBeenCalled();
  });

  it('swallows a reconciliation failure rather than throwing', async () => {
    mockConfirmPaymentById.mockRejectedValue(new Error('boom'));
    const req = {
      body: { client_reference_id: 'payment-1' },
    } as unknown as Request;
    const res = mockRes();

    await expect(
      thawaniWebhookController.handleThawaniWebhook(req, res)
    ).resolves.toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
