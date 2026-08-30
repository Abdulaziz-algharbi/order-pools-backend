import { Request, Response } from 'express';

jest.mock('../../src/services/pool.participants/pool.participant.model', () => {
  const actual = jest.requireActual(
    '../../src/services/pool.participants/pool.participant.model'
  );
  return {
    __esModule: true,
    default: {
      modelName: 'PoolParticipant',
      find: jest.fn(),
      findById: jest.fn(),
    },
    couldBeUpdated: actual.couldBeUpdated,
  };
});

jest.mock('../../src/services/pools/pool.model', () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}));

jest.mock('../../src/services/users/user.model', () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}));

import BaseController from '../../src/services/base/base.controller';
import poolParticipantController from '../../src/services/pool.participants/pool.participants.controller';
import poolParticipantModel from '../../src/services/pool.participants/pool.participant.model';
import poolModel from '../../src/services/pools/pool.model';
import userModel from '../../src/services/users/user.model';

const mockFind = poolParticipantModel.find as unknown as jest.Mock;
const mockFindById = poolParticipantModel.findById as unknown as jest.Mock;
const mockPoolFindById = poolModel.findById as unknown as jest.Mock;
const mockUserFindById = userModel.findById as unknown as jest.Mock;

const DAY_MS = 24 * 60 * 60 * 1000;

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('PoolParticipantController.create', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, body: {} } as Request;
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockUserFindById).not.toHaveBeenCalled();
  });

  it('overrides user_ref to the caller, ignoring any client-supplied value', async () => {
    mockUserFindById.mockResolvedValue({ addresses: ['addr-1'] });
    const superCreate = jest
      .spyOn(BaseController.prototype, 'create')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      body: { user_ref: 'someone-else', address_ref: 'addr-1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(mockUserFindById).toHaveBeenCalledWith('retailer-1');
    expect(req.body.user_ref).toBe('retailer-1');
    expect(superCreate).toHaveBeenCalledWith(req, res);
    superCreate.mockRestore();
  });

  it('returns 404 when the authenticated user cannot be found', async () => {
    mockUserFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      body: { address_ref: 'addr-1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 400 when address_ref is not one of the caller's own addresses", async () => {
    mockUserFindById.mockResolvedValue({ addresses: ['addr-1'] });
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      body: { address_ref: 'addr-2' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('PoolParticipantController.list', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {} } as Request;
    const res = mockRes();

    await poolParticipantController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('queries with an empty filter for ADMIN', async () => {
    mockFind.mockResolvedValue([{ _id: '1' }, { _id: '2' }]);
    const req = {
      meta: { user: { userId: 'admin-1', role: 'ADMIN' } },
      query: {},
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({});
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets ADMIN narrow to a single pool via ?pool_ref=', async () => {
    mockFind.mockResolvedValue([]);
    const req = {
      meta: { user: { userId: 'admin-1', role: 'ADMIN' } },
      query: { pool_ref: 'pool-1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({ pool_ref: 'pool-1' });
  });

  it('scopes a RETAILER to their own participations', async () => {
    mockFind.mockResolvedValue([{ _id: '1' }]);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      query: {},
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({ user_ref: 'retailer-1' });
  });

  it('combines the RETAILER scope with a pool_ref filter', async () => {
    mockFind.mockResolvedValue([]);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      query: { pool_ref: 'pool-1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({
      user_ref: 'retailer-1',
      pool_ref: 'pool-1',
    });
  });
});

describe('PoolParticipantController.getById', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns 404 when the participant does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: 'missing' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when a retailer requests someone else's participant", async () => {
    mockFindById.mockResolvedValue({ user_ref: 'someone-else' });
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns the participant for the retailer who owns it', async () => {
    mockFindById.mockResolvedValue({ user_ref: 'retailer-1' });
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets ADMIN fetch any participant regardless of owner', async () => {
    mockFindById.mockResolvedValue({ user_ref: 'someone-else' });
    const req = {
      meta: { user: { userId: 'admin-1', role: 'ADMIN' } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('PoolParticipantController.update', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns 404 when the participant does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: 'missing' },
      body: { quantity: 5 },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when a retailer tries to update someone else's participant", async () => {
    mockFindById.mockResolvedValue({
      user_ref: 'someone-else',
      pool_ref: 'pool-1',
    });
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
      body: { quantity: 5 },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPoolFindById).not.toHaveBeenCalled();
  });

  it('returns 404 when the pool cannot be found', async () => {
    mockFindById.mockResolvedValue({
      user_ref: 'retailer-1',
      pool_ref: 'pool-1',
    });
    mockPoolFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
      body: { quantity: 5 },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 409 when the pool is no longer OPEN', async () => {
    mockFindById.mockResolvedValue({
      user_ref: 'retailer-1',
      pool_ref: 'pool-1',
    });
    mockPoolFindById.mockResolvedValue({ status: 'TARGET_REACHED' });
    const superUpdate = jest
      .spyOn(BaseController.prototype, 'update')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
      body: { quantity: 5 },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(superUpdate).not.toHaveBeenCalled();
    superUpdate.mockRestore();
  });

  it('updates when the caller owns the participant and the pool is OPEN', async () => {
    mockFindById.mockResolvedValue({
      user_ref: 'retailer-1',
      pool_ref: 'pool-1',
    });
    mockPoolFindById.mockResolvedValue({ status: 'OPEN' });
    const superUpdate = jest
      .spyOn(BaseController.prototype, 'update')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
      body: { quantity: 5 },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.update(req, res);

    expect(superUpdate).toHaveBeenCalledWith(req, res);
    superUpdate.mockRestore();
  });
});

describe('PoolParticipantController.delete', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns 404 when the participant does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: 'missing' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when a retailer tries to delete someone else's participant", async () => {
    mockFindById.mockResolvedValue({
      user_ref: 'someone-else',
      pool_ref: 'pool-1',
    });
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPoolFindById).not.toHaveBeenCalled();
  });

  it('returns 404 when the pool cannot be found', async () => {
    mockFindById.mockResolvedValue({
      user_ref: 'retailer-1',
      pool_ref: 'pool-1',
    });
    mockPoolFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('allows deletion while the pool is OPEN', async () => {
    mockFindById.mockResolvedValue({
      user_ref: 'retailer-1',
      pool_ref: 'pool-1',
    });
    mockPoolFindById.mockResolvedValue({ status: 'OPEN' });
    const superDelete = jest
      .spyOn(BaseController.prototype, 'delete')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.delete(req, res);

    expect(superDelete).toHaveBeenCalledWith(req, res);
    superDelete.mockRestore();
  });

  it('allows deletion once the pool is COMPLETED', async () => {
    mockFindById.mockResolvedValue({
      user_ref: 'retailer-1',
      pool_ref: 'pool-1',
    });
    mockPoolFindById.mockResolvedValue({ status: 'COMPLETED' });
    const superDelete = jest
      .spyOn(BaseController.prototype, 'delete')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.delete(req, res);

    expect(superDelete).toHaveBeenCalledWith(req, res);
    superDelete.mockRestore();
  });

  it('blocks deletion for a pool still TARGET_REACHED / DISTRIBUTING', async () => {
    mockFindById.mockResolvedValue({
      user_ref: 'retailer-1',
      pool_ref: 'pool-1',
    });
    mockPoolFindById.mockResolvedValue({ status: 'DISTRIBUTING' });
    const superDelete = jest
      .spyOn(BaseController.prototype, 'delete')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(superDelete).not.toHaveBeenCalled();
    superDelete.mockRestore();
  });

  it('blocks deletion for a CANCELLED pool inside the 7-day grace window', async () => {
    mockFindById.mockResolvedValue({
      user_ref: 'retailer-1',
      pool_ref: 'pool-1',
    });
    mockPoolFindById.mockResolvedValue({
      status: 'CANCELLED',
      updatedAt: new Date(Date.now() - 3 * DAY_MS),
    });
    const superDelete = jest
      .spyOn(BaseController.prototype, 'delete')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(superDelete).not.toHaveBeenCalled();
    superDelete.mockRestore();
  });

  it('allows deletion for a CANCELLED pool once 7 days have passed', async () => {
    mockFindById.mockResolvedValue({
      user_ref: 'retailer-1',
      pool_ref: 'pool-1',
    });
    mockPoolFindById.mockResolvedValue({
      status: 'CANCELLED',
      updatedAt: new Date(Date.now() - 8 * DAY_MS),
    });
    const superDelete = jest
      .spyOn(BaseController.prototype, 'delete')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.delete(req, res);

    expect(superDelete).toHaveBeenCalledWith(req, res);
    superDelete.mockRestore();
  });
});
