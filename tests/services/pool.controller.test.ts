import { Request, Response } from 'express';

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

import poolController from '../../src/services/pools/pool.controller';
import poolModel from '../../src/services/pools/pool.model';
import productOfferModel from '../../src/services/product.offers/product.offer.model';

const mockFind = poolModel.find as unknown as jest.Mock;
const mockFindById = poolModel.findById as unknown as jest.Mock;
const mockOfferDistinct = productOfferModel.distinct as unknown as jest.Mock;

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('PoolController.list', () => {
  it('shows only OPEN pools to an anonymous caller', async () => {
    mockFind.mockResolvedValue([{ _id: '1', status: 'OPEN' }]);
    const req = { meta: { user: undefined } } as unknown as Request;
    const res = mockRes();

    await poolController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({ status: 'OPEN' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('shows only OPEN pools to a RETAILER', async () => {
    mockFind.mockResolvedValue([]);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
    } as Request;
    const res = mockRes();

    await poolController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({ status: 'OPEN' });
    expect(mockOfferDistinct).not.toHaveBeenCalled();
  });

  it('scopes a SUPPLIER to pools built from their own offers, any status', async () => {
    mockOfferDistinct.mockResolvedValue(['offer-1']);
    mockFind.mockResolvedValue([]);
    const req = {
      meta: { user: { userId: 'supplier-1', role: 'SUPPLIER' } },
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
    mockFind.mockResolvedValue([{ _id: '1' }, { _id: '2' }]);
    const req = {
      meta: { user: { userId: 'admin-1', role: 'ADMIN' } },
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
    mockFindById.mockResolvedValue({ status: 'OPEN' });
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
    mockFindById.mockResolvedValue({ status: 'CANCELLED' });
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('lets a RETAILER view an OPEN pool', async () => {
    mockFindById.mockResolvedValue({ status: 'OPEN' });
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
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
      meta: { user: { userId: 'supplier-1', role: 'SUPPLIER' } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('lets a SUPPLIER view their own pool regardless of status', async () => {
    mockFindById.mockResolvedValue({
      status: 'CANCELLED',
      productoffer_ref: { toString: () => 'offer-1' },
    });
    mockOfferDistinct.mockResolvedValue(['offer-1']);
    const req = {
      meta: { user: { userId: 'supplier-1', role: 'SUPPLIER' } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets ADMIN view any pool regardless of status', async () => {
    mockFindById.mockResolvedValue({ status: 'CANCELLED' });
    const req = {
      meta: { user: { userId: 'admin-1', role: 'ADMIN' } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
