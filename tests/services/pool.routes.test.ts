import { Request, Response, NextFunction } from 'express';

import poolRouter from '../../src/services/pools/pool.routes';

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
// this breaks if requireRole('ADMIN') is ever removed, reordered after the
// controller, or loosened — not just if requireRole itself misbehaves
// (covered separately in require-role.middleware.test.ts).
function getHandlers(path: string, method: string): Handler[] {
  const stack = (poolRouter as unknown as { stack: RouteLayer[] }).stack;
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
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

function reqAs(role: string): Request {
  return {
    meta: { user: { userId: 'caller-1', role } },
  } as unknown as Request;
}

describe('pool routes reject non-ADMIN from write operations', () => {
  it.each([
    ['POST', '/', 'RETAILER'],
    ['POST', '/', 'SUPPLIER'],
    ['PATCH', '/:_id', 'RETAILER'],
    ['PATCH', '/:_id', 'SUPPLIER'],
    ['DELETE', '/:_id', 'RETAILER'],
    ['DELETE', '/:_id', 'SUPPLIER'],
  ])(
    'rejects an authenticated %s %s caller with role %s with 403 before the controller runs',
    (method, path, role) => {
      const handlers = getHandlers(path, method.toLowerCase());
      // handlers[0] is tokenMiddleware, bypassed here by attaching
      // req.meta.user directly; handlers[1] must be the role gate.
      const roleGate = handlers[1];
      const req = reqAs(role);
      const res = mockRes();
      const next = jest.fn();

      roleGate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['POST', '/'],
    ['PATCH', '/:_id'],
    ['DELETE', '/:_id'],
  ])(
    'rejects an unauthenticated caller on %s %s with 401 before the controller runs',
    (method, path) => {
      const handlers = getHandlers(path, method.toLowerCase());
      const roleGate = handlers[1];
      const req = { meta: {} } as Request;
      const res = mockRes();
      const next = jest.fn();

      roleGate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    }
  );
});

describe('pool routes let ADMIN through to the controller on write operations', () => {
  it.each([
    ['POST', '/'],
    ['PATCH', '/:_id'],
    ['DELETE', '/:_id'],
  ])('lets an authenticated ADMIN caller pass %s %s', (method, path) => {
    const handlers = getHandlers(path, method.toLowerCase());
    const roleGate = handlers[1];
    const req = reqAs('ADMIN');
    const res = mockRes();
    const next = jest.fn();

    roleGate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
