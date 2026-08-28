import { Request, Response } from 'express';

import tokenMiddleware from '../../src/middlewares/token.middleware';
import jwtUtil from '../../src/utils/jwt.util';

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('tokenMiddleware', () => {
  it('rejects a request with no Authorization header', () => {
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = jest.fn();

    tokenMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an invalid/garbage token', () => {
    const req = {
      headers: { authorization: 'Bearer not-a-real-token' },
    } as Request;
    const res = mockRes();
    const next = jest.fn();

    tokenMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('attaches userId and role from a valid token and calls next', () => {
    const token = jwtUtil.createAccessToken({ _id: 'user-1', role: 'ADMIN' });
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as Request & { meta: any };
    const res = mockRes();
    const next = jest.fn();

    tokenMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.meta.user).toEqual({ userId: 'user-1', role: 'ADMIN' });
    expect(res.status).not.toHaveBeenCalled();
  });
});
