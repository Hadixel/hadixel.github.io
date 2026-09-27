// The one result shape every server action returns.
//
// Three existed. `ActionState` was `{ ok?, error?, message?, id? }` with all four optional, so nothing
// stopped an action returning `{}` — a success with no `ok`, which a form reading `state.ok` treats as
// a failure and shows nothing for, or a failure with no `error`, which shows an empty red box. The
// delete actions returned `{ ok: true }` with no message. The route handlers returned
// `{ error: string }` with an HTTP status, and two of them spelled the failure `invalid_origin` as a
// code the browser was expected to know.
//
// The shape is a discriminated union rather than four optional fields, because the optionals were the
// bug: `ok: true` and `ok: false` as literal values make it a type error to return one from a function
// that promises the other, and it makes `{ ok: false }` without a message impossible to write rather
// than merely easy to miss. A form can switch on `result.ok` and get both branches narrowed.
//
// `data` is present on success and absent on failure, which is the same bargain: a caller cannot read a
// value out of a result that failed without checking first.

/** What an action reports when it worked. */
export interface ActionOk<T = undefined> {
  ok: true;
  /** A sentence for the operator. Required, because the alternative is a form that reports nothing. */
  message: string;
  data?: T;
}

/** What an action reports when it did not. */
export interface ActionFail {
  ok: false;
  /** A sentence for the operator, in Persian, naming what to do next. */
  error: string;
}

export type ActionResult<T = undefined> = ActionOk<T> | ActionFail;

/** The initial state `useActionState` needs, and the answer to "has this run yet?". */
export const idle: ActionResult = { ok: true, message: "" };

export const succeeded = <T = undefined>(message: string, data?: T): ActionOk<T> =>
  data === undefined ? { ok: true, message } : { ok: true, message, data };

export const failed = (error: string): ActionFail => ({ ok: false, error });

/**
 * Narrowing for a caller that has to read `data`.
 *
 * Exists so the common "render the value, or the error" site is one call rather than a hand-written
 * `if (result.ok) { ... }` at each of them, which is how the check gets forgotten and `undefined`
 * reaches something that expected a product.
 */
export function valueOr<T>(result: ActionResult<T>, fallback: T): T {
  return result.ok && result.data !== undefined ? result.data : fallback;
}
