/** Thrown for an event we can make no sense of, so it is never retried. */
export class BrokenEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokenEventError";
  }
}

/**
 * Errors that mean this particular event is unusable.
 */
const BROKEN_EVENT_ERRORS = new Set(["BrokenEventError", "ConditionalCheckFailedException", "ValidationException"]);
export const isBrokenEvent = (err: unknown): boolean => err instanceof Error && BROKEN_EVENT_ERRORS.has(err.name);

export const describeError = (err: unknown): string =>
  err instanceof Error ? `${err.name}: ${err.message}` : String(err);

/** What lands in the rejected queue: enough to act on without the logs. */
export type RejectedImageEvent = {
  /** When the trigger gave up on it. */
  rejectedAt: string;
  /** The object keys that go unrecorded as a result. */
  keys: string[];
  /** The product the keys were filed under, absent when the key had no usable id. */
  productId?: string;
  /** The error that condemned them. */
  reason: string;
};
