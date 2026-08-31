import { Request, Response, NextFunction } from 'express';

import poolParticipantsRouter from '../../src/services/pool.participants/pool.participants.routes';

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

// Walks the actual registered router (not a re-implementation of it) to
// find the middleware chain express runs for a given method/path, so this
// test breaks if requireRole is ever removed, reordered after the
// controller, or loosened to include SUPPLIER — not just if requireRole
// itself misbehaves (that's covered separately in
// require-role.middleware.test.ts).
function getHandlers(path: string, method: string): Handler[] {
  const stack = (poolParticipantsRouter as unknown as { stack: RouteLayer[] })
    .stack;
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

function supplierReq(): Request {
  return {
    meta: { user: { userId: 'supplier-1', roles: ['SUPPLIER'] } },
  } as unknown as Request;
}

describe('pool.participants routes reject SUPPLIER', () => {
  it.each([
    ['GET', '/'],
    ['POST', '/'],
    ['GET', '/:_id'],
    ['PATCH', '/:_id'],
    ['DELETE', '/:_id'],
  ])(
    'rejects an authenticated SUPPLIER on %s %s with 403 before the controller runs',
    (method, path) => {
      const handlers = getHandlers(path, method.toLowerCase());
      // handlers[0] is tokenMiddleware, which we bypass here by attaching
      // req.meta.user directly (as if the caller already holds a valid
      // SUPPLIER token) — handlers[1] must be the role gate.
      const roleGate = handlers[1];
      const req = supplierReq();
      const res = mockRes();
      const next = jest.fn();

      roleGate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  );
});
