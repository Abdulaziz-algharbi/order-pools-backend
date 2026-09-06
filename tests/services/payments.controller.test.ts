import { Request, Response } from 'express';

jest.mock('../../src/services/payments/payment.model', () => {
  const actual = jest.requireActual(
    '../../src/services/payments/payment.model'
  );
  return {
    __esModule: true,
    default: {
      modelName: 'Payment',
      find: jest.fn(),
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
    },
    couldBeUpdated: actual.couldBeUpdated,
  };
});

jest.mock(
  '../../src/services/pool.participants/pool.participant.model',
  () => ({
    __esModule: true,
    default: { updateOne: jest.fn(), findOneAndUpdate: jest.fn() },
  })
);

jest.mock('../../src/services/pools/pool.model', () => ({
  __esModule: true,
  default: { findById: jest.fn(), updateOne: jest.fn() },
}));

const mockGetSession = jest.fn();
const mockCreateRefund = jest.fn();

jest.mock('../../src/services/thawani/thawani.gateway', () => ({
  __esModule: true,
  default: {
    getSession: (...args: unknown[]) => mockGetSession(...args),
    createRefund: (...args: unknown[]) => mockCreateRefund(...args),
  },
  isSessionPaid: (session: { payment_status?: string }) =>
    session.payment_status === 'paid',
}));

import paymentController from '../../src/services/payments/payments.controller';
import paymentModel from '../../src/services/payments/payment.model';
import poolParticipantModel from '../../src/services/pool.participants/pool.participant.model';
import poolModel from '../../src/services/pools/pool.model';

const mockFind = paymentModel.find as unknown as jest.Mock;
const mockFindById = paymentModel.findById as unknown as jest.Mock;
const mockFindOneAndUpdate =
  paymentModel.findOneAndUpdate as unknown as jest.Mock;
const mockParticipantUpdateOne =
  poolParticipantModel.updateOne as unknown as jest.Mock;
const mockParticipantFindOneAndUpdate =
  poolParticipantModel.findOneAndUpdate as unknown as jest.Mock;
const mockPoolFindById = poolModel.findById as unknown as jest.Mock;
const mockPoolUpdateOne = poolModel.updateOne as unknown as jest.Mock;

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

function adminReq(params: Record<string, string> = { _id: '1' }) {
  return {
    meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
    params,
  } as unknown as Request;
}

function retailerReq(params: Record<string, string> = { _id: '1' }) {
  return {
    meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
    params,
  } as unknown as Request;
}

describe('PaymentController.confirm', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await paymentController.confirm(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns 403 when a retailer confirms a payment they do not own', async () => {
    mockFindById.mockResolvedValue({ user_ref: 'someone-else' });
    const res = mockRes();

    await paymentController.confirm(retailerReq(), res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('leaves the payment PENDING when Thawani has not confirmed payment yet', async () => {
    mockFindById.mockResolvedValue({
      _id: 'payment-1',
      user_ref: 'retailer-1',
      status: 'PENDING',
      thawaniSessionId: 'sess-1',
    });
    mockGetSession.mockResolvedValue({ payment_status: 'unpaid' });
    const res = mockRes();

    await paymentController.confirm(retailerReq(), res);

    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('confirms COMPLETED and flips the participant to WAITING when Thawani reports paid', async () => {
    mockFindById.mockResolvedValue({
      _id: 'payment-1',
      user_ref: 'retailer-1',
      status: 'PENDING',
      thawaniSessionId: 'sess-1',
    });
    mockGetSession.mockResolvedValue({
      payment_status: 'paid',
      invoice: 'inv-1',
    });
    mockFindOneAndUpdate.mockResolvedValue({
      _id: 'payment-1',
      poolParticipant_ref: 'participant-1',
      user_ref: 'retailer-1',
      status: 'COMPLETED',
    });
    const res = mockRes();

    await paymentController.confirm(retailerReq(), res);

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'payment-1', status: 'PENDING' },
      {
        $set: { status: 'COMPLETED', thawaniPaymentId: 'inv-1' },
      },
      { new: true }
    );
    expect(mockParticipantUpdateOne).toHaveBeenCalledWith(
      { _id: 'participant-1', status: 'PENDING_PAYMENT' },
      { $set: { status: 'WAITING' } }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('is idempotent: a payment already resolved is returned unchanged without calling Thawani', async () => {
    mockFindById.mockResolvedValue({
      _id: 'payment-1',
      user_ref: 'retailer-1',
      status: 'COMPLETED',
    });
    const res = mockRes();

    await paymentController.confirm(retailerReq(), res);

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('PaymentController.cancel', () => {
  it('returns 409 when the payment is not PENDING', async () => {
    mockFindById.mockResolvedValue({
      _id: 'payment-1',
      user_ref: 'retailer-1',
      status: 'COMPLETED',
    });
    mockFindOneAndUpdate.mockResolvedValue(null);
    const res = mockRes();

    await paymentController.cancel(retailerReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('marks the payment FAILED, the participant PAYMENT_FAILED, and releases the reservation on an OPEN pool', async () => {
    mockFindById.mockResolvedValue({
      _id: 'payment-1',
      user_ref: 'retailer-1',
      status: 'PENDING',
    });
    mockFindOneAndUpdate.mockResolvedValue({
      _id: 'payment-1',
      user_ref: 'retailer-1',
      pool_ref: 'pool-1',
      poolParticipant_ref: 'participant-1',
      status: 'FAILED',
    });
    mockParticipantFindOneAndUpdate.mockResolvedValue({
      _id: 'participant-1',
      quantity: 20,
    });
    mockPoolFindById.mockResolvedValue({ status: 'OPEN' });
    const res = mockRes();

    await paymentController.cancel(retailerReq(), res);

    expect(mockParticipantFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'participant-1', status: 'PENDING_PAYMENT' },
      { $set: { status: 'PAYMENT_FAILED' } }
    );
    expect(mockPoolUpdateOne).toHaveBeenCalledWith(
      { _id: 'pool-1' },
      { $inc: { currentQuantity: 20 } }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('does not touch currentQuantity once the pool has moved past OPEN', async () => {
    mockFindById.mockResolvedValue({
      _id: 'payment-1',
      user_ref: 'retailer-1',
      status: 'PENDING',
    });
    mockFindOneAndUpdate.mockResolvedValue({
      _id: 'payment-1',
      user_ref: 'retailer-1',
      pool_ref: 'pool-1',
      poolParticipant_ref: 'participant-1',
      status: 'FAILED',
    });
    mockParticipantFindOneAndUpdate.mockResolvedValue({
      _id: 'participant-1',
      quantity: 20,
    });
    mockPoolFindById.mockResolvedValue({ status: 'TARGET_REACHED' });
    const res = mockRes();

    await paymentController.cancel(retailerReq(), res);

    expect(mockPoolUpdateOne).not.toHaveBeenCalled();
  });
});

describe('PaymentController.retryRefund', () => {
  it('returns 409 when the payment is not REFUND_FAILED', async () => {
    mockFindById.mockResolvedValue({ _id: 'payment-1', status: 'PENDING' });
    const res = mockRes();

    await paymentController.retryRefund(adminReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockCreateRefund).not.toHaveBeenCalled();
  });

  it('re-requests the refund and moves to REFUND_PENDING on success', async () => {
    const payment: any = {
      _id: 'payment-1',
      status: 'REFUND_FAILED',
      thawaniPaymentId: 'thawani-pay-1',
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(payment);
    mockCreateRefund.mockResolvedValue({ refund_id: 'refund-2' });
    const res = mockRes();

    await paymentController.retryRefund(adminReq(), res);

    expect(mockCreateRefund).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'thawani-pay-1' })
    );
    expect(payment.status).toBe('REFUND_PENDING');
    expect(payment.thawaniRefundId).toBe('refund-2');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 502 and leaves status REFUND_FAILED when the retry itself errors', async () => {
    const payment: any = {
      _id: 'payment-1',
      status: 'REFUND_FAILED',
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(payment);
    mockCreateRefund.mockRejectedValue(new Error('gateway down'));
    const res = mockRes();

    await paymentController.retryRefund(adminReq(), res);

    expect(payment.status).toBe('REFUND_FAILED');
    expect(res.status).toHaveBeenCalledWith(502);
  });
});

describe('PaymentController.confirmRefund', () => {
  it('returns 409 when the payment is not REFUND_PENDING', async () => {
    mockFindById.mockResolvedValue({ _id: 'payment-1', status: 'PENDING' });
    const res = mockRes();

    await paymentController.confirmRefund(adminReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('marks the payment REFUNDED and the participant REFUNDED', async () => {
    const payment: any = {
      _id: 'payment-1',
      poolParticipant_ref: 'participant-1',
      user_ref: 'retailer-1',
      status: 'REFUND_PENDING',
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(payment);
    const res = mockRes();

    await paymentController.confirmRefund(adminReq(), res);

    expect(payment.status).toBe('REFUNDED');
    expect(mockParticipantUpdateOne).toHaveBeenCalledWith(
      { _id: 'participant-1' },
      { $set: { status: 'REFUNDED' } }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('PaymentController.list', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {} } as unknown as Request;
    const res = mockRes();

    await paymentController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('scopes a non-ADMIN caller to their own payments', async () => {
    mockFind.mockResolvedValue([]);
    const res = mockRes();

    await paymentController.list(retailerReq(), res);

    expect(mockFind).toHaveBeenCalledWith({ user_ref: 'retailer-1' });
  });

  it('returns every payment for ADMIN', async () => {
    mockFind.mockResolvedValue([]);
    const res = mockRes();

    await paymentController.list(adminReq(), res);

    expect(mockFind).toHaveBeenCalledWith({});
  });
});

describe('PaymentController.getById', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await paymentController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns 404 when the payment does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const res = mockRes();

    await paymentController.getById(retailerReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 403 when a non-ADMIN caller requests a payment they do not own', async () => {
    mockFindById.mockResolvedValue({ user_ref: 'someone-else' });
    const res = mockRes();

    await paymentController.getById(retailerReq(), res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns the payment for its owner', async () => {
    mockFindById.mockResolvedValue({ user_ref: 'retailer-1' });
    const res = mockRes();

    await paymentController.getById(retailerReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets ADMIN fetch any payment', async () => {
    mockFindById.mockResolvedValue({ user_ref: 'someone-else' });
    const res = mockRes();

    await paymentController.getById(adminReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
