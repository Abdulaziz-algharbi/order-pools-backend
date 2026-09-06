import { Request, Response } from 'express';
import mongoose from 'mongoose';

import BaseController from '../../src/services/base/base.controller';
import ERRORS from '../../src/constants/ERRORS';

const mockSave = jest.fn();

function makeModel() {
  const MockModel: any = jest.fn().mockImplementation(function (
    this: any,
    data: any
  ) {
    Object.assign(this, data);
    this.save = mockSave;
  });
  MockModel.modelName = 'Thing';
  MockModel.find = jest.fn();
  MockModel.findById = jest.fn();
  MockModel.deleteOne = jest.fn();
  MockModel.countDocuments = jest.fn();
  return MockModel;
}

// A minimal thenable mock for a chained Mongoose find() query
// (.select()/.skip()/.limit(), each returning the same query object,
// awaiting it resolves to `result`) — needed once list() starts
// conditionally chaining those onto whatever find() returns.
function mockQuery(result: unknown) {
  const query: any = {
    select: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  query.select.mockReturnValue(query);
  query.skip.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('BaseController.errorHandler', () => {
  it('maps a Mongoose ValidationError to 400 with the field errors', () => {
    const controller = new BaseController(makeModel(), ['name']);
    const err = new mongoose.Error.ValidationError();
    err.errors = { name: 'name is required' } as any;
    const res = mockRes();

    controller.errorHandler(err, {} as Request, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith({
      message: 'Validation Error',
      errors: err.errors,
    });
  });

  it('maps a Mongoose CastError (malformed id) to 400 naming the bad value', () => {
    const controller = new BaseController(makeModel(), ['name']);
    const err = new mongoose.Error.CastError('ObjectId', 'not-an-id', '_id');
    const res = mockRes();

    controller.errorHandler(err, {} as Request, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith({
      message: "Invalid _id: 'not-an-id' is not a valid id",
    });
  });

  it('maps a Mongo duplicate-key error to 409 with the driver message', () => {
    const controller = new BaseController(makeModel(), ['name']);
    const err = new mongoose.mongo.MongoServerError({
      message: 'E11000 duplicate key error',
    });
    err.code = 11000;
    const res = mockRes();

    controller.errorHandler(err, {} as Request, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.send).toHaveBeenCalledWith({ message: err.message });
  });

  it.each([
    [ERRORS.USER_NOT_FOUND, 404],
    [ERRORS.INVALID_CREDENTIALS, 401],
    [ERRORS.UNAUTHORIZED, 403],
    [ERRORS.CONFLICT, 409],
    [ERRORS.TOKEN_EXPIRED, 401],
  ])('maps a thrown Error(%s) to %i', (message, status) => {
    const controller = new BaseController(makeModel(), ['name']);
    const res = mockRes();

    controller.errorHandler(new Error(message), {} as Request, res);

    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.send).toHaveBeenCalledWith({ message });
  });

  it('falls back to a 500 with the generic INTERNAL_SERVER_ERROR message for an unrecognized error', () => {
    const controller = new BaseController(makeModel(), ['name']);
    const res = mockRes();

    controller.errorHandler(
      new Error('something truly unexpected'),
      {} as Request,
      res
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith({
      message: ERRORS.INTERNAL_SERVER_ERROR,
    });
  });
});

describe('BaseController CRUD methods route unexpected errors through errorHandler', () => {
  it('create() surfaces a save() ValidationError as 400 (not a blind 500)', async () => {
    const model = makeModel();
    const controller = new BaseController(model, ['name']);
    const validationError = new mongoose.Error.ValidationError();
    validationError.errors = { name: 'name is required' } as any;
    mockSave.mockRejectedValueOnce(validationError);
    const req = { body: { name: 'x' } } as Request;
    const res = mockRes();

    await controller.create(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Validation Error' })
    );
  });

  it('create() falls back to 500 for a truly unexpected save() failure', async () => {
    const model = makeModel();
    const controller = new BaseController(model, ['name']);
    mockSave.mockRejectedValueOnce(new Error('db is down'));
    const req = { body: { name: 'x' } } as Request;
    const res = mockRes();

    await controller.create(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith({
      message: ERRORS.INTERNAL_SERVER_ERROR,
    });
  });

  it('getById() surfaces a malformed :_id as 400 instead of a blind 500', async () => {
    const model = makeModel();
    model.findById.mockRejectedValueOnce(
      new mongoose.Error.CastError('ObjectId', 'bad-id', '_id')
    );
    const controller = new BaseController(model, ['name']);
    const req = { params: { _id: 'bad-id' } } as unknown as Request;
    const res = mockRes();

    await controller.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('list() delegates an unexpected find() failure to errorHandler', async () => {
    const model = makeModel();
    model.find.mockRejectedValueOnce(new Error('db is down'));
    const controller = new BaseController(model, ['name']);
    const req = {} as Request;
    const res = mockRes();

    await controller.list(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith({
      message: ERRORS.INTERNAL_SERVER_ERROR,
    });
  });

  it('update() surfaces a save() ValidationError as 400 instead of a blind 500 with a raw error dump', async () => {
    const model = makeModel();
    const doc: any = { name: 'old', save: mockSave };
    model.findById.mockResolvedValueOnce(doc);
    const validationError = new mongoose.Error.ValidationError();
    validationError.errors = { name: 'name is required' } as any;
    mockSave.mockRejectedValueOnce(validationError);
    const controller = new BaseController(model, ['name']);
    const req = {
      params: { _id: '1' },
      body: { name: '' },
    } as unknown as Request;
    const res = mockRes();

    await controller.update(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Validation Error' })
    );
  });

  it('delete() delegates an unexpected deleteOne() failure to errorHandler', async () => {
    const model = makeModel();
    model.findById.mockResolvedValueOnce({ _id: '1' });
    model.deleteOne.mockRejectedValueOnce(new Error('db is down'));
    const controller = new BaseController(model, ['name']);
    const req = { params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await controller.delete(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith({
      message: ERRORS.INTERNAL_SERVER_ERROR,
    });
  });
});

describe('BaseController.list generic filtering/pagination', () => {
  it('defaults to every document, unpaginated, when the caller supplies no page/limit', async () => {
    const model = makeModel();
    model.find.mockResolvedValue([{ _id: '1' }, { _id: '2' }]);
    const controller = new BaseController(model, ['name']);
    const req = { query: {} } as unknown as Request;
    const res = mockRes();

    await controller.list(req, res);

    expect(model.find).toHaveBeenCalledWith({});
    expect(model.countDocuments).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith({
      message: 'Documents retrieved successfully',
      data: [{ _id: '1' }, { _id: '2' }],
      total: 2,
    });
  });

  it('applies skip/limit and returns page/limit/total when ?page & ?limit are valid', async () => {
    const model = makeModel();
    const query = mockQuery([{ _id: '3' }]);
    model.find.mockReturnValue(query);
    model.countDocuments.mockResolvedValue(21);
    const controller = new BaseController(model, ['name']);
    const req = { query: { page: '3', limit: '10' } } as unknown as Request;
    const res = mockRes();

    await controller.list(req, res);

    expect(query.skip).toHaveBeenCalledWith(20);
    expect(query.limit).toHaveBeenCalledWith(10);
    expect(model.countDocuments).toHaveBeenCalledWith({});
    expect(res.send).toHaveBeenCalledWith({
      message: 'Documents retrieved successfully',
      data: [{ _id: '3' }],
      total: 21,
      page: 3,
      limit: 10,
    });
  });

  it('caps an oversized ?limit at 100', async () => {
    const model = makeModel();
    const query = mockQuery([]);
    model.find.mockReturnValue(query);
    model.countDocuments.mockResolvedValue(0);
    const controller = new BaseController(model, ['name']);
    const req = { query: { page: '1', limit: '5000' } } as unknown as Request;
    const res = mockRes();

    await controller.list(req, res);

    expect(query.limit).toHaveBeenCalledWith(100);
  });

  it.each([
    [{ page: '0', limit: '10' }],
    [{ page: '1', limit: '0' }],
    [{ page: '1.5', limit: '10' }],
    [{ page: '1' }],
    [{ limit: '10' }],
    [{ page: 'nope', limit: 'nope' }],
  ])(
    'falls back to unpaginated behavior for invalid/partial query %j',
    async (queryParams) => {
      const model = makeModel();
      model.find.mockResolvedValue([{ _id: '1' }]);
      const controller = new BaseController(model, ['name']);
      const req = { query: queryParams } as unknown as Request;
      const res = mockRes();

      await controller.list(req, res);

      expect(model.countDocuments).not.toHaveBeenCalled();
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ total: 1 })
      );
    }
  );

  it('applies listSelect() to every list() query', async () => {
    class SelectController extends BaseController {
      protected listSelect() {
        return '-secret';
      }
    }
    const model = makeModel();
    const query = mockQuery([{ _id: '1' }]);
    model.find.mockReturnValue(query);
    const controller = new SelectController(model, ['name']);
    const req = { query: {} } as unknown as Request;
    const res = mockRes();

    await controller.list(req, res);

    expect(query.select).toHaveBeenCalledWith('-secret');
  });

  it('applies transformListDoc() to every returned document', async () => {
    class TransformController extends BaseController {
      protected transformListDoc(doc: any) {
        return { ...doc, redacted: true };
      }
    }
    const model = makeModel();
    model.find.mockResolvedValue([{ _id: '1' }, { _id: '2' }]);
    const controller = new TransformController(model, ['name']);
    const req = { query: {} } as unknown as Request;
    const res = mockRes();

    await controller.list(req, res);

    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { _id: '1', redacted: true },
          { _id: '2', redacted: true },
        ],
      })
    );
  });

  it('short-circuits without querying when buildListFilter() returns null', async () => {
    class GatedController extends BaseController {
      protected async buildListFilter(_req: Request, res: Response) {
        res.status(401).send({ message: 'nope' });
        return null;
      }
    }
    const model = makeModel();
    const controller = new GatedController(model, ['name']);
    const req = { query: {} } as unknown as Request;
    const res = mockRes();

    await controller.list(req, res);

    expect(model.find).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
