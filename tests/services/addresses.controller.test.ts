import { Request, Response } from 'express';

const mockSave = jest.fn();

jest.mock('../../src/services/addresses/address.model', () => {
  const actual = jest.requireActual(
    '../../src/services/addresses/address.model'
  );
  const MockAddressModel: any = jest.fn().mockImplementation(function (
    this: any,
    data: any
  ) {
    Object.assign(this, data);
    this.save = mockSave;
  });
  MockAddressModel.modelName = 'Address';
  MockAddressModel.find = jest.fn();
  MockAddressModel.findById = jest.fn();
  return {
    __esModule: true,
    default: MockAddressModel,
    couldBeUpdated: actual.couldBeUpdated,
  };
});

jest.mock('../../src/services/users/user.model', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    updateMany: jest.fn(),
  },
}));

import BaseController from '../../src/services/base/base.controller';
import addressesController from '../../src/services/addresses/addresses.controller';
import addressModel from '../../src/services/addresses/address.model';
import userModel from '../../src/services/users/user.model';

const mockFind = addressModel.find as unknown as jest.Mock;
const mockFindById = addressModel.findById as unknown as jest.Mock;
const mockUserFindById = userModel.findById as unknown as jest.Mock;
const mockUserFindByIdAndUpdate =
  userModel.findByIdAndUpdate as unknown as jest.Mock;
const mockUserUpdateMany = userModel.updateMany as unknown as jest.Mock;

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('AddressController.create', () => {
  it('creates the address for an anonymous caller (pre-registration bootstrap) without linking it to any user', async () => {
    mockSave.mockResolvedValue({
      _id: 'addr-1',
      location: 'l',
      region: 'r',
      city: 'c',
    });
    const req = {
      meta: { user: undefined },
      body: { location: 'l', region: 'r', city: 'c' },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.create(req, res);

    expect(mockSave).toHaveBeenCalled();
    expect(mockUserFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('links the new address onto the caller for an authenticated RETAILER, ignoring any client-supplied user_ref', async () => {
    mockSave.mockResolvedValue({
      _id: 'addr-1',
      location: 'l',
      region: 'r',
      city: 'c',
    });
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      body: {
        location: 'l',
        region: 'r',
        city: 'c',
        user_ref: 'someone-else',
      },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.create(req, res);

    expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith('retailer-1', {
      $addToSet: { addresses: 'addr-1' },
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('links the new address onto the caller for an authenticated SUPPLIER', async () => {
    mockSave.mockResolvedValue({ _id: 'addr-2' });
    const req = {
      meta: { user: { userId: 'supplier-1', role: 'SUPPLIER' } },
      body: { location: 'l', region: 'r', city: 'c' },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.create(req, res);

    expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith('supplier-1', {
      $addToSet: { addresses: 'addr-2' },
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 400 when an ADMIN creates an address without a user_ref', async () => {
    const req = {
      meta: { user: { userId: 'admin-1', role: 'ADMIN' } },
      body: { location: 'l', region: 'r', city: 'c' },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('returns 404 when an ADMIN targets a user_ref that does not exist', async () => {
    mockUserFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'admin-1', role: 'ADMIN' } },
      body: { location: 'l', region: 'r', city: 'c', user_ref: 'ghost' },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.create(req, res);

    expect(mockUserFindById).toHaveBeenCalledWith('ghost');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('creates the address for ADMIN and links it onto the given user_ref', async () => {
    mockUserFindById.mockResolvedValue({ _id: 'target-1' });
    mockSave.mockResolvedValue({ _id: 'addr-3' });
    const req = {
      meta: { user: { userId: 'admin-1', role: 'ADMIN' } },
      body: { location: 'l', region: 'r', city: 'c', user_ref: 'target-1' },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.create(req, res);

    expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith('target-1', {
      $addToSet: { addresses: 'addr-3' },
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('AddressController.list', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {} } as Request;
    const res = mockRes();

    await addressesController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('returns every address for ADMIN, with no ownership filter', async () => {
    mockFind.mockResolvedValue([{ _id: '1' }, { _id: '2' }]);
    const req = {
      meta: { user: { userId: 'admin-1', role: 'ADMIN' } },
    } as Request;
    const res = mockRes();

    await addressesController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith();
    expect(mockUserFindById).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("scopes a RETAILER to their own account's addresses", async () => {
    mockUserFindById.mockResolvedValue({ addresses: ['addr-1', 'addr-2'] });
    mockFind.mockResolvedValue([{ _id: 'addr-1' }]);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
    } as Request;
    const res = mockRes();

    await addressesController.list(req, res);

    expect(mockUserFindById).toHaveBeenCalledWith('retailer-1');
    expect(mockFind).toHaveBeenCalledWith({
      _id: { $in: ['addr-1', 'addr-2'] },
    });
  });

  it("also scopes a SUPPLIER to their own account's addresses", async () => {
    mockUserFindById.mockResolvedValue({ addresses: ['addr-9'] });
    mockFind.mockResolvedValue([]);
    const req = {
      meta: { user: { userId: 'supplier-1', role: 'SUPPLIER' } },
    } as Request;
    const res = mockRes();

    await addressesController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({ _id: { $in: ['addr-9'] } });
  });
});

describe('AddressController.getById', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await addressesController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns 404 when the address does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: 'missing' },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when a non-admin requests an address they don't own", async () => {
    mockFindById.mockResolvedValue({ _id: { toString: () => 'addr-1' } });
    mockUserFindById.mockResolvedValue({ addresses: ['addr-2'] });
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: 'addr-1' },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns the address for the account that owns it', async () => {
    mockFindById.mockResolvedValue({ _id: { toString: () => 'addr-1' } });
    mockUserFindById.mockResolvedValue({ addresses: ['addr-1'] });
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: 'addr-1' },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets ADMIN fetch any address regardless of ownership', async () => {
    mockFindById.mockResolvedValue({ _id: { toString: () => 'addr-1' } });
    const req = {
      meta: { user: { userId: 'admin-1', role: 'ADMIN' } },
      params: { _id: 'addr-1' },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.getById(req, res);

    expect(mockUserFindById).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('AddressController.update', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await addressesController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns 404 when the address does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: 'missing' },
      body: { city: 'new city' },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when a non-admin updates an address they don't own", async () => {
    mockFindById.mockResolvedValue({ _id: { toString: () => 'addr-1' } });
    mockUserFindById.mockResolvedValue({ addresses: ['addr-2'] });
    const superUpdate = jest
      .spyOn(BaseController.prototype, 'update')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: 'addr-1' },
      body: { city: 'new city' },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(superUpdate).not.toHaveBeenCalled();
    superUpdate.mockRestore();
  });

  it('updates the address for the account that owns it', async () => {
    mockFindById.mockResolvedValue({ _id: { toString: () => 'addr-1' } });
    mockUserFindById.mockResolvedValue({ addresses: ['addr-1'] });
    const superUpdate = jest
      .spyOn(BaseController.prototype, 'update')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: 'addr-1' },
      body: { city: 'new city' },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.update(req, res);

    expect(superUpdate).toHaveBeenCalledWith(req, res);
    superUpdate.mockRestore();
  });

  it('lets ADMIN update any address regardless of ownership', async () => {
    mockFindById.mockResolvedValue({ _id: { toString: () => 'addr-1' } });
    const superUpdate = jest
      .spyOn(BaseController.prototype, 'update')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'admin-1', role: 'ADMIN' } },
      params: { _id: 'addr-1' },
      body: { city: 'new city' },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.update(req, res);

    expect(mockUserFindById).not.toHaveBeenCalled();
    expect(superUpdate).toHaveBeenCalledWith(req, res);
    superUpdate.mockRestore();
  });
});

describe('AddressController.delete', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await addressesController.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns 404 when the address does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: 'missing' },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when a non-admin deletes an address they don't own", async () => {
    mockFindById.mockResolvedValue({ _id: { toString: () => 'addr-1' } });
    mockUserFindById.mockResolvedValue({ addresses: ['addr-2'] });
    const superDelete = jest
      .spyOn(BaseController.prototype, 'delete')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: 'addr-1' },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockUserUpdateMany).not.toHaveBeenCalled();
    expect(superDelete).not.toHaveBeenCalled();
    superDelete.mockRestore();
  });

  it('deletes the address for the account that owns it and pulls the ref off every user', async () => {
    mockFindById.mockResolvedValue({ _id: { toString: () => 'addr-1' } });
    mockUserFindById.mockResolvedValue({ addresses: ['addr-1'] });
    const superDelete = jest
      .spyOn(BaseController.prototype, 'delete')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: 'addr-1' },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.delete(req, res);

    expect(mockUserUpdateMany).toHaveBeenCalledWith(
      {
        addresses: expect.objectContaining({ toString: expect.any(Function) }),
      },
      { $pull: { addresses: expect.anything() } }
    );
    expect(superDelete).toHaveBeenCalledWith(req, res);
    superDelete.mockRestore();
  });

  it('lets ADMIN delete any address regardless of ownership', async () => {
    mockFindById.mockResolvedValue({ _id: { toString: () => 'addr-1' } });
    const superDelete = jest
      .spyOn(BaseController.prototype, 'delete')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'admin-1', role: 'ADMIN' } },
      params: { _id: 'addr-1' },
    } as unknown as Request;
    const res = mockRes();

    await addressesController.delete(req, res);

    expect(mockUserFindById).not.toHaveBeenCalled();
    expect(mockUserUpdateMany).toHaveBeenCalled();
    expect(superDelete).toHaveBeenCalledWith(req, res);
    superDelete.mockRestore();
  });
});
