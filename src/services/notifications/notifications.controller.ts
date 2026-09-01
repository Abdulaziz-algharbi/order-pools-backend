import { Request, Response } from 'express';
import BaseController from '../base/base.controller';
import ERRORS from '../../constants/ERRORS';
import EVENTS, { DeliveryAssignedEvent } from '../../constants/EVENTS';
import poolModel from '../pools/pool.model';
import productOfferModel from '../product.offers/product.offer.model';
import poolParticipantModel from '../pool.participants/pool.participant.model';
import notificationModel, {
  couldBeUpdated,
  NotificationType,
} from './notification.model';

// ADMIN may edit a notification's content; a recipient may only patch
// their own recipients[].isRead — see update().
const ADMIN_UPDATABLE_FIELDS = couldBeUpdated;

interface NotifyInput {
  senderId?: string | null;
  recipientIds: string[];
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string | null;
  priority?: 'LOW' | 'NORMAL' | 'HIGH';
}

class NotificationController extends BaseController {
  constructor() {
    super(notificationModel, couldBeUpdated);
    this.logger.info('Notification initialized');
  }

  // The one place a notification actually gets created — reused by the
  // admin-facing create() below and by every business-event handler in
  // listeners(), so notification logic never has to live inside another
  // service's controller.
  private async notify(input: NotifyInput) {
    const doc = new this.model({
      sender_ref: input.senderId ?? null,
      recipients: input.recipientIds.map((id) => ({
        user_ref: id,
        isRead: false,
        readAt: null,
      })),
      type: input.type,
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl ?? null,
      priority: input.priority,
    });
    return doc.save();
  }

  // Strips every recipient entry except the caller's own, so a RETAILER/
  // SUPPLIER response never reveals who else a notification went to, or
  // their read state.
  private scopeToRecipient(doc: any, userId: string) {
    const obj = doc.toObject();
    obj.recipients = obj.recipients.filter(
      (r: { user_ref: { toString(): string } }) =>
        r.user_ref.toString() === userId
    );
    return obj;
  }

  // POST /notifications — ADMIN only (enforced by requireRole on the
  // route). sender_ref is always the caller, never client-supplied.
  async create(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const saved = await this.notify({
        senderId: user.userId,
        recipientIds: req.body.recipient_ref,
        type: req.body.type,
        title: req.body.title,
        message: req.body.message,
        actionUrl: req.body.actionUrl,
        priority: req.body.priority,
      });

      this.logger.info(`${this.model.modelName} created`);
      res.status(201).send({
        message: 'Document created successfully',
        data: saved,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // ADMIN sees every notification, in full. A RETAILER/SUPPLIER sees only
  // notifications they're a recipient of, and only their own recipient
  // entry within each.
  async list(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const isAdmin = user.roles.includes('ADMIN');
      const filter = isAdmin ? {} : { 'recipients.user_ref': user.userId };

      const docs = await this.model.find(filter);
      const data = isAdmin
        ? docs
        : docs.map((doc) => this.scopeToRecipient(doc, user.userId));

      this.logger.info(`${this.model.modelName} Retrieved`);
      res.status(200).send({
        message: 'Documents retrieved successfully',
        data,
        total: data.length,
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // Same visibility/scoping rule as list(), applied to a single document.
  async getById(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const doc = await this.model.findById(req.params._id);
      if (!doc) {
        res.status(404).send({ message: 'Document not Found', data: null });
        return;
      }

      const isAdmin = user.roles.includes('ADMIN');
      if (!isAdmin) {
        const isRecipient = doc.recipients.some(
          (r: { user_ref: { toString(): string } }) =>
            r.user_ref.toString() === user.userId
        );
        if (!isRecipient) {
          res.status(403).send({ message: ERRORS.UNAUTHORIZED });
          return;
        }
      }

      res.status(200).send({
        message: 'Document retrieved successfully',
        data: isAdmin ? doc : this.scopeToRecipient(doc, user.userId),
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // ADMIN may edit a notification's content (title/message/actionUrl/
  // priority), on any notification. A RETAILER/SUPPLIER who is a
  // recipient may only patch their own recipients[].isRead (marking it
  // read/unread) — never the content, and never another recipient's
  // state. Written directly (rather than delegating to
  // BaseController.update, which only knows one static allowed-fields
  // list) since both the allowed fields and their target depend on which
  // caller is making the request.
  async update(req: Request, res: Response): Promise<void> {
    try {
      const user = req.meta.user;
      if (!user) {
        res.status(401).send({ message: 'Access token is missing' });
        return;
      }

      const doc = await this.model.findById(req.params._id);
      if (!doc) {
        res.status(404).send({ message: 'Document not Found', data: null });
        return;
      }

      const isAdmin = user.roles.includes('ADMIN');

      if (isAdmin) {
        for (const field of Object.keys(req.body)) {
          if (ADMIN_UPDATABLE_FIELDS.includes(field)) {
            doc[field] = req.body[field];
          }
        }
      } else {
        const recipient = doc.recipients.find(
          (r: { user_ref: { toString(): string } }) =>
            r.user_ref.toString() === user.userId
        );
        if (!recipient) {
          res.status(403).send({ message: ERRORS.UNAUTHORIZED });
          return;
        }
        if (typeof req.body.isRead === 'boolean') {
          recipient.isRead = req.body.isRead;
          recipient.readAt = req.body.isRead ? new Date() : null;
        }
      }

      await doc.save();

      this.logger.info(`${this.model.modelName} Updated`);
      res.status(200).send({
        message: 'Document updated successfully',
        data: isAdmin ? doc : this.scopeToRecipient(doc, user.userId),
      });
    } catch (error) {
      this.errorHandler(error, req, res);
    }
  }

  // Subscribed once, at construction (BaseController's constructor calls
  // this.listeners() if defined) — the one place a business event turns
  // into notifications, keeping that logic out of the controllers that
  // raise the events. AppBroker is an in-process EventEmitter today, but
  // every producer/consumer only ever sees .emit()/.on(), so swapping it
  // for a real message broker later needs no change here.
  listeners() {
    this.broker.on(
      EVENTS.DELIVERY_ASSIGNED,
      async (event: DeliveryAssignedEvent) => {
        try {
          await this.handleDeliveryAssigned(event);
        } catch (error) {
          // EventEmitter does not await listeners — never let a failure
          // here propagate back into whatever raised the event (the
          // delivery itself already succeeded and must not be affected).
          this.logger.error(
            `${EVENTS.DELIVERY_ASSIGNED} notification failed: ${error}`
          );
        }
      }
    );
  }

  // Resolves the pool's supplier (via ProductOffer.user_ref) and every
  // participating retailer (via PoolParticipant), then notifies each
  // audience with a message tailored to them — a supplier needs to know
  // to fulfil the order, a retailer that their order is on its way.
  private async handleDeliveryAssigned(event: DeliveryAssignedEvent) {
    const pool = await poolModel.findById(event.poolId);
    if (!pool) {
      this.logger.warn(
        `${EVENTS.DELIVERY_ASSIGNED}: pool ${event.poolId} not found, skipping notifications`
      );
      return;
    }

    const [offer, retailerIds] = await Promise.all([
      productOfferModel.findById(pool.productoffer_ref),
      poolParticipantModel.distinct('user_ref', { pool_ref: event.poolId }),
    ]);

    const offerName = offer?.name ?? 'your product offer';
    const actionUrl = `/deliveries/${event.deliveryId}`;
    const notifications: Promise<unknown>[] = [];

    if (offer?.user_ref) {
      notifications.push(
        this.notify({
          senderId: event.assignedBy,
          recipientIds: [offer.user_ref.toString()],
          type: 'DELIVERY_ASSIGNED',
          title: 'Delivery assigned',
          message: `A delivery has been assigned for your pool "${offerName}". Prepare the order for fulfillment.`,
          actionUrl,
          priority: 'HIGH',
        })
      );
    }

    if (retailerIds.length > 0) {
      notifications.push(
        this.notify({
          senderId: event.assignedBy,
          recipientIds: retailerIds.map(String),
          type: 'DELIVERY_ASSIGNED',
          title: 'Your delivery is on its way',
          message: `The delivery for "${offerName}" has been assigned and is being prepared.`,
          actionUrl,
          priority: 'NORMAL',
        })
      );
    }

    if (notifications.length === 0) {
      this.logger.warn(
        `${EVENTS.DELIVERY_ASSIGNED}: no recipients resolved for pool ${event.poolId}`
      );
      return;
    }

    await Promise.all(notifications);
  }
}

const notificationController = new NotificationController();

export default notificationController;
