import type { ApiErrorBody } from '@backlog/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Query;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.size ? `?${params}` : '';

  let res: Response;
  try {
    res = await fetch(`/api${path}${qs}`, {
      method: opts.method ?? 'GET',
      headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'No se pudo conectar con el servidor');
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? `HTTP_${res.status}`,
      data?.error?.message ?? res.statusText,
      data?.error?.details,
    );
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details) && err.details[0]?.message) {
      return err.details[0].message as string;
    }
    return err.message;
  }
  return 'Ocurrió un error inesperado';
}
