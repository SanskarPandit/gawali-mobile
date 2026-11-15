import type { BaseQueryFn } from '@reduxjs/toolkit/query';
import { isAxiosError } from 'axios';
import { apiClient } from './apiClient';
import { getApiErrorMessage } from './errors';
import { handleDemoRequest } from './demo/demoServer';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ApiArgs {
  url: string;
  method?: HttpMethod;
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null>;
}

export interface ApiError {
  /** HTTP status, or 'NETWORK' when the server could not be reached. */
  status: number | 'NETWORK';
  message: string;
  /** Per-field validation messages, keyed by API field name. */
  fieldErrors: Record<string, string>;
}

const MAX_READ_RETRIES = 2;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const cleanParams = (params?: ApiArgs['params']) =>
  params
    ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
    : undefined;

/** Pulls `{ field: ["msg"] }` validation errors out of either backend error shape. */
export const extractFieldErrors = (data: unknown): Record<string, string> => {
  if (!data || typeof data !== 'object') return {};
  const source = (data as any).errors && typeof (data as any).errors === 'object' ? (data as any).errors : data;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (['detail', 'message', 'success', 'status_code', 'code', 'non_field_errors'].includes(key)) continue;
    const msg = Array.isArray(value) ? value[0] : value;
    if (typeof msg === 'string') out[key] = msg;
  }
  return out;
};

const toApiError = (err: unknown): ApiError => {
  if (isAxiosError(err)) {
    return {
      status: err.response?.status ?? 'NETWORK',
      message: getApiErrorMessage(err, 'Something went wrong. Please try again.'),
      fieldErrors: extractFieldErrors(err.response?.data),
    };
  }
  return { status: 500, message: err instanceof Error ? err.message : 'Something went wrong.', fieldErrors: {} };
};

const isRetryable = (error: ApiError) => error.status === 'NETWORK' || (typeof error.status === 'number' && error.status >= 500);

/**
 * Base query for every Gawali endpoint.
 * - Demo sessions are answered by the in-app demo server (no network).
 * - Live sessions go through the authenticated axios client (token refresh included).
 * - Reads retry on network/server errors with backoff; writes never auto-retry (they are not all idempotent).
 */
export const appBaseQuery: BaseQueryFn<ApiArgs, unknown, ApiError> = async (args, api) => {
  const auth = (api.getState() as { auth: { sessionMode: 'live' | 'demo' | null } }).auth;
  if (auth.sessionMode === 'demo') {
    return handleDemoRequest(args);
  }

  const method = args.method ?? 'GET';
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await apiClient.request({
        url: args.url,
        method,
        data: args.body,
        params: cleanParams(args.params),
      });
      return { data: res.data };
    } catch (err) {
      const error = toApiError(err);
      if (method === 'GET' && attempt < MAX_READ_RETRIES && isRetryable(error) && !api.signal.aborted) {
        await wait(600 * 2 ** attempt);
        continue;
      }
      return { error };
    }
  }
};
