import { Request, Response } from 'express';
import bcrypt from 'bcrypt';

const mockAuthSave = jest.fn();

jest.mock('../../src/services/auth/auth.model', () => {
  const MockAuthModel: any = jest.fn().mockImplementation(function (
    this: any,
    data: any
  ) {
    Object.assign(this, data);
    this.save = mockAuthSave;
  });
  MockAuthModel.modelName = 'Auth';
  MockAuthModel.findOneAndUpdate = jest.fn();
  MockAuthModel.findOne = jest.fn();
  MockAuthModel.updateOne = jest.fn();
  MockAuthModel.deleteOne = jest.fn();
  return { __esModule: true, default: MockAuthModel };
});

const mockSupplierRemoveRequestSave = jest.fn();

jest.mock(
  '../../src/services/supplier.remove.requests/supplier.remove.request.model',
  () => {
    const MockModel: any = jest.fn().mockImplementation(function (
      this: any,
      data: any
    ) {
      Object.assign(this, data);
      this.save = mockSupplierRemoveRequestSave;
    });
    MockModel.modelName = 'SupplierRemoveRequest';
    MockModel.findOne = jest.fn();
    return { __esModule: true, default: MockModel };
  }
);

const mockUserSave = jest.fn();

jest.mock('../../src/services/users/user.model', () => {
  const MockUserModel: any = jest.fn().mockImplementation(function (
    this: any,
    data: any
  ) {
    Object.assign(this, data);
    this.save = mockUserSave;
  });
  MockUserModel.modelName = 'User';
  MockUserModel.findOne = jest.fn();
  MockUserModel.findById = jest.fn();
  MockUserModel.deleteOne = jest.fn();
  return { __esModule: true, default: MockUserModel };
});

import authController from '../../src/services/auth/auth.controller';
import authModel from '../../src/services/auth/auth.model';
import supplierRemoveRequestModel from '../../src/services/supplier.remove.requests/supplier.remove.request.model';
import mockUserModel from '../../src/services/users/user.model';
import appBroker from '../../src/app.broker';
import jwtUtil from '../../src/utils/jwt.util';
import ERRORS from '../../src/constants/ERRORS';

const mockAuthFindOneAndUpdate =
  authModel.findOneAndUpdate as unknown as jest.Mock;
const mockAuthFindOne = authModel.findOne as unknown as jest.Mock;
const mockAuthUpdateOne = authModel.updateOne as unknown as jest.Mock;
const mockAuthDeleteOne = authModel.deleteOne as unknown as jest.Mock;
const mockSupplierRemoveRequestFindOne =
  supplierRemoveRequestModel.findOne as unknown as jest.Mock;
const mockUserFindOne = mockUserModel.findOne as unknown as jest.Mock;
const mockUserFindById = mockUserModel.findById as unknown as jest.Mock;
const mockUserDeleteOne = mockUserModel.deleteOne as unknown as jest.Mock;

// A minimal thenable mock for chained Mongoose queries (findById().select()).
function mockQuery(result: unknown) {
  const query: any = {
    select: jest.fn(),
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  return query;
}

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('AuthController.register', () => {
  it('returns 409 when the email is already registered', async () => {
    mockUserFindOne.mockResolvedValue({ _id: 'existing' });
    const req = {
      body: { email: 'a@b.com', firstName: 'A' },
    } as unknown as Request;
    const res = mockRes();

    await authController.register(req, res);

    expect(mockUserFindOne).toHaveBeenCalledWith({ email: 'a@b.com' });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.send).toHaveBeenCalledWith({ message: ERRORS.CONFLICT });
    expect(mockUserSave).not.toHaveBeenCalled();
  });

  it('creates the user and auth record, emits user:registered, and returns tokens', async () => {
    mockUserFindOne.mockResolvedValue(null);
    mockUserSave.mockResolvedValue({
      _id: 'user-1',
      email: 'a@b.com',
      firstName: 'Ann',
      roles: ['RETAILER'],
    });
    mockAuthSave.mockResolvedValue(undefined);
    const req = {
      body: { email: 'a@b.com', firstName: 'Ann', password: 'secret123' },
    } as unknown as Request;
    const res = mockRes();

    const emitted = jest.fn();
    const unsubscribe = appBroker.on('user:registered', emitted);

    await authController.register(req, res);

    unsubscribe();

    expect(mockUserModel).toHaveBeenCalledWith(req.body);
    expect(authModel).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' })
    );
    expect(mockAuthSave).toHaveBeenCalled();
    expect(emitted).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.com' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'User registered successfully',
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      })
    );
  });

  it('routes an unexpected failure through errorHandler instead of throwing', async () => {
    mockUserFindOne.mockRejectedValue(new Error('db is down'));
    const req = { body: { email: 'a@b.com' } } as unknown as Request;
    const res = mockRes();

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith({
      message: ERRORS.INTERNAL_SERVER_ERROR,
    });
  });
});

describe('AuthController.login', () => {
  it('returns 404 when no user matches the given email', async () => {
    mockUserFindOne.mockResolvedValue(null);
    const req = {
      body: { email: 'missing@b.com', password: 'x' },
    } as unknown as Request;
    const res = mockRes();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith({ message: ERRORS.USER_NOT_FOUND });
    expect(mockAuthFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('returns 401 when the password does not match', async () => {
    mockUserFindOne.mockResolvedValue({
      _id: 'user-1',
      password: bcrypt.hashSync('correct-password', 4),
      roles: ['RETAILER'],
    });
    const req = {
      body: { email: 'a@b.com', password: 'wrong-password' },
    } as unknown as Request;
    const res = mockRes();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith({
      message: ERRORS.INVALID_CREDENTIALS,
    });
    expect(mockAuthFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it('rotates the refresh token and returns tokens on a correct password', async () => {
    mockUserFindOne.mockResolvedValue({
      _id: 'user-1',
      password: bcrypt.hashSync('correct-password', 4),
      roles: ['RETAILER', 'SUPPLIER'],
    });
    mockAuthFindOneAndUpdate.mockResolvedValue({});
    const req = {
      body: { email: 'a@b.com', password: 'correct-password' },
    } as unknown as Request;
    const res = mockRes();

    await authController.login(req, res);

    expect(mockAuthFindOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user-1' },
      { $set: { refreshToken: expect.any(String) } },
      { new: true }
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'User logged in successfully',
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
      })
    );

    const [sentBody] = (res.json as jest.Mock).mock.calls[0];
    const decoded = jwtUtil.verifyAccessToken(sentBody?.accessToken) as any;
    expect(decoded.roles).toEqual(['RETAILER', 'SUPPLIER']);
  });
});

describe('AuthController.me', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {} } as Request;
    const res = mockRes();

    await authController.me(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Access token is missing',
    });
    expect(mockUserFindById).not.toHaveBeenCalled();
  });

  it("returns 404 when the token's account no longer exists", async () => {
    mockUserFindById.mockReturnValue(mockQuery(null));
    const req = {
      meta: { user: { userId: 'ghost-1', roles: ['RETAILER'] } },
    } as Request;
    const res = mockRes();

    await authController.me(req, res);

    expect(mockUserFindById).toHaveBeenCalledWith('ghost-1');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      message: 'The account associated with this session no longer exists',
    });
  });

  it('returns the user, password excluded via select', async () => {
    const query = mockQuery({ _id: 'user-1', email: 'a@b.com' });
    mockUserFindById.mockReturnValue(query);
    const req = {
      meta: { user: { userId: 'user-1', roles: ['RETAILER'] } },
    } as Request;
    const res = mockRes();

    await authController.me(req, res);

    expect(query.select).toHaveBeenCalledWith('-password');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      user: { _id: 'user-1', email: 'a@b.com' },
    });
  });

  it('routes an unexpected failure through errorHandler', async () => {
    mockUserFindById.mockImplementation(() => {
      throw new Error('db is down');
    });
    const req = {
      meta: { user: { userId: 'user-1', roles: ['RETAILER'] } },
    } as Request;
    const res = mockRes();

    await authController.me(req, res);

    // errorHandler always responds via .send, unlike me()'s own explicit
    // 401/404/200 branches above, which use .json.
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith({
      message: ERRORS.INTERNAL_SERVER_ERROR,
    });
  });
});

describe('AuthController.refresh', () => {
  it('returns 401 when no refreshToken is given', async () => {
    const req = { body: {} } as Request;
    const res = mockRes();

    await authController.refresh(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith({
      message: 'Refresh token is required',
    });
  });

  it('returns 401 for an invalid/garbage refresh token', async () => {
    const req = { body: { refreshToken: 'not-a-real-token' } } as Request;
    const res = mockRes();

    await authController.refresh(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith({
      message: 'Invalid or expired refresh token',
    });
  });

  it('returns 401 when the refresh token is not the one on file (revoked by logout/re-login)', async () => {
    mockAuthFindOne.mockResolvedValue(null);
    const refreshToken = jwtUtil.createRefreshToken({
      _id: 'user-1',
      roles: ['SUPPLIER'],
    });
    const req = { body: { refreshToken } } as Request;
    const res = mockRes();

    await authController.refresh(req, res);

    expect(mockAuthFindOne).toHaveBeenCalledWith({
      userId: 'user-1',
      refreshToken,
    });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith({
      message: 'Refresh token has been revoked, please log in again',
    });
  });

  it('issues a fresh access token carrying the same roles', async () => {
    mockAuthFindOne.mockResolvedValue({ userId: 'user-1' });
    const refreshToken = jwtUtil.createRefreshToken({
      _id: 'user-1',
      roles: ['SUPPLIER'],
    });
    const req = { body: { refreshToken } } as Request;
    const res = mockRes();

    await authController.refresh(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const [sentBody] = (res.send as jest.Mock).mock.calls[0];
    const decoded = jwtUtil.verifyAccessToken(sentBody.accessToken) as any;
    expect(decoded._id).toBe('user-1');
    expect(decoded.roles).toEqual(['SUPPLIER']);
  });
});

describe('AuthController.logout', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {} } as Request;
    const res = mockRes();

    await authController.logout(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockAuthUpdateOne).not.toHaveBeenCalled();
  });

  it("clears the caller's persisted refresh token", async () => {
    mockAuthUpdateOne.mockResolvedValue({});
    const req = {
      meta: { user: { userId: 'user-1', roles: ['RETAILER'] } },
    } as unknown as Request;
    const res = mockRes();

    await authController.logout(req, res);

    expect(mockAuthUpdateOne).toHaveBeenCalledWith(
      { userId: 'user-1' },
      { $set: { refreshToken: '' } }
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('AuthController.remove', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, body: {} } as Request;
    const res = mockRes();

    await authController.remove(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockUserDeleteOne).not.toHaveBeenCalled();
  });

  it('deletes the user and auth record immediately for a RETAILER-only caller', async () => {
    mockUserDeleteOne.mockResolvedValue({});
    mockAuthDeleteOne.mockResolvedValue({});
    const req = {
      meta: { user: { userId: 'user-1', roles: ['RETAILER'] } },
      body: { reason: 'No longer need this account' },
    } as unknown as Request;
    const res = mockRes();

    await authController.remove(req, res);

    expect(mockUserDeleteOne).toHaveBeenCalledWith({ _id: 'user-1' });
    expect(mockAuthDeleteOne).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(mockSupplierRemoveRequestSave).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('opens a SupplierRemoveRequest instead of deleting when the caller holds SUPPLIER', async () => {
    mockSupplierRemoveRequestFindOne.mockResolvedValue(null);
    mockSupplierRemoveRequestSave.mockResolvedValue({ _id: 'req-1' });
    const req = {
      meta: { user: { userId: 'user-1', roles: ['RETAILER', 'SUPPLIER'] } },
      body: { reason: 'Closing my wholesale business' },
    } as unknown as Request;
    const res = mockRes();

    await authController.remove(req, res);

    expect(supplierRemoveRequestModel).toHaveBeenCalledWith(
      expect.objectContaining({
        user_ref: 'user-1',
        reason: 'Closing my wholesale business',
      })
    );
    expect(mockUserDeleteOne).not.toHaveBeenCalled();
    expect(mockAuthDeleteOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 409 when a SUPPLIER already has a PENDING removal request', async () => {
    mockSupplierRemoveRequestFindOne.mockResolvedValue({ _id: 'req-1' });
    const req = {
      meta: { user: { userId: 'user-1', roles: ['SUPPLIER'] } },
      body: { reason: 'Closing my wholesale business' },
    } as unknown as Request;
    const res = mockRes();

    await authController.remove(req, res);

    expect(mockSupplierRemoveRequestSave).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe('AuthController.verify', () => {
  it('responds with the verified email for a valid token', () => {
    const token = jwtUtil.createAccessToken({ email: 'a@b.com' } as any);
    const req = { params: { token } } as unknown as Request;
    const res = mockRes();

    authController.verify(req, res);

    expect(res.send).toHaveBeenCalledWith('VERIFY EMAIL FOR USERa@b.com');
  });

  it('routes a garbage token through errorHandler instead of crashing', () => {
    const req = {
      params: { token: 'not-a-real-token' },
    } as unknown as Request;
    const res = mockRes();

    authController.verify(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith({
      message: ERRORS.INTERNAL_SERVER_ERROR,
    });
  });
});
