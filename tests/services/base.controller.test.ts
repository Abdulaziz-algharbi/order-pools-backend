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
  return MockModel;
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
