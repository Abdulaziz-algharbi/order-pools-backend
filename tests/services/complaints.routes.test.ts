import { Request, Response, NextFunction } from 'express';

import complaintsRouter from '../../src/services/complaints/complaints.routes';
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
// this breaks if requireRole/tokenMiddleware are ever removed, reordered
// after the controller, or loosened — not just if they themselves
// misbehave (covered separately in their own middleware tests).
function getHandlers(path: string, method: string): Handler[] {
  const stack = (complaintsRouter as unknown as { stack: RouteLayer[] }).stack;
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

describe('complaints routes: GET/PATCH have no role gate (ownership is checked in the controller)', () => {
  it.each([
    ['GET', '/'],
    ['GET', '/:_id'],
    ['PATCH', '/:_id'],
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
  ])('lets an authenticated caller of any role pass %s %s', (method, path) => {
    const handlers = getHandlers(path, method.toLowerCase());
    const tokenGate = handlers[0];
    const token = jwtUtil.createAccessToken({
      _id: 'caller-1',
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

describe('POST / is restricted to RETAILER/SUPPLIER', () => {
  it('rejects an unauthenticated caller with 401', () => {
    const handlers = getHandlers('/', 'post');
    const roleGate = handlers[1];
    const req = { meta: {} } as Request;
    const res = mockRes();
    const next = jest.fn();

    roleGate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an authenticated ADMIN with 403', () => {
    const handlers = getHandlers('/', 'post');
    const roleGate = handlers[1];
    const req = reqAs('ADMIN');
    const res = mockRes();
    const next = jest.fn();

    roleGate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['RETAILER', 'SUPPLIER'])('lets %s through', (role) => {
    const handlers = getHandlers('/', 'post');
    const roleGate = handlers[1];
    const req = reqAs(role);
    const res = mockRes();
    const next = jest.fn();

    roleGate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('DELETE /:_id is ADMIN-only', () => {
  it('rejects an unauthenticated caller with 401', () => {
    const handlers = getHandlers('/:_id', 'delete');
    const roleGate = handlers[1];
    const req = { meta: {} } as Request;
    const res = mockRes();
    const next = jest.fn();

    roleGate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it.each(['RETAILER', 'SUPPLIER'])('rejects %s with 403', (role) => {
    const handlers = getHandlers('/:_id', 'delete');
    const roleGate = handlers[1];
    const req = reqAs(role);
    const res = mockRes();
    const next = jest.fn();

    roleGate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets ADMIN through', () => {
    const handlers = getHandlers('/:_id', 'delete');
    const roleGate = handlers[1];
    const req = reqAs('ADMIN');
    const res = mockRes();
    const next = jest.fn();

    roleGate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
