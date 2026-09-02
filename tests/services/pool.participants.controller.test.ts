import { Request, Response } from 'express';

const mockParticipantSave = jest.fn();

jest.mock('../../src/services/pool.participants/pool.participant.model', () => {
  const actual = jest.requireActual(
    '../../src/services/pool.participants/pool.participant.model'
  );
  const MockModel: any = jest.fn().mockImplementation(function (
    this: any,
    data: any
  ) {
    Object.assign(this, data);
    this.save = mockParticipantSave;
  });
  MockModel.modelName = 'PoolParticipant';
  MockModel.find = jest.fn();
  MockModel.findById = jest.fn();
  return {
    __esModule: true,
    default: MockModel,
    couldBeUpdated: actual.couldBeUpdated,
  };
});

jest.mock('../../src/services/pools/pool.model', () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  },
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
const mockPoolFindOneAndUpdate =
  poolModel.findOneAndUpdate as unknown as jest.Mock;
const mockPoolUpdateOne = poolModel.updateOne as unknown as jest.Mock;
const mockUserFindById = userModel.findById as unknown as jest.Mock;

const DAY_MS = 24 * 60 * 60 * 1000;

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('PoolParticipantController.create', () => {
  // A pool that comfortably allows a join of 20 (leaves 30 remaining, which
  // is >= minimumContribution) unless a specific test overrides a field.
  function basePool(overrides: Record<string, unknown> = {}) {
    return {
      status: 'OPEN',
      currentQuantity: 50,
      minimumContribution: 15,
      ...overrides,
    };
  }

  function baseReq(body: Record<string, unknown> = {}) {
    return {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      body: {
        address_ref: 'addr-1',
        pool_ref: 'pool-1',
        payment_ref: 'payment-1',
        quantity: 20,
        ...body,
      },
    } as unknown as Request;
  }

  beforeEach(() => {
    mockUserFindById.mockResolvedValue({ addresses: ['addr-1'] });
  });

  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, body: {} } as Request;
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockUserFindById).not.toHaveBeenCalled();
  });

  it('returns 404 when the authenticated user cannot be found', async () => {
    mockUserFindById.mockResolvedValue(null);
    const req = baseReq();
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 400 when address_ref is not one of the caller's own addresses", async () => {
    mockUserFindById.mockResolvedValue({ addresses: ['addr-1'] });
    const req = baseReq({ address_ref: 'addr-2' });
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPoolFindById).not.toHaveBeenCalled();
  });

  it('overrides user_ref to the caller, ignoring any client-supplied value', async () => {
    mockPoolFindById.mockResolvedValue(basePool());
    mockPoolFindOneAndUpdate.mockResolvedValue(
      basePool({ currentQuantity: 30 })
    );
    mockParticipantSave.mockResolvedValue({ _id: 'p-1' });
    const req = baseReq({ user_ref: 'someone-else' });
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(mockUserFindById).toHaveBeenCalledWith('retailer-1');
    expect(req.body.user_ref).toBe('retailer-1');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 404 when the pool cannot be found', async () => {
    mockPoolFindById.mockResolvedValue(null);
    const req = baseReq();
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPoolFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 409 when the pool is not OPEN', async () => {
    mockPoolFindById.mockResolvedValue(basePool({ status: 'TARGET_REACHED' }));
    const req = baseReq();
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockPoolFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when quantity is below minimumContribution', async () => {
    mockPoolFindById.mockResolvedValue(basePool());
    const req = baseReq({ quantity: 14 });
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPoolFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when quantity exceeds the remaining currentQuantity', async () => {
    mockPoolFindById.mockResolvedValue(basePool());
    const req = baseReq({ quantity: 51 });
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPoolFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 400 when the leftover would be a nonzero remainder below minimumContribution', async () => {
    // currentQuantity 50, minimumContribution 15 -> taking 36..49 leaves 1..14
    mockPoolFindById.mockResolvedValue(basePool());
    const req = baseReq({ quantity: 40 });
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPoolFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('allows taking exactly minimumContribution (lower bound)', async () => {
    mockPoolFindById.mockResolvedValue(basePool());
    mockPoolFindOneAndUpdate.mockResolvedValue(
      basePool({ currentQuantity: 35 })
    );
    mockParticipantSave.mockResolvedValue({ _id: 'p-1' });
    const req = baseReq({ quantity: 15 });
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('allows taking the full remaining quantity, leaving exactly 0, and flips status to TARGET_REACHED', async () => {
    mockPoolFindById.mockResolvedValue(basePool());
    mockPoolFindOneAndUpdate.mockResolvedValue(
      basePool({ currentQuantity: 0, status: 'TARGET_REACHED' })
    );
    mockParticipantSave.mockResolvedValue({ _id: 'p-1' });
    const req = baseReq({ quantity: 50 });
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const [, pipeline] = mockPoolFindOneAndUpdate.mock.calls[0];
    const stage = pipeline[0].$set;
    expect(stage.status.$cond[1]).toBe('TARGET_REACHED');
  });

  it('does not flip status when the pool still has quantity remaining', async () => {
    mockPoolFindById.mockResolvedValue(basePool());
    mockPoolFindOneAndUpdate.mockResolvedValue(
      basePool({ currentQuantity: 30 })
    );
    mockParticipantSave.mockResolvedValue({ _id: 'p-1' });
    const req = baseReq({ quantity: 20 });
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const [, pipeline] = mockPoolFindOneAndUpdate.mock.calls[0];
    const stage = pipeline[0].$set;
    expect(stage.status.$cond[2]).toBe('$status');
  });

  it('returns 409 when the atomic pool update loses a concurrency race', async () => {
    mockPoolFindById.mockResolvedValue(basePool());
    mockPoolFindOneAndUpdate.mockResolvedValue(null);
    const req = baseReq({ quantity: 20 });
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockParticipantSave).not.toHaveBeenCalled();
  });

  it('rolls back the pool reservation when saving the participant fails', async () => {
    mockPoolFindById.mockResolvedValue(basePool());
    mockPoolFindOneAndUpdate.mockResolvedValue(
      basePool({ currentQuantity: 30 })
    );
    mockParticipantSave.mockRejectedValue(new Error('boom'));
    const req = baseReq({ quantity: 20 });
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(mockPoolUpdateOne).toHaveBeenCalledWith(
      { _id: 'pool-1' },
      { $inc: { currentQuantity: 20 } }
    );
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('rolls back both the reservation and the TARGET_REACHED flip when saving fails on a pool-emptying join', async () => {
    mockPoolFindById.mockResolvedValue(basePool());
    mockPoolFindOneAndUpdate.mockResolvedValue(
      basePool({ currentQuantity: 0, status: 'TARGET_REACHED' })
    );
    mockParticipantSave.mockRejectedValue(new Error('boom'));
    const req = baseReq({ quantity: 50 });
    const res = mockRes();

    await poolParticipantController.create(req, res);

    expect(mockPoolUpdateOne).toHaveBeenCalledWith(
      { _id: 'pool-1' },
      { $inc: { currentQuantity: 50 }, $set: { status: 'OPEN' } }
    );
    expect(res.status).toHaveBeenCalledWith(500);
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
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
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
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      query: { pool_ref: 'pool-1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({ pool_ref: 'pool-1' });
  });

  it('scopes a RETAILER to their own participations', async () => {
    mockFind.mockResolvedValue([{ _id: '1' }]);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      query: {},
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({ user_ref: 'retailer-1' });
  });

  it('combines the RETAILER scope with a pool_ref filter', async () => {
    mockFind.mockResolvedValue([]);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
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
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: 'missing' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when a retailer requests someone else's participant", async () => {
    mockFindById.mockResolvedValue({ user_ref: 'someone-else' });
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns the participant for the retailer who owns it', async () => {
    mockFindById.mockResolvedValue({ user_ref: 'retailer-1' });
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets ADMIN fetch any participant regardless of owner', async () => {
    mockFindById.mockResolvedValue({ user_ref: 'someone-else' });
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
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
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
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
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
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
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
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
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
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
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
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
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
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
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
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
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
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
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
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
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
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
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
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
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
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
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await poolParticipantController.delete(req, res);

    expect(superDelete).toHaveBeenCalledWith(req, res);
    superDelete.mockRestore();
  });
});
