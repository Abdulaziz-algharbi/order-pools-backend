import { Request, Response } from 'express';

// A minimal thenable mock for chained Mongoose queries (find().select(),
// findById().select().populate()) — select/populate return the same query
// object, and awaiting it resolves to `result`.
function mockQuery(result: unknown) {
  const query: any = {
    select: jest.fn(),
    populate: jest.fn(),
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.populate.mockReturnValue(query);
  return query;
}

jest.mock('../../src/services/users/user.model', () => {
  const actual = jest.requireActual('../../src/services/users/user.model');
  return {
    __esModule: true,
    default: { modelName: 'User', find: jest.fn(), findById: jest.fn() },
    couldBeUpdated: actual.couldBeUpdated,
  };
});

import usersController from '../../src/services/users/users.controller';
import userModel from '../../src/services/users/user.model';

const mockFind = userModel.find as unknown as jest.Mock;
const mockFindById = userModel.findById as unknown as jest.Mock;

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('UserController.list', () => {
  it('returns every user with the password excluded', async () => {
    const query = mockQuery([{ _id: '1' }, { _id: '2' }]);
    mockFind.mockReturnValue(query);
    const req = {} as Request;
    const res = mockRes();

    await usersController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith();
    expect(query.select).toHaveBeenCalledWith('-password');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ total: 2 })
    );
  });
});

describe('UserController.getById', () => {
  it('returns 404 when the user does not exist', async () => {
    mockFindById.mockReturnValue(mockQuery(null));
    const req = { params: { _id: 'missing' } } as unknown as Request;
    const res = mockRes();

    await usersController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('excludes the password field and populates addresses', async () => {
    const query = mockQuery({ _id: '1', email: 'a@b.com' });
    mockFindById.mockReturnValue(query);
    const req = { params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await usersController.getById(req, res);

    expect(query.select).toHaveBeenCalledWith('-password');
    expect(query.populate).toHaveBeenCalledWith('addresses');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
