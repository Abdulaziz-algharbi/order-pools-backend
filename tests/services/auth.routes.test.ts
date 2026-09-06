import { Request, Response, NextFunction } from 'express';

import authRouter from '../../src/services/auth/auth.routes';
import tokenMiddleware from '../../src/middlewares/token.middleware';
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
// this breaks if tokenMiddleware is ever added to (or removed from) a
// route — not just if tokenMiddleware itself misbehaves (covered
// separately in token.middleware.test.ts).
function getHandlers(path: string, method: string): Handler[] {
  const stack = (authRouter as unknown as { stack: RouteLayer[] }).stack;
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

describe('auth routes require tokenMiddleware on session-scoped operations', () => {
  it.each([
    ['GET', '/me'],
    ['POST', '/logout'],
    ['DELETE', '/remove'],
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
    ['GET', '/me'],
    ['POST', '/logout'],
    ['DELETE', '/remove'],
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

describe('auth routes leave registration/login/refresh/verify open (no tokenMiddleware)', () => {
  it.each([
    ['POST', '/register'],
    ['POST', '/login'],
    ['POST', '/refresh'],
    ['GET', '/verify/:token'],
  ])(
    'never wires tokenMiddleware into %s %s — these run before a session exists',
    (method, path) => {
      const handlers = getHandlers(path, method.toLowerCase());

      expect(handlers).not.toContain(tokenMiddleware);
    }
  );
});
