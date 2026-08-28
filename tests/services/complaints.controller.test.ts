import { Request, Response } from 'express';

jest.mock('../../src/services/complaints/complaint.model', () => {
  const actual = jest.requireActual(
    '../../src/services/complaints/complaint.model'
  );
  return {
    __esModule: true,
    default: { modelName: 'Complaint', find: jest.fn() },
    couldBeUpdated: actual.couldBeUpdated,
  };
});

import complaintController from '../../src/services/complaints/complaints.controller';
import complaintModel from '../../src/services/complaints/complaint.model';

const mockFind = complaintModel.find as unknown as jest.Mock;

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

  it('scopes the query to retailer_ref for a non-admin', async () => {
    mockFind.mockResolvedValue([{ _id: '1' }]);
    const req = {
      meta: { user: { userId: 'retailer-1', role: 'RETAILER' } },
    } as Request;
    const res = mockRes();

    await complaintController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({ retailer_ref: 'retailer-1' });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("also scopes a SUPPLIER caller to their own retailer_ref (never sees others' complaints)", async () => {
    mockFind.mockResolvedValue([]);
    const req = {
      meta: { user: { userId: 'supplier-1', role: 'SUPPLIER' } },
    } as Request;
    const res = mockRes();

    await complaintController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({ retailer_ref: 'supplier-1' });
  });
});
