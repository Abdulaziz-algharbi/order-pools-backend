import { Request, Response } from 'express';

const mockPayoutSave = jest.fn();

jest.mock('../../src/services/supplier.payouts/supplier.payout.model', () => {
  const actual = jest.requireActual(
    '../../src/services/supplier.payouts/supplier.payout.model'
  );
  const MockModel: any = jest.fn().mockImplementation(function (
    this: any,
    data: any
  ) {
    Object.assign(this, data);
    this.save = mockPayoutSave;
  });
  MockModel.modelName = 'SupplierPayout';
  MockModel.find = jest.fn();
  MockModel.findById = jest.fn();
  MockModel.findOne = jest.fn();
  return {
    __esModule: true,
    default: MockModel,
    couldBeUpdated: actual.couldBeUpdated,
  };
});

jest.mock('../../src/services/pools/pool.model', () => ({
  __esModule: true,
  default: { findById: jest.fn(), distinct: jest.fn() },
}));

jest.mock('../../src/services/product.offers/product.offer.model', () => ({
  __esModule: true,
  default: { findById: jest.fn(), distinct: jest.fn() },
}));

jest.mock('../../src/services/deliveries/delivery.model', () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

import supplierPayoutController from '../../src/services/supplier.payouts/supplier.payouts.controller';
import supplierPayoutModel from '../../src/services/supplier.payouts/supplier.payout.model';
import poolModel from '../../src/services/pools/pool.model';
import productOfferModel from '../../src/services/product.offers/product.offer.model';
import deliveryModel from '../../src/services/deliveries/delivery.model';
import appBroker from '../../src/app.broker';
import EVENTS from '../../src/constants/EVENTS';

// listeners() is registered once at controller construction (see
// base.controller.ts), so DELIVERY_COMPLETED handling below is exercised
// through the real AppBroker singleton, exactly as it runs in production.

const mockFind = supplierPayoutModel.find as unknown as jest.Mock;
const mockFindById = supplierPayoutModel.findById as unknown as jest.Mock;
const mockFindOne = supplierPayoutModel.findOne as unknown as jest.Mock;
const mockPoolFindById = poolModel.findById as unknown as jest.Mock;
const mockPoolDistinct = poolModel.distinct as unknown as jest.Mock;
const mockOfferFindById = productOfferModel.findById as unknown as jest.Mock;
const mockOfferDistinct = productOfferModel.distinct as unknown as jest.Mock;
const mockDeliveryFindOne = deliveryModel.findOne as unknown as jest.Mock;

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

function adminReq(body: Record<string, unknown> = {}) {
  return {
    meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
    body: { pool_ref: 'pool-1', ...body },
  } as unknown as Request;
}

describe('SupplierPayoutController.create', () => {
  beforeEach(() => {
    mockPoolFindById.mockResolvedValue({
      _id: 'pool-1',
      productoffer_ref: 'offer-1',
    });
    mockFindOne.mockResolvedValue(null);
  });

  it('returns 404 when the pool does not exist', async () => {
    mockPoolFindById.mockResolvedValue(null);
    const res = mockRes();

    await supplierPayoutController.create(adminReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockDeliveryFindOne).not.toHaveBeenCalled();
  });

  it('returns 409 when the delivery is not DELIVERED yet', async () => {
    mockDeliveryFindOne.mockResolvedValue({ deliveryStatus: 'DELIVERING' });
    const res = mockRes();

    await supplierPayoutController.create(adminReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockOfferFindById).not.toHaveBeenCalled();
  });

  it('returns 409 when no delivery exists for the pool at all', async () => {
    mockDeliveryFindOne.mockResolvedValue(null);
    const res = mockRes();

    await supplierPayoutController.create(adminReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 409 when a payout already exists for this pool', async () => {
    mockDeliveryFindOne.mockResolvedValue({ deliveryStatus: 'DELIVERED' });
    mockFindOne.mockResolvedValue({ _id: 'existing-payout' });
    const res = mockRes();

    await supplierPayoutController.create(adminReq(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockOfferFindById).not.toHaveBeenCalled();
  });

  it("returns 404 when the pool's product offer can't be found", async () => {
    mockDeliveryFindOne.mockResolvedValue({ deliveryStatus: 'DELIVERED' });
    mockOfferFindById.mockResolvedValue(null);
    const res = mockRes();

    await supplierPayoutController.create(adminReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPayoutSave).not.toHaveBeenCalled();
  });

  it("creates the payout with the pool's product offer price as amount", async () => {
    mockDeliveryFindOne.mockResolvedValue({ deliveryStatus: 'DELIVERED' });
    mockOfferFindById.mockResolvedValue({ _id: 'offer-1', price: 150 });
    mockPayoutSave.mockResolvedValue({ _id: 'payout-1' });
    const res = mockRes();

    await supplierPayoutController.create(adminReq(), res);

    expect(mockOfferFindById).toHaveBeenCalledWith('offer-1');
    expect(supplierPayoutModel).toHaveBeenCalledWith(
      expect.objectContaining({
        pool_ref: 'pool-1',
        amount: 150,
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('SupplierPayoutController.list', () => {
  it('returns every payout for ADMIN', async () => {
    mockFind.mockResolvedValue([]);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
    } as unknown as Request;
    const res = mockRes();

    await supplierPayoutController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({});
  });

  it('scopes a SUPPLIER to payouts for pools built from their own offers', async () => {
    mockOfferDistinct.mockResolvedValue(['offer-1']);
    mockPoolDistinct.mockResolvedValue(['pool-1']);
    mockFind.mockResolvedValue([]);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
    } as unknown as Request;
    const res = mockRes();

    await supplierPayoutController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({ pool_ref: { $in: ['pool-1'] } });
  });
});

describe('DELIVERY_COMPLETED -> auto-create payout (wired through the real AppBroker)', () => {
  it("auto-creates the payout from the pool's product offer price when none exists yet", async () => {
    mockFindOne.mockResolvedValue(null);
    mockPoolFindById.mockResolvedValue({
      _id: 'pool-1',
      productoffer_ref: 'offer-1',
    });
    mockOfferFindById.mockResolvedValue({ _id: 'offer-1', price: 150 });
    mockPayoutSave.mockResolvedValue({ _id: 'payout-1' });

    const handleSpy = jest.spyOn(
      supplierPayoutController as any,
      'handleDeliveryCompleted'
    );

    appBroker.emit(EVENTS.DELIVERY_COMPLETED, {
      deliveryId: 'delivery-1',
      poolId: 'pool-1',
    });

    expect(handleSpy).toHaveBeenCalledTimes(1);
    await handleSpy.mock.results[0].value;

    expect(supplierPayoutModel).toHaveBeenCalledWith(
      expect.objectContaining({
        pool_ref: 'pool-1',
        amount: 150,
      })
    );
    expect(mockPayoutSave).toHaveBeenCalled();
  });

  it('does nothing when a payout already exists for the pool', async () => {
    mockFindOne.mockResolvedValue({ _id: 'existing-payout' });

    const handleSpy = jest.spyOn(
      supplierPayoutController as any,
      'handleDeliveryCompleted'
    );

    appBroker.emit(EVENTS.DELIVERY_COMPLETED, {
      deliveryId: 'delivery-1',
      poolId: 'pool-1',
    });

    await handleSpy.mock.results[0].value;

    expect(mockPoolFindById).not.toHaveBeenCalled();
    expect(mockPayoutSave).not.toHaveBeenCalled();
  });

  it("does nothing when the pool's product offer can't be found", async () => {
    mockFindOne.mockResolvedValue(null);
    mockPoolFindById.mockResolvedValue({
      _id: 'pool-1',
      productoffer_ref: 'offer-1',
    });
    mockOfferFindById.mockResolvedValue(null);

    const handleSpy = jest.spyOn(
      supplierPayoutController as any,
      'handleDeliveryCompleted'
    );

    appBroker.emit(EVENTS.DELIVERY_COMPLETED, {
      deliveryId: 'delivery-1',
      poolId: 'pool-1',
    });

    await handleSpy.mock.results[0].value;

    expect(mockPayoutSave).not.toHaveBeenCalled();
  });
});

describe('SupplierPayoutController.update', () => {
  it('auto-stamps paidAt when status moves to COMPLETED without an explicit paidAt', async () => {
    const doc: any = {
      status: 'PROCESSING',
      paidAt: null,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      params: { _id: '1' },
      body: { status: 'COMPLETED', transactionReference: 'txn-1' },
    } as unknown as Request;
    const res = mockRes();

    await supplierPayoutController.update(req, res);

    expect(doc.status).toBe('COMPLETED');
    expect(doc.transactionReference).toBe('txn-1');
    expect(doc.paidAt).toBeInstanceOf(Date);
    expect(doc.save).toHaveBeenCalled();
  });
});
