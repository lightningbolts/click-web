import { NextResponse } from 'next/server';

export type ApiErrorBody = {
  error: string;
  code?: string;
};

/** Standard JSON error envelope used by API routes. */
export function apiError(
  error: string,
  status: number,
  code?: string,
  headers?: HeadersInit,
): NextResponse {
  const body: ApiErrorBody = code ? { error, code } : { error };
  return NextResponse.json(body, { status, headers });
}
