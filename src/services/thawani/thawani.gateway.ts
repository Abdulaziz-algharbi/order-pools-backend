import config from '../../config/config';
import logger from '../../logger/logger';

// Thin wrapper around Thawani's (https://thawani.om) hosted-checkout API —
// an Oman-only payment gateway with no concept of marketplace/vendor
// payouts (verified against every endpoint category its API exposes:
// sessions, customers, payments, refunds — none of it moves money onward
// to a third party). This gateway only ever moves money between a
// retailer and OrderPools' own Thawani merchant account; see
// supplier.payouts for how a supplier is actually paid (manually, outside
// this API).
//
// Amounts on the wire are always baisa (1 OMR = 1000 baisa), never OMR
// directly — every method here takes/returns baisa so a caller can't
// accidentally send an unconverted amount.
//
// Confidence note: the primary Thawani docs (Stoplight/docs.thawani.om)
// were unreachable while this was written (blocked, no content served) —
// the base URLs, auth header, session/refund endpoint shapes below are
// cross-checked across independent third-party integration write-ups that
// agree with each other, not read from the primary spec directly. Verify
// against a live UAT call before relying on this in production.

export interface ThawaniProduct {
  name: string;
  quantity: number;
  unit_amount: number; // baisa
}

export interface CreateSessionInput {
  clientReferenceId: string;
  products: ThawaniProduct[];
  successUrl: string;
  cancelUrl: string;
}

export interface ThawaniSession {
  session_id: string;
  client_reference_id?: string;
  payment_status?: string;
  invoice?: string;
  [key: string]: unknown;
}

export interface CreateRefundInput {
  paymentId: string;
  reason?: string;
}

export interface ThawaniRefund {
  refund_id?: string;
  status?: string;
  [key: string]: unknown;
}

export class ThawaniGatewayError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ThawaniGatewayError';
  }
}

class ThawaniGateway {
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${config.thawaniApiBaseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          'thawani-api-key': config.thawaniSecretKey,
          ...(init.headers || {}),
        },
      });
    } catch (error) {
      logger.error(`Thawani request to ${path} failed: ${error}`);
      throw new ThawaniGatewayError(
        'Could not reach the payment provider',
        error
      );
    }

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      logger.error(
        `Thawani request to ${path} returned ${response.status}: ${JSON.stringify(body)}`
      );
      throw new ThawaniGatewayError(
        `Payment provider returned ${response.status}`,
        body
      );
    }

    return (body?.data ?? body) as T;
  }

  // Creates a hosted checkout session for one pool contribution. `products`
  // is a single-item array by convention here (one line item: the pool's
  // offer, at the retailer's claimed quantity) — Thawani's API itself
  // supports multiple line items, this gateway just never needs more than
  // one for this workflow.
  createCheckoutSession(input: CreateSessionInput): Promise<ThawaniSession> {
    return this.request<ThawaniSession>('/checkout/session', {
      method: 'POST',
      body: JSON.stringify({
        client_reference_id: input.clientReferenceId,
        mode: 'payment',
        products: input.products,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      }),
    });
  }

  getSession(sessionId: string): Promise<ThawaniSession> {
    return this.request<ThawaniSession>(`/checkout/session/${sessionId}`);
  }

  // The URL the retailer is sent to in order to actually pay.
  checkoutUrl(sessionId: string): string {
    return `${config.thawaniCheckoutBaseUrl}/pay/${sessionId}?key=${config.thawaniPublishableKey}`;
  }

  // Requests a full refund of one payment. A 2xx response only confirms
  // Thawani *accepted the request* — see payments.controller.ts for why
  // actual completion is confirmed by an admin rather than polled
  // automatically (the refund-status response schema isn't confirmed).
  createRefund(input: CreateRefundInput): Promise<ThawaniRefund> {
    return this.request<ThawaniRefund>('/refunds', {
      method: 'POST',
      body: JSON.stringify({
        payment_id: input.paymentId,
        reason: input.reason ?? 'Pool did not reach its target',
      }),
    });
  }

  getRefund(refundId: string): Promise<ThawaniRefund> {
    return this.request<ThawaniRefund>(`/refunds/${refundId}`);
  }
}

// Only a positive 'paid' confirmation is ever trusted to mean success.
// Anything else (an unrecognized status, a still-pending one, or the
// unconfirmed exact spelling of a "this will never be paid" status) is
// deliberately NOT treated as a definite failure — see
// PaymentController.cancel for why failure is instead always an explicit
// action (the retailer landing on cancel_url, or an admin clearing a
// stuck session) rather than inferred from Thawani's response.
export function isSessionPaid(session: ThawaniSession): boolean {
  return session.payment_status === 'paid';
}

const thawaniGateway = new ThawaniGateway();

export default thawaniGateway;
