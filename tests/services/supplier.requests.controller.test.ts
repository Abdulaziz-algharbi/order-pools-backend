import { Request, Response } from 'express';

const mockSave = jest.fn();

jest.mock('../../src/services/supplier.requests/supplier.request.model', () => {
  const actual = jest.requireActual(
    '../../src/services/supplier.requests/supplier.request.model'
  );
  const MockModel: any = jest.fn().mockImplementation(function (
    this: any,
    data: any
  ) {
    Object.assign(this, data);
    this.save = mockSave;
  });
  MockModel.modelName = 'SupplierRequest';
  MockModel.find = jest.fn();
  MockModel.findById = jest.fn();
  MockModel.findOne = jest.fn();
  return {
    __esModule: true,
    default: MockModel,
    couldBeUpdated: actual.couldBeUpdated,
  };
});

jest.mock('../../src/services/users/user.model', () => ({
  __esModule: true,
  default: { findByIdAndUpdate: jest.fn() },
}));

import BaseController from '../../src/services/base/base.controller';
import supplierRequestController from '../../src/services/supplier.requests/supplier.requests.controller';
import supplierRequestModel from '../../src/services/supplier.requests/supplier.request.model';
import userModel from '../../src/services/users/user.model';

const mockFind = supplierRequestModel.find as unknown as jest.Mock;
const mockFindById = supplierRequestModel.findById as unknown as jest.Mock;
const mockFindOne = supplierRequestModel.findOne as unknown as jest.Mock;
const mockUserFindByIdAndUpdate =
  userModel.findByIdAndUpdate as unknown as jest.Mock;

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('SupplierRequestController.create', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, body: { description: 'd' } } as Request;
    const res = mockRes();

    await supplierRequestController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('returns 409 when the caller is already a SUPPLIER', async () => {
    const req = {
      meta: { user: { userId: 'u1', roles: ['RETAILER', 'SUPPLIER'] } },
      body: { description: 'd' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRequestController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockFindOne).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('returns 409 when a PENDING request already exists for the caller', async () => {
    mockFindOne.mockResolvedValue({ _id: 'existing' });
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      body: { description: 'I want to sell wholesale rice' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRequestController.create(req, res);

    expect(mockFindOne).toHaveBeenCalledWith({
      user_ref: 'retailer-1',
      status: 'PENDING',
    });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('creates a PENDING request under the caller', async () => {
    mockFindOne.mockResolvedValue(null);
    mockSave.mockResolvedValue({ _id: 'req-1' });
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      body: { description: 'I want to sell wholesale rice', user_ref: 'x' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRequestController.create(req, res);

    expect(supplierRequestModel).toHaveBeenCalledWith({
      user_ref: 'retailer-1',
      description: 'I want to sell wholesale rice',
    });
    expect(mockSave).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('SupplierRequestController.list', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {} } as Request;
    const res = mockRes();

    await supplierRequestController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('queries with an empty filter (every request) for ADMIN', async () => {
    mockFind.mockResolvedValue([{ _id: '1' }, { _id: '2' }]);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
    } as Request;
    const res = mockRes();

    await supplierRequestController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({});
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('scopes the query to user_ref for a RETAILER (never sees others’ requests)', async () => {
    mockFind.mockResolvedValue([{ _id: '1' }]);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
    } as Request;
    const res = mockRes();

    await supplierRequestController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({ user_ref: 'retailer-1' });
  });
});

describe('SupplierRequestController.getById', () => {
  it('returns 404 when the request does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: 'missing' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRequestController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when a RETAILER requests one they didn't file", async () => {
    mockFindById.mockResolvedValue({
      user_ref: { toString: () => 'someone-else' },
    });
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRequestController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('lets ADMIN fetch any request regardless of who filed it', async () => {
    mockFindById.mockResolvedValue({
      user_ref: { toString: () => 'someone-else' },
    });
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRequestController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('SupplierRequestController.update', () => {
  it('returns 404 when the request does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: 'missing' },
      body: { description: 'x' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRequestController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when a RETAILER updates a request they didn't file", async () => {
    const doc = {
      user_ref: { toString: () => 'someone-else' },
      save: jest.fn(),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
      body: { description: 'x' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRequestController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('lets the owning RETAILER edit description while PENDING', async () => {
    const doc: any = {
      user_ref: { toString: () => 'retailer-1' },
      status: 'PENDING',
      description: 'old',
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
      body: { description: 'new description' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRequestController.update(req, res);

    expect(doc.description).toBe('new description');
    expect(doc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 409 when the owning RETAILER edits a non-PENDING request', async () => {
    const doc: any = {
      user_ref: { toString: () => 'retailer-1' },
      status: 'REJECTED',
      description: 'old',
      save: jest.fn(),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
      body: { description: 'new description' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRequestController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('silently ignores status/adminComment when the owning RETAILER sends them', async () => {
    const doc: any = {
      user_ref: { toString: () => 'retailer-1' },
      status: 'PENDING',
      adminComment: undefined,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
      body: { status: 'APPROVED', adminComment: 'self-approved' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRequestController.update(req, res);

    expect(doc.status).toBe('PENDING');
    expect(doc.adminComment).toBeUndefined();
    expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(doc.save).toHaveBeenCalled();
  });

  it('returns 409 when ADMIN reviews an already-reviewed request', async () => {
    const doc: any = {
      user_ref: { toString: () => 'retailer-1' },
      status: 'APPROVED',
      save: jest.fn(),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: '1' },
      body: { status: 'REJECTED' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRequestController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('lets ADMIN reject a PENDING request without touching roles', async () => {
    const doc: any = {
      user_ref: { toString: () => 'retailer-1' },
      status: 'PENDING',
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: '1' },
      body: { status: 'REJECTED', adminComment: 'incomplete' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRequestController.update(req, res);

    expect(doc.status).toBe('REJECTED');
    expect(doc.adminComment).toBe('incomplete');
    expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(doc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets ADMIN approve a PENDING request, adding SUPPLIER onto the roles without removing RETAILER', async () => {
    const doc: any = {
      user_ref: { toString: () => 'retailer-1' },
      status: 'PENDING',
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: '1' },
      body: { status: 'APPROVED' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRequestController.update(req, res);

    expect(doc.status).toBe('APPROVED');
    expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith(doc.user_ref, {
      $addToSet: { roles: 'SUPPLIER' },
    });
    expect(doc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('SupplierRequestController.delete', () => {
  it('returns 404 when the request does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: 'missing' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRequestController.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when a RETAILER deletes a request they didn't file", async () => {
    mockFindById.mockResolvedValue({
      user_ref: { toString: () => 'someone-else' },
    });
    const superDelete = jest
      .spyOn(BaseController.prototype, 'delete')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRequestController.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(superDelete).not.toHaveBeenCalled();
    superDelete.mockRestore();
  });

  it('lets the owning RETAILER delete their own request', async () => {
    mockFindById.mockResolvedValue({
      user_ref: { toString: () => 'retailer-1' },
    });
    const superDelete = jest
      .spyOn(BaseController.prototype, 'delete')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRequestController.delete(req, res);

    expect(superDelete).toHaveBeenCalledWith(req, res);
    superDelete.mockRestore();
  });

  it('lets ADMIN delete any request regardless of who filed it', async () => {
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

    await supplierRequestController.delete(req, res);

    expect(superDelete).toHaveBeenCalledWith(req, res);
    superDelete.mockRestore();
  });
});
