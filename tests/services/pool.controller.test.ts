import { Request, Response } from 'express';
import mongoose from 'mongoose';

jest.mock('../../src/services/pools/pool.model', () => {
  const actual = jest.requireActual('../../src/services/pools/pool.model');
  return {
    __esModule: true,
    default: { modelName: 'Pool', find: jest.fn(), findById: jest.fn() },
    couldBeUpdated: actual.couldBeUpdated,
  };
});

jest.mock('../../src/services/product.offers/product.offer.model', () => ({
  __esModule: true,
  default: { distinct: jest.fn() },
}));

jest.mock('../../src/services/payments/payment.model', () => ({
  __esModule: true,
  default: { find: jest.fn(), updateMany: jest.fn() },
}));

jest.mock(
  '../../src/services/pool.participants/pool.participant.model',
  () => ({
    __esModule: true,
    // `aggregate` backs PoolController.participantCounts() (used by both
    // list() and getById() to attach a computed participantCount) — without
    // it, every list()/getById() call throws and falls through to a 500.
    default: {
      updateMany: jest.fn(),
      aggregate: jest.fn().mockResolvedValue([]),
      // Backs PoolController.ownParticipantPoolIds() — used to keep a pool
      // visible to a RETAILER who has already joined it, even once it moves
      // past OPEN.
      distinct: jest.fn().mockResolvedValue([]),
    },
  })
);

const mockCreateRefund = jest.fn();

jest.mock('../../src/services/thawani/thawani.gateway', () => ({
  __esModule: true,
  default: {
    createRefund: (...args: unknown[]) => mockCreateRefund(...args),
  },
}));

import poolController from '../../src/services/pools/pool.controller';
import poolModel from '../../src/services/pools/pool.model';
import productOfferModel from '../../src/services/product.offers/product.offer.model';
import paymentModel from '../../src/services/payments/payment.model';
import poolParticipantModel from '../../src/services/pool.participants/pool.participant.model';

const mockFind = poolModel.find as unknown as jest.Mock;
const mockFindById = poolModel.findById as unknown as jest.Mock;
const mockOfferDistinct = productOfferModel.distinct as unknown as jest.Mock;
const mockPaymentFind = paymentModel.find as unknown as jest.Mock;
const mockPaymentUpdateMany = paymentModel.updateMany as unknown as jest.Mock;
const mockParticipantUpdateMany =
  poolParticipantModel.updateMany as unknown as jest.Mock;
const mockParticipantDistinct =
  poolParticipantModel.distinct as unknown as jest.Mock;

// expirePool() wraps the pool-cancel + Payment/PoolParticipant sweep in a
// real mongoose transaction (see pool.controller.ts) — mongoose.startSession()
// is mocked here rather than the real driver so these tests never need a
// live, replica-set-backed Mongo. The mock just runs the callback
// directly, matching the one behavior these tests care about: everything
// inside withTransaction() still executes.
jest.spyOn(mongoose, 'startSession').mockImplementation(
  async () =>
    ({
      withTransaction: async (fn: () => Promise<unknown>) => fn(),
      endSession: jest.fn().mockResolvedValue(undefined),
    }) as unknown as mongoose.ClientSession
);

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

// PoolController.list()/getById() spread `doc.toObject()` onto the response
// (to attach the computed participantCount alongside the pool's real
// fields) — a real Mongoose document has that method, a bare object
// literal doesn't. Wrap a literal in this so it behaves like one.
function mockDoc<T extends Record<string, unknown>>(
  fields: T
): T & { toObject: () => T } {
  return {
    ...fields,
    toObject() {
      return fields;
    },
  };
}

describe('PoolController.list', () => {
  it('shows only OPEN pools to an anonymous caller', async () => {
    mockFind.mockResolvedValue([mockDoc({ _id: '1', status: 'OPEN' })]);
    const req = { meta: { user: undefined } } as unknown as Request;
    const res = mockRes();

    await poolController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({ status: 'OPEN' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // A RETAILER sees OPEN pools *plus* any pool they've already joined,
  // regardless of its current status (PoolController.buildListFilter) — so
  // the pool-scoping half of ownParticipantPoolIds() always runs for them,
  // matching ownOfferIds() for a SUPPLIER below.
  it('shows OPEN pools plus pools already joined to a RETAILER', async () => {
    mockParticipantDistinct.mockResolvedValue(['pool-9']);
    mockFind.mockResolvedValue([]);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
    } as Request;
    const res = mockRes();

    await poolController.list(req, res);

    expect(mockParticipantDistinct).toHaveBeenCalledWith('pool_ref', {
      user_ref: 'retailer-1',
    });
    expect(mockFind).toHaveBeenCalledWith({
      $or: [{ status: 'OPEN' }, { _id: { $in: ['pool-9'] } }],
    });
    expect(mockOfferDistinct).not.toHaveBeenCalled();
  });

  it('scopes a SUPPLIER to pools built from their own offers, any status', async () => {
    mockOfferDistinct.mockResolvedValue(['offer-1']);
    mockFind.mockResolvedValue([]);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
    } as Request;
    const res = mockRes();

    await poolController.list(req, res);

    expect(mockOfferDistinct).toHaveBeenCalledWith('_id', {
      user_ref: 'supplier-1',
    });
    expect(mockFind).toHaveBeenCalledWith({
      productoffer_ref: { $in: ['offer-1'] },
    });
  });

  it('returns every pool for ADMIN, with no filter at all', async () => {
    mockFind.mockResolvedValue([mockDoc({ _id: '1' }), mockDoc({ _id: '2' })]);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
    } as Request;
    const res = mockRes();

    await poolController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({});
  });
});

describe('PoolController.getById', () => {
  it('returns 404 when the pool does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: undefined },
      params: { _id: 'missing' },
    } as unknown as Request;
    const res = mockRes();

    await poolController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('lets an anonymous caller view an OPEN pool', async () => {
    mockFindById.mockResolvedValue(mockDoc({ _id: '1', status: 'OPEN' }));
    const req = {
      meta: { user: undefined },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('blocks an anonymous caller from a non-OPEN pool', async () => {
    mockFindById.mockResolvedValue({ status: 'COMPLETED' });
    const req = {
      meta: { user: undefined },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('blocks a RETAILER from a non-OPEN pool', async () => {
    // Explicit, not relying on the mock's factory default: a real
    // findById() result always carries _id, and a prior test in this file
    // may have left poolParticipantModel.distinct's mocked return value set
    // to a non-empty array (clearMocks only clears call history, not a
    // previously configured mockResolvedValue).
    mockParticipantDistinct.mockResolvedValue([]);
    mockFindById.mockResolvedValue({ _id: 'pool-1', status: 'CANCELLED' });
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('lets a RETAILER view an OPEN pool', async () => {
    mockFindById.mockResolvedValue(mockDoc({ _id: '1', status: 'OPEN' }));
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 403 when a SUPPLIER requests a pool that isn't built from their own products", async () => {
    mockFindById.mockResolvedValue({
      status: 'OPEN',
      productoffer_ref: { toString: () => 'offer-9' },
    });
    mockOfferDistinct.mockResolvedValue(['offer-1']);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('lets a SUPPLIER view their own pool regardless of status', async () => {
    mockFindById.mockResolvedValue(
      mockDoc({
        _id: '1',
        status: 'CANCELLED',
        productoffer_ref: { toString: () => 'offer-1' },
      })
    );
    mockOfferDistinct.mockResolvedValue(['offer-1']);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets ADMIN view any pool regardless of status', async () => {
    mockFindById.mockResolvedValue(mockDoc({ _id: '1', status: 'CANCELLED' }));
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('PoolController.expirePool', () => {
  const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000);

  function poolDoc(overrides: Record<string, unknown> = {}) {
    return {
      _id: 'pool-1',
      status: 'OPEN',
      endDate: YESTERDAY,
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  beforeEach(() => {
    mockPaymentUpdateMany.mockResolvedValue({});
    mockParticipantUpdateMany.mockResolvedValue({});
    mockPaymentFind.mockResolvedValue([]);
  });

  it('returns 404 when the pool does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = { params: { _id: 'missing' } } as unknown as Request;
    const res = mockRes();

    await poolController.expirePool(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 409 when the pool is not OPEN', async () => {
    mockFindById.mockResolvedValue(poolDoc({ status: 'TARGET_REACHED' }));
    const req = { params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await poolController.expirePool(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 409 when the pool has not reached its endDate yet', async () => {
    mockFindById.mockResolvedValue(poolDoc({ endDate: TOMORROW }));
    const req = { params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await poolController.expirePool(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('sets the pool CANCELLED and sweeps still-PENDING payments to FAILED', async () => {
    const pool = poolDoc();
    mockFindById.mockResolvedValue(pool);
    const req = { params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await poolController.expirePool(req, res);

    expect(pool.status).toBe('CANCELLED');
    expect(pool.save).toHaveBeenCalled();
    expect(mockPaymentUpdateMany).toHaveBeenCalledWith(
      { pool_ref: 'pool-1', status: 'PENDING' },
      { $set: { status: 'FAILED' } },
      { session: expect.anything() }
    );
    expect(mockParticipantUpdateMany).toHaveBeenCalledWith(
      { pool_ref: 'pool-1', status: 'PENDING_PAYMENT' },
      { $set: { status: 'PAYMENT_FAILED' } },
      { session: expect.anything() }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('never reports success if the participant sweep inside the transaction fails', async () => {
    const pool = poolDoc();
    mockFindById.mockResolvedValue(pool);
    mockParticipantUpdateMany.mockRejectedValueOnce(new Error('db down'));
    const req = { params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await poolController.expirePool(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.status).not.toHaveBeenCalledWith(200);
    expect(mockPaymentFind).not.toHaveBeenCalled();
  });

  it('requests a refund for every COMPLETED payment and reports the count', async () => {
    const pool = poolDoc();
    mockFindById.mockResolvedValue(pool);
    const payment1: any = {
      _id: 'payment-1',
      status: 'COMPLETED',
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockPaymentFind.mockResolvedValue([payment1]);
    mockCreateRefund.mockResolvedValue({ refund_id: 'refund-1' });
    const req = { params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await poolController.expirePool(req, res);

    expect(mockCreateRefund).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'payment-1' })
    );
    expect(payment1.status).toBe('REFUND_PENDING');
    expect(payment1.thawaniRefundId).toBe('refund-1');
    const [body] = (res.send as jest.Mock).mock.calls[0];
    expect(body.refundsRequested).toBe(1);
    expect(body.refundsFailed).toBe(0);
  });

  it('marks a payment REFUND_FAILED (without blocking the others) when its refund request errors', async () => {
    const pool = poolDoc();
    mockFindById.mockResolvedValue(pool);
    const payment1: any = {
      _id: 'payment-1',
      status: 'COMPLETED',
      save: jest.fn().mockResolvedValue(undefined),
    };
    const payment2: any = {
      _id: 'payment-2',
      status: 'COMPLETED',
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockPaymentFind.mockResolvedValue([payment1, payment2]);
    mockCreateRefund
      .mockRejectedValueOnce(new Error('gateway down'))
      .mockResolvedValueOnce({ refund_id: 'refund-2' });
    const req = { params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await poolController.expirePool(req, res);

    expect(payment1.status).toBe('REFUND_FAILED');
    expect(payment2.status).toBe('REFUND_PENDING');
    const [body] = (res.send as jest.Mock).mock.calls[0];
    expect(body.refundsRequested).toBe(1);
    expect(body.refundsFailed).toBe(1);
  });
});
