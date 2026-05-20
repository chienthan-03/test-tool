import { describe, it, expect } from 'vitest';
import { buildSignedQuery, signQuery } from '../../src/execution/binance-sign.js';

/** Binance-style example query + secret (HMAC-SHA256 documented pattern). */
const EXAMPLE_QUERY =
  'symbol=LTCUSDT&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319550';
const EXAMPLE_SECRET = 'NhqPtMDKjXIxX6USDt1YnpTcsouBMrF2jMKvXSLGVufCrosNBUzzsyaWTafLe8MqV';
const EXAMPLE_SIGNATURE = '89e6c2b784c78a1dae8a986ec790b1d81a8a674b772a9fe13e78bc0564da3ac3';

describe('binance-sign', () => {
  it('signQuery returns HMAC SHA256 hex for a known query and secret', () => {
    expect(signQuery(EXAMPLE_QUERY, EXAMPLE_SECRET)).toBe(EXAMPLE_SIGNATURE);
  });

  it('buildSignedQuery sorts params, signs, and appends signature', () => {
    const sortedQuery =
      'price=0.1&quantity=1&recvWindow=5000&side=BUY&symbol=LTCUSDT&timeInForce=GTC&timestamp=1499827319550&type=LIMIT';
    const sortedSignature = '2a3f7ee2b2b1ec9b18d1f4837fa04cf1260dae4200e28444c76785335f6d9419';

    const signed = buildSignedQuery(
      {
        symbol: 'LTCUSDT',
        side: 'BUY',
        type: 'LIMIT',
        timeInForce: 'GTC',
        quantity: 1,
        price: 0.1,
        recvWindow: 5000,
        timestamp: 1499827319550,
      },
      EXAMPLE_SECRET,
    );

    expect(signed).toBe(`${sortedQuery}&signature=${sortedSignature}`);
    expect(signQuery(sortedQuery, EXAMPLE_SECRET)).toBe(sortedSignature);
  });
});
