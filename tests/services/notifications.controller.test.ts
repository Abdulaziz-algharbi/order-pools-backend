import { Request, Response } from 'express';

const mockNotificationSave = jest.fn();

jest.mock('../../src/services/notifications/notification.model', () => {
  const actual = jest.requireActual(
    '../../src/services/notifications/notification.model'
  );
  const MockNotificationModel: any = jest.fn().mockImplementation(function (
    this: any,
    data: any
  ) {
    Object.assign(this, data);
    this.save = mockNotificationSave;
  });
  MockNotificationModel.modelName = 'Notification';
  MockNotificationModel.find = jest.fn();
  MockNotificationModel.findById = jest.fn();
  return {
    __esModule: true,
    default: MockNotificationModel,
    couldBeUpdated: actual.couldBeUpdated,
  };
});

jest.mock('../../src/services/pools/pool.model', () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}));

jest.mock('../../src/services/product.offers/product.offer.model', () => ({
  __esModule: true,
  default: { findById: jest.fn() },
}));

jest.mock(
  '../../src/services/pool.participants/pool.participant.model',
  () => ({
    __esModule: true,
    default: { distinct: jest.fn() },
  })
);

import notificationController from '../../src/services/notifications/notifications.controller';
import notificationModel from '../../src/services/notifications/notification.model';
import poolModel from '../../src/services/pools/pool.model';
import productOfferModel from '../../src/services/product.offers/product.offer.model';
import poolParticipantModel from '../../src/services/pool.participants/pool.participant.model';
import ERRORS from '../../src/constants/ERRORS';

const mockFind = notificationModel.find as unknown as jest.Mock;
const mockFindById = notificationModel.findById as unknown as jest.Mock;
const mockPoolFindById = poolModel.findById as unknown as jest.Mock;
const mockOfferFindById = productOfferModel.findById as unknown as jest.Mock;
const mockParticipantDistinct =
  poolParticipantModel.distinct as unknown as jest.Mock;

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

// Minimal stand-in for a Mongoose document: recipients supports .find()/
// .some() like a real array, and toObject() clones it for scopeToRecipient.
function makeNotification(overrides: Record<string, unknown> = {}) {
  const doc: any = {
    _id: 'notif-1',
    sender_ref: 'admin-1',
    recipients: [],
    type: 'DELIVERY_ASSIGNED',
    title: 'old title',
    message: 'old message',
    actionUrl: null,
    priority: 'NORMAL',
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  doc.toObject = () => ({ ...doc });
  return doc;
}

describe('NotificationController.create', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {}, body: {} } as Request;
    const res = mockRes();

    await notificationController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNotificationSave).not.toHaveBeenCalled();
  });

  it('builds a recipients[] entry per id and sets sender_ref to the caller', async () => {
    mockNotificationSave.mockResolvedValue({ _id: 'notif-1' });
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      body: {
        recipient_ref: ['user-1', 'user-2'],
        type: 'DELIVERY_ASSIGNED',
        title: 'Hi',
        message: 'Hello',
      },
    } as unknown as Request;
    const res = mockRes();

    await notificationController.create(req, res);

    expect(notificationModel).toHaveBeenCalledWith(
      expect.objectContaining({
        sender_ref: 'admin-1',
        recipients: [
          { user_ref: 'user-1', isRead: false, readAt: null },
          { user_ref: 'user-2', isRead: false, readAt: null },
        ],
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

describe('NotificationController.list', () => {
  it('returns 401 when there is no authenticated user', async () => {
    const req = { meta: {} } as Request;
    const res = mockRes();

    await notificationController.list(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockFind).not.toHaveBeenCalled();
  });

  it('queries with an empty filter (everything, unscoped) for ADMIN', async () => {
    const docs = [makeNotification()];
    mockFind.mockResolvedValue(docs);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
    } as Request;
    const res = mockRes();

    await notificationController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({});
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: docs })
    );
  });

  it("scopes a RETAILER/SUPPLIER's query to their own recipient entry and strips other recipients from the response", async () => {
    const doc = makeNotification({
      recipients: [
        { user_ref: 'retailer-1', isRead: false, readAt: null },
        { user_ref: 'someone-else', isRead: true, readAt: new Date() },
      ],
    });
    mockFind.mockResolvedValue([doc]);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
    } as Request;
    const res = mockRes();

    await notificationController.list(req, res);

    expect(mockFind).toHaveBeenCalledWith({
      'recipients.user_ref': 'retailer-1',
    });
    const [sentBody] = (res.send as jest.Mock).mock.calls[0];
    expect(sentBody.data[0].recipients).toEqual([
      { user_ref: 'retailer-1', isRead: false, readAt: null },
    ]);
  });
});

describe('NotificationController.getById', () => {
  it('returns 404 when the notification does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: 'missing' },
    } as unknown as Request;
    const res = mockRes();

    await notificationController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 403 when a non-admin is not one of the recipients', async () => {
    const doc = makeNotification({
      recipients: [{ user_ref: 'someone-else', isRead: false, readAt: null }],
    });
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await notificationController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith({ message: ERRORS.UNAUTHORIZED });
  });

  it('returns the notification, scoped to just their own recipient entry, for a recipient', async () => {
    const doc = makeNotification({
      recipients: [
        { user_ref: 'retailer-1', isRead: false, readAt: null },
        { user_ref: 'someone-else', isRead: true, readAt: new Date() },
      ],
    });
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await notificationController.getById(req, res);

    const [sentBody] = (res.send as jest.Mock).mock.calls[0];
    expect(sentBody.data.recipients).toEqual([
      { user_ref: 'retailer-1', isRead: false, readAt: null },
    ]);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('lets ADMIN fetch any notification in full, regardless of recipients', async () => {
    const doc = makeNotification({
      recipients: [{ user_ref: 'someone-else', isRead: false, readAt: null }],
    });
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: '1' },
    } as unknown as Request;
    const res = mockRes();

    await notificationController.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const [sentBody] = (res.send as jest.Mock).mock.calls[0];
    expect(sentBody.data).toBe(doc);
  });
});

describe('NotificationController.update', () => {
  it('returns 404 when the notification does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: 'missing' },
      body: { title: 'x' },
    } as unknown as Request;
    const res = mockRes();

    await notificationController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("lets ADMIN edit content fields on any notification, ignoring isRead (that's per-recipient)", async () => {
    const doc = makeNotification({
      recipients: [{ user_ref: 'retailer-1', isRead: false, readAt: null }],
    });
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
      params: { _id: '1' },
      body: { title: 'new title', isRead: true },
    } as unknown as Request;
    const res = mockRes();

    await notificationController.update(req, res);

    expect(doc.title).toBe('new title');
    expect(doc.recipients[0].isRead).toBe(false);
    expect(doc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 403 when a non-admin who isn't a recipient tries to patch", async () => {
    const doc = makeNotification({
      recipients: [{ user_ref: 'someone-else', isRead: false, readAt: null }],
      save: jest.fn(),
    });
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
      body: { isRead: true },
    } as unknown as Request;
    const res = mockRes();

    await notificationController.update(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(doc.save).not.toHaveBeenCalled();
  });

  it('lets a recipient mark their own entry read, setting readAt, and ignores content fields', async () => {
    const recipient = { user_ref: 'retailer-1', isRead: false, readAt: null };
    const doc = makeNotification({
      title: 'original title',
      recipients: [recipient],
    });
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
      body: { isRead: true, title: 'hijacked title' },
    } as unknown as Request;
    const res = mockRes();

    await notificationController.update(req, res);

    expect(recipient.isRead).toBe(true);
    expect(recipient.readAt).toBeInstanceOf(Date);
    expect(doc.title).toBe('original title');
    expect(doc.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);

    const [sentBody] = (res.send as jest.Mock).mock.calls[0];
    expect(sentBody.data.recipients).toEqual([recipient]);
  });

  it('marking unread clears readAt', async () => {
    const recipient = {
      user_ref: 'retailer-1',
      isRead: true,
      readAt: new Date('2026-01-01'),
    };
    const doc = makeNotification({ recipients: [recipient] });
    mockFindById.mockResolvedValue(doc);
    const req = {
      meta: { user: { userId: 'retailer-1', roles: ['RETAILER'] } },
      params: { _id: '1' },
      body: { isRead: false },
    } as unknown as Request;
    const res = mockRes();

    await notificationController.update(req, res);

    expect(recipient.isRead).toBe(false);
    expect(recipient.readAt).toBeNull();
  });
});

describe('NotificationController delivery:assigned handling', () => {
  it('notifies the supplier and every participating retailer with tailored messages', async () => {
    mockPoolFindById.mockResolvedValue({
      _id: 'pool-1',
      productoffer_ref: 'offer-1',
    });
    mockOfferFindById.mockResolvedValue({
      _id: 'offer-1',
      user_ref: 'supplier-1',
      name: 'Basmati Rice 25kg',
    });
    mockParticipantDistinct.mockResolvedValue(['retailer-1', 'retailer-2']);
    mockNotificationSave.mockResolvedValue({ _id: 'n' });

    const handler = (notificationController as any).handleDeliveryAssigned.bind(
      notificationController
    );
    await handler({
      deliveryId: 'delivery-1',
      poolId: 'pool-1',
      assignedBy: 'admin-1',
    });

    expect(notificationModel).toHaveBeenCalledTimes(2);

    const supplierCall = (
      notificationModel as unknown as jest.Mock
    ).mock.calls.find((call) =>
      call[0].recipients.some((r: any) => r.user_ref === 'supplier-1')
    );
    expect(supplierCall[0]).toEqual(
      expect.objectContaining({
        sender_ref: 'admin-1',
        recipients: [{ user_ref: 'supplier-1', isRead: false, readAt: null }],
        type: 'DELIVERY_ASSIGNED',
      })
    );
    expect(supplierCall[0].message).toContain('Basmati Rice 25kg');

    const retailerCall = (
      notificationModel as unknown as jest.Mock
    ).mock.calls.find((call) =>
      call[0].recipients.some((r: any) => r.user_ref === 'retailer-1')
    );
    expect(retailerCall[0].recipients).toEqual([
      { user_ref: 'retailer-1', isRead: false, readAt: null },
      { user_ref: 'retailer-2', isRead: false, readAt: null },
    ]);
    expect(retailerCall[0].message).toContain('Basmati Rice 25kg');
  });

  it('skips notifying entirely when the pool no longer exists', async () => {
    mockPoolFindById.mockResolvedValue(null);

    const handler = (notificationController as any).handleDeliveryAssigned.bind(
      notificationController
    );
    await handler({
      deliveryId: 'delivery-1',
      poolId: 'missing-pool',
      assignedBy: 'admin-1',
    });

    expect(mockNotificationSave).not.toHaveBeenCalled();
  });

  it('still notifies retailers when the offer/supplier cannot be resolved', async () => {
    mockPoolFindById.mockResolvedValue({
      _id: 'pool-1',
      productoffer_ref: 'offer-1',
    });
    mockOfferFindById.mockResolvedValue(null);
    mockParticipantDistinct.mockResolvedValue(['retailer-1']);
    mockNotificationSave.mockResolvedValue({ _id: 'n' });

    const handler = (notificationController as any).handleDeliveryAssigned.bind(
      notificationController
    );
    await handler({
      deliveryId: 'delivery-1',
      poolId: 'pool-1',
      assignedBy: 'admin-1',
    });

    expect(notificationModel).toHaveBeenCalledTimes(1);
    expect(
      (notificationModel as unknown as jest.Mock).mock.calls[0][0].recipients
    ).toEqual([{ user_ref: 'retailer-1', isRead: false, readAt: null }]);
  });
});
