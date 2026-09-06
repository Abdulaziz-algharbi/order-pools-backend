import { Request, Response, NextFunction } from 'express';

import supplierRemoveRequestsRouter from '../../src/services/supplier.remove.requests/supplier.remove.requests.routes';

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
  const stack = (
    supplierRemoveRequestsRouter as unknown as { stack: RouteLayer[] }
  ).stack;
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

function reqAs(role: string): Request {
  return {
    meta: { user: { userId: 'caller-1', roles: [role] } },
  } as unknown as Request;
}

const ALL_ROLES_ROUTES: [string, string][] = [
  ['GET', '/'],
  ['GET', '/:_id'],
  ['DELETE', '/:_id'],
];

describe('supplier remove request routes open to every role reject only unauthenticated callers', () => {
  it.each(ALL_ROLES_ROUTES)(
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

  it.each(ALL_ROLES_ROUTES)('lets every role through %s %s', (method, path) => {
    const handlers = getHandlers(path, method.toLowerCase());
    const roleGate = handlers[1];

    for (const role of ['ADMIN', 'SUPPLIER', 'RETAILER']) {
      const req = reqAs(role);
      const res = mockRes();
      const next = jest.fn();

      roleGate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    }
  });
});

describe('PATCH /:_id is ADMIN-only', () => {
  it('rejects an unauthenticated caller with 401', () => {
    const handlers = getHandlers('/:_id', 'patch');
    const roleGate = handlers[1];
    const req = { meta: {} } as Request;
    const res = mockRes();
    const next = jest.fn();

    roleGate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['SUPPLIER', 'RETAILER'])('rejects %s with 403', (role) => {
    const handlers = getHandlers('/:_id', 'patch');
    const roleGate = handlers[1];
    const req = reqAs(role);
    const res = mockRes();
    const next = jest.fn();

    roleGate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets ADMIN through', () => {
    const handlers = getHandlers('/:_id', 'patch');
    const roleGate = handlers[1];
    const req = reqAs('ADMIN');
    const res = mockRes();
    const next = jest.fn();

    roleGate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
