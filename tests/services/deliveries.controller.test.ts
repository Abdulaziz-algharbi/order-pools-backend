import { Request, Response } from 'express';

const mockDeliverySave = jest.fn();

jest.mock('../../src/services/deliveries/delivery.model', () => {
  const actual = jest.requireActual(
    '../../src/services/deliveries/delivery.model'
  );
  const MockDeliveryModel: any = jest.fn().mockImplementation(function (
    this: any,
    data: any
  ) {
    Object.assign(this, data);
    this.save = mockDeliverySave;
  });
  MockDeliveryModel.modelName = 'Delivery';
  MockDeliveryModel.find = jest.fn();
  MockDeliveryModel.findById = jest.fn();
  MockDeliveryModel.findOne = jest.fn();
  return {
    __esModule: true,
    default: MockDeliveryModel,
    couldBeUpdated: actual.couldBeUpdated,
  };
});

jest.mock('../../src/services/pools/pool.model', () => ({
  __esModule: true,
  default: { findById: jest.fn(), distinct: jest.fn() },
}));

jest.mock(
  '../../src/services/pool.participants/pool.participant.model',
  () => ({
    __esModule: true,
    default: { distinct: jest.fn() },
  })
);

jest.mock('../../src/services/product.offers/product.offer.model', () => ({
  __esModule: true,
  default: { distinct: jest.fn() },
}));

import deliveryController from '../../src/services/deliveries/deliveries.controller';
import deliveryModel from '../../src/services/deliveries/delivery.model';
import poolModel from '../../src/services/pools/pool.model';
import poolParticipantModel from '../../src/services/pool.participants/pool.participant.model';
import productOfferModel from '../../src/services/product.offers/product.offer.model';
import appBroker from '../../src/app.broker';
import EVENTS from '../../src/constants/EVENTS';

const mockFind = deliveryModel.find as unknown as jest.Mock;
const mockFindById = deliveryModel.findById as unknown as jest.Mock;
const mockFindOne = deliveryModel.findOne as unknown as jest.Mock;
const mockPoolFindById = poolModel.findById as unknown as jest.Mock;
const mockPoolDistinct = poolModel.distinct as unknown as jest.Mock;
const mockParticipantDistinct =
  poolParticipantModel.distinct as unknown as jest.Mock;
const mockOfferDistinct = productOfferModel.distinct as unknown as jest.Mock;

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('DeliveryController.create', () => {
  it('returns 404 when the pool does not exist', async () => {
    mockPoolFindById.mockResolvedValue(null);
    const req = { body: { pool_ref: 'pool-1' } } as unknown as Request;
    const res = mockRes();

    await deliveryController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 409 when the pool has not reached its target yet (OPEN)', async () => {
    mockPoolFindById.mockResolvedValue({ _id: 'pool-1', status: 'OPEN' });
    const req = { body: { pool_ref: 'pool-1' } } as unknown as Request;
    const res = mockRes();

    await deliveryController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockFindOne).not.toHaveBeenCalled();
  });

  it('returns 409 for a CANCELLED pool too', async () => {
    mockPoolFindById.mockResolvedValue({ _id: 'pool-1', status: 'CANCELLED' });
    const req = { body: { pool_ref: 'pool-1' } } as unknown as Request;
    const res = mockRes();

    await deliveryController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 409 when a delivery already exists for the pool', async () => {
    mockPoolFindById.mockResolvedValue({
      _id: 'pool-1',
      status: 'TARGET_REACHED',
    });
    mockFindOne.mockResolvedValue({ _id: 'existing-delivery' });
    const req = { body: { pool_ref: 'pool-1' } } as unknown as Request;
    const res = mockRes();

    await deliveryController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('creates the delivery once the pool has reached target and has none yet', async () => {
    mockPoolFindById.mockResolvedValue({
      _id: 'pool-1',
      status: 'TARGET_REACHED',
    });
    mockFindOne.mockResolvedValue(null);
    mockDeliverySave.mockResolvedValue({ _id: 'delivery-1' });
    const req = {
      body: { pool_ref: 'pool-1' },
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
    } as unknown as Request;
    const res = mockRes();

    await deliveryController.create(req, res);

    expect(mockDeliverySave).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('emits DELIVERY_ASSIGNED with the new delivery/pool ids and the acting admin once created', async () => {
    mockPoolFindById.mockResolvedValue({
      _id: 'pool-1',
      status: 'TARGET_REACHED',
    });
    mockFindOne.mockResolvedValue(null);
    mockDeliverySave.mockResolvedValue({ _id: 'delivery-1' });
    const req = {
      body: { pool_ref: 'pool-1' },
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
    } as unknown as Request;
    const res = mockRes();

    const emitted = jest.fn();
    const unsubscribe = appBroker.on(EVENTS.DELIVERY_ASSIGNED, emitted);

    await deliveryController.create(req, res);

    unsubscribe();

    expect(emitted).toHaveBeenCalledWith({
      deliveryId: 'delivery-1',
      poolId: 'pool-1',
      assignedBy: 'admin-1',
    });
  });
});

describe('DeliveryController.list', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {} } as Request;
    const res = mockRes();

    await deliveryController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('queries with an empty filter for ADMIN', async () => {
    mockFind.mockResolvedValue([{ _id: '1' }]);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
    } as Request;
    const res = mockRes();

    await deliveryController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({});
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('scopes a RETAILER to pools they participate in', async () => {
    mockParticipantDistinct.mockResolvedValue(['pool-1', 'pool-2']);
    mockFind.mockResolvedValue([]);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
    } as Request;
    const res = mockRes();

    await deliveryController.list(req, res);

    expect(mockParticipantDistinct).toHaveBeenCalledWith('pool_ref', {
      user_ref: 'retailer-1',
    });
    expect(mockFind).toHaveBeenCalledWith({
      pool_ref: { $in: ['pool-1', 'pool-2'] },
    });
  });

  it('scopes a SUPPLIER to pools built from their own offers', async () => {
    mockOfferDistinct.mockResolvedValue(['offer-1']);
    mockPoolDistinct.mockResolvedValue(['pool-9']);
    mockFind.mockResolvedValue([]);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
    } as Request;
    const res = mockRes();

    await deliveryController.list(req, res);

    expect(mockOfferDistinct).toHaveBeenCalledWith('_id', {
      user_ref: 'supplier-1',
    });
    expect(mockPoolDistinct).toHaveBeenCalledWith('_id', {
      productoffer_ref: { $in: ['offer-1'] },
    });
    expect(mockFind).toHaveBeenCalledWith({ pool_ref: { $in: ['pool-9'] } });
  });
});

describe('DeliveryController.getById', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await deliveryController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns 404 when the delivery does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: 'missing' },
    } as unknown as Request;
    const res = mockRes();

    await deliveryController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when a retailer requests a delivery for a pool they didn't join", async () => {
    mockFindById.mockResolvedValue({ pool_ref: 'pool-1' });
    mockParticipantDistinct.mockResolvedValue(['pool-2']);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await deliveryController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns the delivery for a retailer who joined the pool', async () => {
    mockFindById.mockResolvedValue({ pool_ref: 'pool-1' });
    mockParticipantDistinct.mockResolvedValue(['pool-1']);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await deliveryController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets ADMIN fetch any delivery', async () => {
    mockFindById.mockResolvedValue({ pool_ref: 'pool-1' });
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await deliveryController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
