/**
 * The few things every agent API route shares: the error that becomes a
 * JSON `{error: {code, message}}` with a status, and the one way a response
 * is sent. Split out of agent.ts so the accommodation routes can use them
 * without a circular import.
 */

import type { Response } from 'express';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** Who is calling, as the token says. */
export interface Caller {
  uid: string;
  editTimeline: boolean;
}

export function send(res: Response, status: number, body: unknown): void {
  res.status(status).set('Cache-Control', 'no-store').json(body);
}
