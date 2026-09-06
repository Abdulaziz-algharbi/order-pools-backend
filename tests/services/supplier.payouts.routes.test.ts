import { Request, Response, NextFunction } from 'express';

import supplierPayoutsRouter from '../../src/services/supplier.payouts/supplier.payouts.routes';

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
  const stack = (supplierPayoutsRouter as unknown as { stack: RouteLayer[] })
    .stack;
  // PATCH /:_id is registered as its own router.patch(...) call, separate
  // from the router.route('/:_id').get(...) chain above it, so it lands
  // in a second layer for the same path — every matching layer must be
  // searched, not just the first.
  const layers = stack.filter((l) => l.route?.path === path);
  if (layers.length === 0) {
    throw new Error(`No route registered for ${method.toUpperCase()} ${path}`);
  }
  const handlers = layers.flatMap((l) =>
    l.route!.stack.filter((s) => s.method === method).map((s) => s.handle)
  );
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

function reqAs(role: string): Request {
  return {
    meta: { user: { userId: 'caller-1', roles: [role] } },
  } as unknown as Request;
}

const ADMIN_SUPPLIER_ROUTES: [string, string][] = [
  ['GET', '/'],
  ['GET', '/:_id'],
];

const ADMIN_ONLY_ROUTES: [string, string][] = [
  ['POST', '/'],
  ['PATCH', '/:_id'],
];

describe('supplier payout routes reject unauthenticated callers everywhere', () => {
  it.each([...ADMIN_SUPPLIER_ROUTES, ...ADMIN_ONLY_ROUTES])(
    'rejects an unauthenticated caller on %s %s with 401',
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

describe('supplier payout routes shared by ADMIN and SUPPLIER', () => {
  it.each(ADMIN_SUPPLIER_ROUTES)(
    'rejects a RETAILER caller on %s %s with 403',
    (method, path) => {
      const handlers = getHandlers(path, method.toLowerCase());
      const roleGate = handlers[1];
      const req = reqAs('RETAILER');
      const res = mockRes();
      const next = jest.fn();

      roleGate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  );

  it.each(ADMIN_SUPPLIER_ROUTES)(
    'lets ADMIN and SUPPLIER through %s %s',
    (method, path) => {
      const handlers = getHandlers(path, method.toLowerCase());
      const roleGate = handlers[1];

      for (const role of ['ADMIN', 'SUPPLIER']) {
        const req = reqAs(role);
        const res = mockRes();
        const next = jest.fn();

        roleGate(req, res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      }
    }
  );
});

describe('supplier payout routes restricted to ADMIN only', () => {
  it.each(ADMIN_ONLY_ROUTES)(
    'rejects a SUPPLIER caller on %s %s with 403',
    (method, path) => {
      const handlers = getHandlers(path, method.toLowerCase());
      const roleGate = handlers[1];
      const req = reqAs('SUPPLIER');
      const res = mockRes();
      const next = jest.fn();

      roleGate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  );

  it.each(ADMIN_ONLY_ROUTES)('lets ADMIN through %s %s', (method, path) => {
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
