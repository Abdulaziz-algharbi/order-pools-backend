import { Request, Response, NextFunction } from 'express';

import addressesRouter from '../../src/services/addresses/addresses.routes';
import jwtUtil from '../../src/utils/jwt.util';

type Handler = (req: Request, res: Response, next: NextFunction) => unknown;

interface RouteStackItem {
  method: string;
  handle: Handler;
}

interface RouteLayer {
  route?: {
    path: string;
    stack: RouteStackItem[];
  };
}

// Walks the actual registered router (not a re-implementation of it), so
// this breaks if tokenMiddleware is ever removed or reordered — not just
// if tokenMiddleware itself misbehaves (covered separately in
// token.middleware.test.ts).
function getHandlers(path: string, method: string): Handler[] {
  const stack = (addressesRouter as unknown as { stack: RouteLayer[] }).stack;
  const layer = stack.find((l) => l.route?.path === path);
  if (!layer?.route) {
    throw new Error(`No route registered for ${method.toUpperCase()} ${path}`);
  }
  const handlers = layer.route.stack
    .filter((s) => s.method === method)
    .map((s) => s.handle);
  if (handlers.length === 0) {
    throw new Error(`No handlers found for ${method.toUpperCase()} ${path}`);
  }
  return handlers;
}

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('address routes reject unauthenticated callers on token-gated operations', () => {
  it.each([
    ['GET', '/'],
    ['GET', '/:_id'],
    ['PATCH', '/:_id'],
    ['DELETE', '/:_id'],
  ])('rejects an unauthenticated caller on %s %s with 401', (method, path) => {
    const handlers = getHandlers(path, method.toLowerCase());
    const tokenGate = handlers[0];
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = jest.fn();

    tokenGate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it.each([
    ['GET', '/'],
    ['GET', '/:_id'],
    ['PATCH', '/:_id'],
    ['DELETE', '/:_id'],
  ])('lets an authenticated caller pass %s %s', (method, path) => {
    const handlers = getHandlers(path, method.toLowerCase());
    const tokenGate = handlers[0];
    const token = jwtUtil.createAccessToken({
      _id: 'user-1',
      roles: ['RETAILER'],
    });
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as Request;
    const res = mockRes();
    const next = jest.fn();

    tokenGate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('POST / uses optionalTokenMiddleware, not tokenMiddleware', () => {
  it('never rejects for a missing token — an address can be created before registration', () => {
    const handlers = getHandlers('/', 'post');
    const optionalGate = handlers[0];
    const req = { headers: {} } as Request;
    const res = mockRes();
    const next = jest.fn();

    optionalGate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('still attaches the caller when a valid token is present', () => {
    const handlers = getHandlers('/', 'post');
    const optionalGate = handlers[0];
    const token = jwtUtil.createAccessToken({
      _id: 'user-1',
      roles: ['RETAILER'],
    });
    const req = {
      headers: { authorization: `Bearer ${token}` },
    } as Request & { meta: any };
    const res = mockRes();
    const next = jest.fn();

    optionalGate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.meta.user).toEqual({ userId: 'user-1', roles: ['RETAILER'] });
  });
});
