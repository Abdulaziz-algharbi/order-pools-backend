import { Request, Response } from 'express';

jest.mock('../../src/services/product.offers/product.offer.model', () => {
  const actual = jest.requireActual(
    '../../src/services/product.offers/product.offer.model'
  );
  return {
    __esModule: true,
    default: {
      modelName: 'ProductOffer',
      find: jest.fn(),
      findById: jest.fn(),
    },
    couldBeUpdated: actual.couldBeUpdated,
  };
});

import BaseController from '../../src/services/base/base.controller';
import productOffersController from '../../src/services/product.offers/product.offers.controller';
import productOfferModel from '../../src/services/product.offers/product.offer.model';

const mockFind = productOfferModel.find as unknown as jest.Mock;
const mockFindById = productOfferModel.findById as unknown as jest.Mock;

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('ProductOfferController.create', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const superCreate = jest
      .spyOn(BaseController.prototype, 'create')
      .mockResolvedValue(undefined);
    const req = { meta: {}, body: {} } as Request;
    const res = mockRes();

    await productOffersController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(superCreate).not.toHaveBeenCalled();
    superCreate.mockRestore();
  });

  it('sets user_ref to the caller for a SUPPLIER, ignoring any client-supplied value', async () => {
    const superCreate = jest
      .spyOn(BaseController.prototype, 'create')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      body: { user_ref: 'someone-else', name: 'Rice', wholeQuantity: 10 },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.create(req, res);

    expect(req.body.user_ref).toBe('supplier-1');
    expect(superCreate).toHaveBeenCalledWith(req, res);
    superCreate.mockRestore();
  });
});

describe('ProductOfferController.list', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {} } as Request;
    const res = mockRes();

    await productOffersController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('queries with an empty filter (every offer) for ADMIN', async () => {
    mockFind.mockResolvedValue([{ _id: '1' }, { _id: '2' }]);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
    } as Request;
    const res = mockRes();

    await productOffersController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({});
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ total: 2 })
    );
  });

  it('scopes the query to user_ref for a SUPPLIER (never sees other offers)', async () => {
    mockFind.mockResolvedValue([{ _id: '1' }]);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
    } as Request;
    const res = mockRes();

    await productOffersController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({ user_ref: 'supplier-1' });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('ProductOfferController.getById', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await productOffersController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns 404 when the offer does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: 'missing' },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when a SUPPLIER requests an offer they didn't create", async () => {
    mockFindById.mockResolvedValue({
      user_ref: { toString: () => 'someone-else' },
    });
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns the offer for the supplier who created it', async () => {
    mockFindById.mockResolvedValue({
      user_ref: { toString: () => 'supplier-1' },
    });
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets ADMIN fetch any offer regardless of who created it', async () => {
    mockFindById.mockResolvedValue({
      user_ref: { toString: () => 'someone-else' },
    });
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('ProductOfferController.update', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await productOffersController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns 404 when the offer does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: 'missing' },
      body: { price: 5 },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when a SUPPLIER updates an offer they didn't create", async () => {
    const doc = {
      user_ref: { toString: () => 'someone-else' },
      save: jest.fn(),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: '1' },
      body: { price: 5 },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('lets the owning SUPPLIER update wholeQuantity/price', async () => {
    const doc: any = {
      user_ref: { toString: () => 'supplier-1' },
      wholeQuantity: 10,
      price: 20,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: '1' },
      body: { wholeQuantity: 50, price: 7 },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.update(req, res);

    expect(doc.wholeQuantity).toBe(50);
    expect(doc.price).toBe(7);
    expect(doc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets the owning SUPPLIER update the product details (name/description/brand/unit/images)', async () => {
    const doc: any = {
      user_ref: { toString: () => 'supplier-1' },
      name: 'old name',
      description: 'old description',
      brand: 'old brand',
      unit: 'PIECE',
      images: null,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: '1' },
      body: {
        name: 'new name',
        description: 'new description',
        brand: 'new brand',
        unit: 'CARTON',
        images: 'https://example.com/img.png',
      },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.update(req, res);

    expect(doc.name).toBe('new name');
    expect(doc.description).toBe('new description');
    expect(doc.brand).toBe('new brand');
    expect(doc.unit).toBe('CARTON');
    expect(doc.images).toBe('https://example.com/img.png');
    expect(doc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('silently ignores status/adminComment when the owning SUPPLIER sends them', async () => {
    const doc: any = {
      user_ref: { toString: () => 'supplier-1' },
      status: 'PENDING',
      adminComment: undefined,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: '1' },
      body: { status: 'APPROVED', adminComment: 'self-approved' },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.update(req, res);

    expect(doc.status).toBe('PENDING');
    expect(doc.adminComment).toBeUndefined();
    expect(doc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets ADMIN update status/adminComment on an offer it did not create', async () => {
    const doc: any = {
      user_ref: { toString: () => 'supplier-1' },
      status: 'PENDING',
      adminComment: undefined,
      rejectedAt: null,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: '1' },
      body: { status: 'APPROVED', adminComment: 'looks good' },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.update(req, res);

    expect(doc.status).toBe('APPROVED');
    expect(doc.adminComment).toBe('looks good');
    expect(doc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("silently ignores wholeQuantity/price when ADMIN sends them (can't touch commercial terms)", async () => {
    const doc: any = {
      user_ref: { toString: () => 'supplier-1' },
      wholeQuantity: 10,
      price: 20,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: '1' },
      body: { wholeQuantity: 999, price: 1 },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.update(req, res);

    expect(doc.wholeQuantity).toBe(10);
    expect(doc.price).toBe(20);
    expect(doc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('sets rejectedAt when ADMIN moves status to REJECTED (starts the 7-day TTL clock)', async () => {
    const doc: any = {
      user_ref: { toString: () => 'supplier-1' },
      status: 'PENDING',
      rejectedAt: null,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: '1' },
      body: { status: 'REJECTED', adminComment: 'too expensive' },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.update(req, res);

    expect(doc.status).toBe('REJECTED');
    expect(doc.rejectedAt).toBeInstanceOf(Date);
  });

  it('clears rejectedAt when ADMIN moves status away from REJECTED', async () => {
    const doc: any = {
      user_ref: { toString: () => 'supplier-1' },
      status: 'REJECTED',
      rejectedAt: new Date('2026-01-01'),
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: '1' },
      body: { status: 'NEGOTIATION' },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.update(req, res);

    expect(doc.status).toBe('NEGOTIATION');
    expect(doc.rejectedAt).toBeNull();
  });
});

describe('ProductOfferController.delete', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await productOffersController.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns 404 when the offer does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: 'missing' },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when a SUPPLIER deletes an offer they didn't create", async () => {
    mockFindById.mockResolvedValue({
      user_ref: { toString: () => 'someone-else' },
    });
    const superDelete = jest
      .spyOn(BaseController.prototype, 'delete')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(superDelete).not.toHaveBeenCalled();
    superDelete.mockRestore();
  });

  it('lets the owning SUPPLIER delete their own offer', async () => {
    mockFindById.mockResolvedValue({
      user_ref: { toString: () => 'supplier-1' },
    });
    const superDelete = jest
      .spyOn(BaseController.prototype, 'delete')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.delete(req, res);

    expect(superDelete).toHaveBeenCalledWith(req, res);
    superDelete.mockRestore();
  });

  it('lets ADMIN delete any offer regardless of who created it', async () => {
    mockFindById.mockResolvedValue({
      user_ref: { toString: () => 'someone-else' },
    });
    const superDelete = jest
      .spyOn(BaseController.prototype, 'delete')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await productOffersController.delete(req, res);

    expect(superDelete).toHaveBeenCalledWith(req, res);
    superDelete.mockRestore();
  });
});
