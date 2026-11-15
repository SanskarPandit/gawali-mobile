const ACCESS = 'gawali.access';
const REFRESH = 'gawali.refresh';

export class ApiError extends Error {
  status: number;
  fields: Record<string, string[]>;
  constructor(message: string, status: number, fields: Record<string, string[]> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
  /** First message for a field, for inline form errors. */
  field(name: string): string | undefined {
    return this.fields[name]?.[0];
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* private mode: tokens live for this tab only */
  }
}

let memoryAccess: string | null = read(ACCESS);
let memoryRefresh: string | null = read(REFRESH);
let refreshing: Promise<boolean> | null = null;
let onLogout: (() => void) | null = null;

export const tokens = {
  set(access: string, refresh: string) {
    memoryAccess = access;
    memoryRefresh = refresh;
    write(ACCESS, access);
    write(REFRESH, refresh);
  },
  clear() {
    memoryAccess = memoryRefresh = null;
    write(ACCESS, null);
    write(REFRESH, null);
  },
  get access() {
    return memoryAccess;
  },
  get refresh() {
    return memoryRefresh;
  },
  onLogout(cb: () => void) {
    onLogout = cb;
  },
};

async function refreshAccess(): Promise<boolean> {
  if (!memoryRefresh) return false;
  refreshing ??= fetch('/api/v1/auth/token/refresh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: memoryRefresh }),
  })
    .then(async (r) => {
      if (!r.ok) return false;
      const data = await r.json();
      tokens.set(data.access, data.refresh ?? memoryRefresh!);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function flattenErrors(body: any): { message: string; fields: Record<string, string[]> } {
  const errors = body?.errors ?? body ?? {};
  const fields: Record<string, string[]> = {};
  if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
    for (const [k, v] of Object.entries(errors)) {
      if (k === 'detail' || k === 'success' || k === 'status_code' || k === 'message') continue;
      fields[k] = Array.isArray(v) ? v.map(String) : [String(v)];
    }
  }
  const firstField = Object.values(fields)[0]?.[0];
  const generic = 'Validation or processing error occurred.';
  let message = body?.message && body.message !== generic ? body.message : errors?.detail ?? firstField ?? body?.message;
  if (!message || message === generic) message = firstField ?? 'Something went wrong. Please try again.';
  return { message: String(message), fields };
}

type Options = { method?: string; body?: unknown; form?: FormData; raw?: boolean; auth?: boolean };

export async function api<T = any>(path: string, opts: Options = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.auth !== false && memoryAccess) headers.Authorization = `Bearer ${memoryAccess}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(path, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body });
  } catch {
    throw new ApiError('You appear to be offline. Check your connection and try again.', 0);
  }

  if (res.status === 401 && retry && opts.auth !== false) {
    if (await refreshAccess()) return api<T>(path, opts, false);
    tokens.clear();
    onLogout?.();
    throw new ApiError('Your session has ended. Please sign in again.', 401);
  }
  if (opts.raw) {
    if (!res.ok) throw new ApiError('Download failed.', res.status);
    return res as unknown as T;
  }
  if (res.status === 204 || res.status === 205) return undefined as T;
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const { message, fields } = flattenErrors(data);
    throw new ApiError(res.status >= 500 ? 'The server had a problem. Please try again in a moment.' : message, res.status, fields);
  }
  return data as T;
}

export const get = <T = any>(path: string) => api<T>(path);
export const post = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: body ?? {} });
export const patch = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });
export const upload = <T = any>(path: string, form: FormData) => api<T>(path, { method: 'POST', form });

/** Fetch an authenticated file and hand it to the browser as a download. */
export async function download(path: string, filename: string) {
  const res = await api<Response>(path, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function qs(params: Record<string, string | number | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : '';
}
