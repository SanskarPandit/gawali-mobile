import { isAxiosError } from 'axios';

/**
 * Turns an API failure into one human-readable sentence.
 *
 * The backend answers with either `{ detail }` or its envelope
 * `{ message, errors: { field: [msg] } }`; field errors are the most specific, so they win.
 */
export const getApiErrorMessage = (err: unknown, fallback: string): string => {
  if (!isAxiosError(err)) {
    return err instanceof Error && err.message ? err.message : fallback;
  }
  if (!err.response) {
    return 'Cannot reach the Gawali server. Check your internet connection and try again.';
  }

  const data: any = err.response.data;
  const errors = data?.errors;
  if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
    for (const value of Object.values(errors)) {
      const msg = Array.isArray(value) ? value[0] : value;
      if (typeof msg === 'string' && msg) {
        return msg;
      }
    }
  }
  if (typeof data?.detail === 'string') return data.detail;
  if (typeof data?.message === 'string') return data.message;
  return fallback;
};
