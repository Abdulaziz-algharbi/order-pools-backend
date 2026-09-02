import { Request, Response } from 'express';

jest.mock(
  '../../src/services/supplier.remove.requests/supplier.remove.request.model',
  () => {
    const actual = jest.requireActual(
      '../../src/services/supplier.remove.requests/supplier.remove.request.model'
    );
    return {
      __esModule: true,
      default: {
        modelName: 'SupplierRemoveRequest',
        find: jest.fn(),
        findById: jest.fn(),
      },
      couldBeUpdated: actual.couldBeUpdated,
    };
  }
);

jest.mock('../../src/services/users/user.model', () => ({
  __esModule: true,
  default: { deleteOne: jest.fn() },
}));

jest.mock('../../src/services/auth/auth.model', () => ({
  __esModule: true,
  default: { deleteOne: jest.fn() },
}));

import BaseController from '../../src/services/base/base.controller';
import supplierRemoveRequestController from '../../src/services/supplier.remove.requests/supplier.remove.requests.controller';
import supplierRemoveRequestModel from '../../src/services/supplier.remove.requests/supplier.remove.request.model';
import userModel from '../../src/services/users/user.model';
import authModel from '../../src/services/auth/auth.model';

const mockFind = supplierRemoveRequestModel.find as unknown as jest.Mock;
const mockFindById =
  supplierRemoveRequestModel.findById as unknown as jest.Mock;
const mockUserDeleteOne = userModel.deleteOne as unknown as jest.Mock;
const mockAuthDeleteOne = authModel.deleteOne as unknown as jest.Mock;

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('SupplierRemoveRequestController.list', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {} } as Request;
    const res = mockRes();

    await supplierRemoveRequestController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('queries with an empty filter (every request) for ADMIN', async () => {
    mockFind.mockResolvedValue([{ _id: '1' }, { _id: '2' }]);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
    } as Request;
    const res = mockRes();

    await supplierRemoveRequestController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({});
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('scopes the query to user_ref for a non-ADMIN caller', async () => {
    mockFind.mockResolvedValue([{ _id: '1' }]);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['RETAILER', 'SUPPLIER'] } },
    } as Request;
    const res = mockRes();

    await supplierRemoveRequestController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({ user_ref: 'supplier-1' });
  });
});

describe('SupplierRemoveRequestController.getById', () => {
  it('returns 404 when the request does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: 'missing' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRemoveRequestController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when a non-owner, non-ADMIN caller fetches someone else's request", async () => {
    mockFindById.mockResolvedValue({
      user_ref: { toString: () => 'someone-else' },
    });
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRemoveRequestController.getById(req, res);

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

    await supplierRemoveRequestController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('SupplierRemoveRequestController.update', () => {
  it('returns 404 when the request does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: 'missing' },
      body: { status: 'APPROVED' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRemoveRequestController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 409 when reviewing an already-reviewed request', async () => {
    const doc: any = {
      user_ref: { toString: () => 'supplier-1' },
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

    await supplierRemoveRequestController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('lets ADMIN reject a PENDING request without deleting the account', async () => {
    const doc: any = {
      user_ref: { toString: () => 'supplier-1' },
      status: 'PENDING',
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: '1' },
      body: { status: 'REJECTED', adminComment: 'not eligible' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRemoveRequestController.update(req, res);

    expect(doc.status).toBe('REJECTED');
    expect(mockUserDeleteOne).not.toHaveBeenCalled();
    expect(mockAuthDeleteOne).not.toHaveBeenCalled();
    expect(doc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets ADMIN approve a PENDING request, deleting the user and auth record', async () => {
    const doc: any = {
      user_ref: { toString: () => 'supplier-1' },
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

    await supplierRemoveRequestController.update(req, res);

    expect(doc.status).toBe('APPROVED');
    expect(mockUserDeleteOne).toHaveBeenCalledWith({ _id: doc.user_ref });
    expect(mockAuthDeleteOne).toHaveBeenCalledWith({ userId: doc.user_ref });
    expect(doc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('SupplierRemoveRequestController.delete', () => {
  it('returns 404 when the request does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: 'missing' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRemoveRequestController.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when a non-owner, non-ADMIN caller deletes someone else's request", async () => {
    mockFindById.mockResolvedValue({
      user_ref: { toString: () => 'someone-else' },
      status: 'PENDING',
    });
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRemoveRequestController.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 409 when the owner tries to withdraw a non-PENDING request', async () => {
    mockFindById.mockResolvedValue({
      user_ref: { toString: () => 'supplier-1' },
      status: 'APPROVED',
    });
    const superDelete = jest
      .spyOn(BaseController.prototype, 'delete')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRemoveRequestController.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(superDelete).not.toHaveBeenCalled();
    superDelete.mockRestore();
  });

  it('lets the owner withdraw their own PENDING request', async () => {
    mockFindById.mockResolvedValue({
      user_ref: { toString: () => 'supplier-1' },
      status: 'PENDING',
    });
    const superDelete = jest
      .spyOn(BaseController.prototype, 'delete')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRemoveRequestController.delete(req, res);

    expect(superDelete).toHaveBeenCalledWith(req, res);
    superDelete.mockRestore();
  });

  it('lets ADMIN delete any request regardless of status', async () => {
    mockFindById.mockResolvedValue({
      user_ref: { toString: () => 'someone-else' },
      status: 'APPROVED',
    });
    const superDelete = jest
      .spyOn(BaseController.prototype, 'delete')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await supplierRemoveRequestController.delete(req, res);

    expect(superDelete).toHaveBeenCalledWith(req, res);
    superDelete.mockRestore();
  });
});
