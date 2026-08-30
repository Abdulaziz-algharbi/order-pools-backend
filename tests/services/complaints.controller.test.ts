import { Request, Response } from 'express';

jest.mock('../../src/services/complaints/complaint.model', () => {
  const actual = jest.requireActual(
    '../../src/services/complaints/complaint.model'
  );
  return {
    __esModule: true,
    default: { modelName: 'Complaint', find: jest.fn(), findById: jest.fn() },
    couldBeUpdated: actual.couldBeUpdated,
  };
});

import BaseController from '../../src/services/base/base.controller';
import complaintController from '../../src/services/complaints/complaints.controller';
import complaintModel from '../../src/services/complaints/complaint.model';

const mockFind = complaintModel.find as unknown as jest.Mock;
const mockFindById = complaintModel.findById as unknown as jest.Mock;

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('ComplaintController.list', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {} } as Request;
    const res = mockRes();

    await complaintController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('queries with an empty filter (all complaints) for ADMIN', async () => {
    mockFind.mockResolvedValue([{ _id: '1' }, { _id: '2' }]);
    const req = {
      meta: { user: { userId: 'admin-1', role: 'ADMIN' } },
    } as Request;
    const res = mockRes();

    await complaintController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({});
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ total: 2 })
    );
  });

  it('scopes the query to creator_ref for a non-admin', async () => {
    mockFind.mockResolvedValue([{ _id: '1' }]);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
    } as Request;
    const res = mockRes();

    await complaintController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({ creator_ref: 'retailer-1' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("also scopes a SUPPLIER caller to their own creator_ref (never sees others' complaints)", async () => {
    mockFind.mockResolvedValue([]);
    const req = {
      meta: { user: { userId: 'supplier-1', role: 'SUPPLIER' } },
    } as Request;
    const res = mockRes();

    await complaintController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({ creator_ref: 'supplier-1' });
  });
});

describe('ComplaintController.create', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const superCreate = jest
      .spyOn(BaseController.prototype, 'create')
      .mockResolvedValue(undefined);
    const req = { meta: {}, body: {} } as Request;
    const res = mockRes();

    await complaintController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(superCreate).not.toHaveBeenCalled();
    superCreate.mockRestore();
  });

  it('overrides creator_ref to the caller for a RETAILER, ignoring any client-supplied value', async () => {
    const superCreate = jest
      .spyOn(BaseController.prototype, 'create')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      body: { creator_ref: 'someone-else', title: 't', description: 'd' },
    } as unknown as Request;
    const res = mockRes();

    await complaintController.create(req, res);

    expect(req.body.creator_ref).toBe('retailer-1');
    expect(superCreate).toHaveBeenCalledWith(req, res);
    superCreate.mockRestore();
  });

  it('overrides creator_ref to the caller for a SUPPLIER too', async () => {
    const superCreate = jest
      .spyOn(BaseController.prototype, 'create')
      .mockResolvedValue(undefined);
    const req = {
      meta: { user: { userId: 'supplier-1', role: 'SUPPLIER' } },
      body: { title: 't', description: 'd' },
    } as unknown as Request;
    const res = mockRes();

    await complaintController.create(req, res);

    expect(req.body.creator_ref).toBe('supplier-1');
    expect(superCreate).toHaveBeenCalledWith(req, res);
    superCreate.mockRestore();
  });
});

describe('ComplaintController.getById', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await complaintController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns 404 when the complaint does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: 'missing' },
    } as unknown as Request;
    const res = mockRes();

    await complaintController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 403 when a non-admin requests a complaint they did not file', async () => {
    mockFindById.mockResolvedValue({ creator_ref: 'someone-else' });
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await complaintController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns the complaint for the retailer/supplier who filed it', async () => {
    mockFindById.mockResolvedValue({ creator_ref: 'retailer-1' });
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await complaintController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets ADMIN fetch any complaint regardless of who filed it', async () => {
    mockFindById.mockResolvedValue({ creator_ref: 'someone-else' });
    const req = {
      meta: { user: { userId: 'admin-1', role: 'ADMIN' } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await complaintController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('ComplaintController.update', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, params: { _id: '1' } } as unknown as Request;
    const res = mockRes();

    await complaintController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFindById).not.toHaveBeenCalled();
  });

  it('returns 404 when the complaint does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: 'missing' },
      body: { title: 'new title' },
    } as unknown as Request;
    const res = mockRes();

    await complaintController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when a non-admin updates a complaint they didn't file", async () => {
    const doc = { creator_ref: 'someone-else', save: jest.fn() };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
      body: { title: 'new title' },
    } as unknown as Request;
    const res = mockRes();

    await complaintController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('lets the owner update title/description/priority', async () => {
    const doc: any = {
      creator_ref: 'retailer-1',
      title: 'old',
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
      body: { title: 'new title', priority: 'HIGH' },
    } as unknown as Request;
    const res = mockRes();

    await complaintController.update(req, res);

    expect(doc.title).toBe('new title');
    expect(doc.priority).toBe('HIGH');
    expect(doc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('silently ignores status/resolution when the owner (non-admin) sends them', async () => {
    const doc: any = {
      creator_ref: 'retailer-1',
      status: 'OPEN',
      resolution: undefined,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
      params: { _id: '1' },
      body: { status: 'RESOLVED', resolution: 'self-resolved' },
    } as unknown as Request;
    const res = mockRes();

    await complaintController.update(req, res);

    expect(doc.status).toBe('OPEN');
    expect(doc.resolution).toBeUndefined();
    expect(doc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets ADMIN update status and resolution on a complaint they did not file', async () => {
    const doc: any = {
      creator_ref: 'someone-else',
      status: 'OPEN',
      resolution: undefined,
      save: jest.fn().mockResolvedValue(undefined),
    };
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'admin-1', role: 'ADMIN' } },
      params: { _id: '1' },
      body: { status: 'RESOLVED', resolution: 'refunded the retailer' },
    } as unknown as Request;
    const res = mockRes();

    await complaintController.update(req, res);

    expect(doc.status).toBe('RESOLVED');
    expect(doc.resolution).toBe('refunded the retailer');
    expect(doc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
