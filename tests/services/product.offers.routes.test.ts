import { Request, Response, NextFunction } from 'express';

import productOffersRouter from '../../src/services/product.offers/product.offers.routes';

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
// this breaks if requireRole is ever removed, reordered after the
// controller, or loosened — not just if requireRole itself misbehaves
// (covered separately in require-role.middleware.test.ts).
function getHandlers(path: string, method: string): Handler[] {
  const stack = (productOffersRouter as unknown as { stack: RouteLayer[] })
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

function reqAs(role: string): Request {
  return {
    meta: { user: { userId: 'caller-1', roles: [role] } },
  } as unknown as Request;
}

describe('product offers routes reject RETAILER from every operation', () => {
  it.each([
    ['GET', '/'],
    ['POST', '/'],
    ['GET', '/:_id'],
    ['PATCH', '/:_id'],
    ['DELETE', '/:_id'],
  ])(
    'rejects an authenticated %s %s caller with role RETAILER with 403 before the controller runs',
    (method, path) => {
      const handlers = getHandlers(path, method.toLowerCase());
      // handlers[0] is tokenMiddleware, bypassed here by attaching
      // req.meta.user directly; handlers[1] must be the role gate.
      const roleGate = handlers[1];
      const req = reqAs('RETAILER');
      const res = mockRes();
      const next = jest.fn();

      roleGate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  );
});

describe('product offers routes reject unauthenticated callers from every operation', () => {
  it.each([
    ['GET', '/'],
    ['POST', '/'],
    ['GET', '/:_id'],
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

describe('product offers routes reject ADMIN from creating an offer', () => {
  it('rejects an authenticated ADMIN caller on POST / with 403', () => {
    const handlers = getHandlers('/', 'post');
    const roleGate = handlers[1];
    const req = reqAs('ADMIN');
    const res = mockRes();
    const next = jest.fn();

    roleGate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('product offers routes let SUPPLIER and ADMIN through the role gate', () => {
  it.each([
    ['GET', '/', ['SUPPLIER', 'ADMIN']],
    ['POST', '/', ['SUPPLIER']],
    ['GET', '/:_id', ['SUPPLIER', 'ADMIN']],
    ['PATCH', '/:_id', ['SUPPLIER', 'ADMIN']],
    ['DELETE', '/:_id', ['SUPPLIER', 'ADMIN']],
  ])('lets each allowed role pass %s %s', (method, path, roles) => {
    const handlers = getHandlers(path, (method as string).toLowerCase());
    const roleGate = handlers[1];

    for (const role of roles as string[]) {
      const req = reqAs(role);
      const res = mockRes();
      const next = jest.fn();

      roleGate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    }
  });
});
