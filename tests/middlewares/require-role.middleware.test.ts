import { Request, Response } from 'express';

import requireRole from '../../src/middlewares/require-role.middleware';

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('requireRole', () => {
  it('rejects with 401 when no user is attached (tokenMiddleware did not run)', () => {
    const req = { meta: {} } as Request;
    const res = mockRes();
    const next = jest.fn();

    requireRole('ADMIN')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 403 when the user role is not allowed', () => {
    const req = {
      meta: { user: { userId: 'u1', role: 'RETAILER' } },
    } as Request;
    const res = mockRes();
    const next = jest.fn();

    requireRole('ADMIN')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when the user role is allowed', () => {
    const req = {
      meta: { user: { userId: 'u1', role: 'ADMIN' } },
    } as Request;
    const res = mockRes();
    const next = jest.fn();

    requireRole('ADMIN')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows any of multiple accepted roles', () => {
    const req = {
      meta: { user: { userId: 'u1', role: 'SUPPLIER' } },
    } as Request;
    const res = mockRes();
    const next = jest.fn();

    requireRole('ADMIN', 'SUPPLIER')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
