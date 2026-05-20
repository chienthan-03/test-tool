import { createHmac } from 'node:crypto';

/** HMAC SHA256 hex signature for Binance signed REST query strings. */
export const signQuery = (queryString: string, apiSecret: string): string =>
  createHmac('sha256', apiSecret).update(queryString).digest('hex');

const toQueryString = (params: Record<string, string | number>): string => {
  const entries = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b));

  return entries.map(([key, value]) => `${key}=${value}`).join('&');
};

/**
 * Builds a signed query string with `timestamp` and `recvWindow`.
 * `recvWindow` must be present in `params` (or defaults to 5000).
 */
export const buildSignedQuery = (
  params: Record<string, string | number>,
  apiSecret: string,
): string => {
  const recvWindow = params.recvWindow ?? 5000;
  const withMeta: Record<string, string | number> = {
    ...params,
    recvWindow,
    timestamp: params.timestamp ?? Date.now(),
  };

  const queryString = toQueryString(withMeta);
  const signature = signQuery(queryString, apiSecret);
  return `${queryString}&signature=${signature}`;
};
