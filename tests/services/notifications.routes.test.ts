import { Request, Response, NextFunction } from 'express';

import notificationsRouter from '../../src/services/notifications/notifications.routes';

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
  const stack = (notificationsRouter as unknown as { stack: RouteLayer[] })
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

describe('notifications routes let RETAILER/SUPPLIER/ADMIN read, block anonymous', () => {
  it.each([
    ['GET', '/'],
    ['GET', '/:_id'],
    ['PATCH', '/:_id'],
  ])('lets each readable role pass %s %s', (method, path) => {
    const handlers = getHandlers(path, method.toLowerCase());
    const roleGate = handlers[1];

    for (const role of ['RETAILER', 'SUPPLIER', 'ADMIN']) {
      const req = reqAs(role);
      const res = mockRes();
      const next = jest.fn();

      roleGate(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    }
  });

  it.each([
    ['GET', '/'],
    ['POST', '/'],
    ['GET', '/:_id'],
    ['PATCH', '/:_id'],
    ['DELETE', '/:_id'],
  ])('rejects an unauthenticated caller on %s %s with 401', (method, path) => {
    const handlers = getHandlers(path, method.toLowerCase());
    const roleGate = handlers[1];
    const req = { meta: {} } as Request;
    const res = mockRes();
    const next = jest.fn();

    roleGate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('POST/DELETE /notifications are ADMIN only', () => {
  it.each([
    ['POST', '/', 'RETAILER'],
    ['POST', '/', 'SUPPLIER'],
    ['DELETE', '/:_id', 'RETAILER'],
    ['DELETE', '/:_id', 'SUPPLIER'],
  ])(
    'rejects an authenticated %s %s caller with role %s with 403',
    (method, path, role) => {
      const handlers = getHandlers(path, method.toLowerCase());
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
