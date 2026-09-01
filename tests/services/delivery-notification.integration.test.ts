import { Request, Response } from 'express';

// Unlike deliveries.controller.test.ts (which only asserts the event is
// emitted) and the `delivery:assigned handling` block in
// notifications.controller.test.ts (which calls handleDeliveryAssigned
// directly, bypassing AppBroker), this test wires both singleton
// controllers together through the *real* AppBroker — the same object
// both modules import in production — and drives the flow from the
// deliveries endpoint, to prove the notification listener actually fires
// exactly once per DELIVERY_ASSIGNED event.

const mockDeliverySave = jest.fn();
const mockNotificationSave = jest.fn();

jest.mock('../../src/services/deliveries/delivery.model', () => {
  const actual = jest.requireActual(
    '../../src/services/deliveries/delivery.model'
  );
  const MockDeliveryModel: any = jest.fn().mockImplementation(function (
    this: any,
    data: any
  ) {
    Object.assign(this, data);
    this.save = mockDeliverySave;
  });
  MockDeliveryModel.modelName = 'Delivery';
  MockDeliveryModel.findOne = jest.fn();
  return {
    __esModule: true,
    default: MockDeliveryModel,
    couldBeUpdated: actual.couldBeUpdated,
  };
});

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

jest.mock(
  '../../src/services/pool.participants/pool.participant.model',
  () => ({
    __esModule: true,
    default: { distinct: jest.fn() },
  })
);

jest.mock('../../src/services/product.offers/product.offer.model', () => ({
  __esModule: true,
  default: { findById: jest.fn(), distinct: jest.fn() },
}));

import deliveryController from '../../src/services/deliveries/deliveries.controller';
import notificationController from '../../src/services/notifications/notifications.controller';
import deliveryModel from '../../src/services/deliveries/delivery.model';
import notificationModel from '../../src/services/notifications/notification.model';
import poolModel from '../../src/services/pools/pool.model';
import poolParticipantModel from '../../src/services/pool.participants/pool.participant.model';
import productOfferModel from '../../src/services/product.offers/product.offer.model';

const mockFindOne = deliveryModel.findOne as unknown as jest.Mock;
const mockPoolFindById = poolModel.findById as unknown as jest.Mock;
const mockParticipantDistinct =
  poolParticipantModel.distinct as unknown as jest.Mock;
const mockOfferFindById = productOfferModel.findById as unknown as jest.Mock;

function mockRes() {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('POST /deliveries -> notifications (wired through the real AppBroker)', () => {
  it('fires the delivery-assigned notification handler exactly once and notifies the supplier + retailers', async () => {
    mockPoolFindById.mockResolvedValue({
      _id: 'pool-1',
      status: 'TARGET_REACHED',
      productoffer_ref: 'offer-1',
    });
    mockFindOne.mockResolvedValue(null);
    mockDeliverySave.mockResolvedValue({ _id: 'delivery-1' });
    mockOfferFindById.mockResolvedValue({
      _id: 'offer-1',
      user_ref: 'supplier-1',
      name: 'Basmati Rice 25kg',
    });
    mockParticipantDistinct.mockResolvedValue(['retailer-1', 'retailer-2']);
    mockNotificationSave.mockResolvedValue({ _id: 'notif' });

    const handleSpy = jest.spyOn(
      notificationController as any,
      'handleDeliveryAssigned'
    );

    const req = {
      body: { pool_ref: 'pool-1' },
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
    } as unknown as Request;
    const res = mockRes();

    await deliveryController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    // The AppBroker listener runs synchronously on emit but is async
    // internally — assert it fired exactly once, then wait for it to
    // actually finish before checking its side effects.
    expect(handleSpy).toHaveBeenCalledTimes(1);
    await handleSpy.mock.results[0].value;

    // One notification doc for the supplier, one batched doc for the
    // participating retailers — created exactly once each, not duplicated.
    expect(notificationModel).toHaveBeenCalledTimes(2);
    expect(mockNotificationSave).toHaveBeenCalledTimes(2);

    const recipientSets = (notificationModel as unknown as jest.Mock).mock.calls
      .map((call) => call[0].recipients.map((r: any) => r.user_ref))
      .sort();
    expect(recipientSets).toEqual([
      ['retailer-1', 'retailer-2'],
      ['supplier-1'],
    ]);
  });

  it('does not fire any notification when the pool has not reached target', async () => {
    mockPoolFindById.mockResolvedValue({ _id: 'pool-1', status: 'OPEN' });

    const handleSpy = jest.spyOn(
      notificationController as any,
      'handleDeliveryAssigned'
    );

    const req = {
      body: { pool_ref: 'pool-1' },
      meta: { user: { userId: 'admin-1', roles: ['ADMIN'] } },
    } as unknown as Request;
    const res = mockRes();

    await deliveryController.create(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(handleSpy).not.toHaveBeenCalled();
    expect(notificationModel).not.toHaveBeenCalled();
  });
});
