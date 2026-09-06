import thawaniGateway, {
  ThawaniGatewayError,
  isSessionPaid,
} from '../../src/services/thawani/thawani.gateway';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('ThawaniGateway.createCheckoutSession', () => {
  it('posts to /checkout/session with the thawani-api-key header and returns the unwrapped data', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { session_id: 'sess-1' } }));
    global.fetch = mockFetch as unknown as typeof fetch;

    const session = await thawaniGateway.createCheckoutSession({
      clientReferenceId: 'payment-1',
      products: [{ name: 'Rice', quantity: 2, unit_amount: 5000 }],
      successUrl: 'https://app.example/success',
      cancelUrl: 'https://app.example/cancel',
    });

    expect(session).toEqual({ session_id: 'sess-1' });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/checkout/session');
    expect(init.method).toBe('POST');
    expect(
      (init.headers as Record<string, string>)['thawani-api-key']
    ).toBeDefined();
    const body = JSON.parse(init.body as string);
    expect(body).toEqual(
      expect.objectContaining({
        client_reference_id: 'payment-1',
        mode: 'payment',
        products: [{ name: 'Rice', quantity: 2, unit_amount: 5000 }],
        success_url: 'https://app.example/success',
        cancel_url: 'https://app.example/cancel',
      })
    );
  });

  it('throws ThawaniGatewayError on a non-2xx response', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(400, { description: 'bad request' })
      ) as unknown as typeof fetch;

    await expect(
      thawaniGateway.createCheckoutSession({
        clientReferenceId: 'payment-1',
        products: [{ name: 'Rice', quantity: 1, unit_amount: 5000 }],
        successUrl: 'https://app.example/success',
        cancelUrl: 'https://app.example/cancel',
      })
    ).rejects.toBeInstanceOf(ThawaniGatewayError);
  });

  it('throws ThawaniGatewayError when the network request itself fails', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;

    await expect(
      thawaniGateway.createCheckoutSession({
        clientReferenceId: 'payment-1',
        products: [{ name: 'Rice', quantity: 1, unit_amount: 5000 }],
        successUrl: 'https://app.example/success',
        cancelUrl: 'https://app.example/cancel',
      })
    ).rejects.toBeInstanceOf(ThawaniGatewayError);
  });
});

describe('ThawaniGateway.createRefund', () => {
  it('posts payment_id and reason to /refunds', async () => {
    const mockFetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(200, { data: { refund_id: 'refund-1' } })
      );
    global.fetch = mockFetch as unknown as typeof fetch;

    const refund = await thawaniGateway.createRefund({
      paymentId: 'thawani-pay-1',
      reason: 'Pool did not reach its target',
    });

    expect(refund).toEqual({ refund_id: 'refund-1' });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/refunds');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      payment_id: 'thawani-pay-1',
      reason: 'Pool did not reach its target',
    });
  });
});

describe('isSessionPaid', () => {
  it('is true only for an exact "paid" status', () => {
    expect(isSessionPaid({ session_id: 's', payment_status: 'paid' })).toBe(
      true
    );
  });

  it('is false for unpaid, unrecognized, or missing statuses', () => {
    expect(isSessionPaid({ session_id: 's', payment_status: 'unpaid' })).toBe(
      false
    );
    expect(
      isSessionPaid({ session_id: 's', payment_status: 'something-else' })
    ).toBe(false);
    expect(isSessionPaid({ session_id: 's' })).toBe(false);
  });
});

describe('ThawaniGateway.checkoutUrl', () => {
  it('builds the /pay/{session_id} redirect URL', () => {
    const url = thawaniGateway.checkoutUrl('sess-1');
    expect(url).toContain('/pay/sess-1');
  });
});
