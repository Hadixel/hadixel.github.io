// What the validation pipe says when it refuses a body.
//
// The gateway's error filter trusts exactly one message shape: a `GatewayException`, whose message a
// human wrote for whoever reads it. Everything else gets the Persian copy for its status, so a
// validation failure — which is *always* something the caller did — used to arrive as the generic
// "درخواست نامعتبر است." and the operator was left guessing which of the seven fields was wrong.
//
// That made every Persian `message:` on a DTO decorative. The decorators were doing their job and
// their text was being discarded one layer up, which is worse than not writing it: the DTOs read as
// though they were localised and were not. This factory is what makes them load-bearing — it takes
// the first failure the pipe found, names the field path, and raises it as the gateway's own
// exception so the filter passes the sentence through.
//
// The first failure, not all of them. A form shows one red line, and joining a dozen constraints
// into one string produces a sentence no operator can act on. The panel's actions had the same
// property — they returned the first message — so this preserves what the operator was used to.

import { type ValidationPipeOptions } from "@nestjs/common";
import { type ValidationError } from "class-validator";
import { BadRequestException } from "./exceptions/gateway.exception.js";

/**
 * The one validation configuration, exported so the composition root and the tests cannot disagree.
 *
 * `main.ts` builds the pipe from this and `dto-contract.test.ts` runs the *same pipe* over the same
 * bodies. A test that re-declared these options would be a second copy of the rule, free to drift
 * from the first — and the two options that are easiest to get wrong here (`whitelist` and
 * `forbidNonWhitelisted`) are enforced by the pipe itself rather than by any decorator, so a test
 * that calls `validate()` directly would not exercise them at all and would pass whether or not they
 * were configured.
 */
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  // A field the DTO does not declare is stripped; with `forbidNonWhitelisted` it is also an error.
  // Both, because a silently ignored field is how a client ends up sending `isAdmin` and wondering
  // why it does nothing.
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  // Off: a DTO's own `@Type` decides what a field is, and implicit conversion would let `"12"` become
  // a number on one route and stay a string on another depending on whether a decorator was present.
  transformOptions: { enableImplicitConversion: false },
  exceptionFactory: validationExceptionFactory,
};

/**
 * Turn a pipe rejection into the gateway's bad request.
 *
 * Named and exported rather than inlined in `main.ts` so it can be tested: this is the whole of what
 * a client sees when it sends a bad body, and an untested closure in a composition root is a closure
 * nobody reads.
 */
export function validationExceptionFactory(errors: ValidationError[]): Error {
  const first = errors[0];
  if (!first) return new BadRequestException();
  return new BadRequestException(describe(first));
}

/**
 * The path as the operator's form names it, so the message points at a field they can see.
 *
 * `items.0.productId` rather than "the second item's product id", because the form has a field with
 * that name in it and the operator is looking at the form.
 */
function path(error: ValidationError, prefix = ""): string {
  const here = prefix ? `${prefix}.${error.property}` : error.property;
  const child = error.children?.[0];
  return child ? path(child, here) : here;
}

/**
 * The deepest error in the chain that carries a constraint message of its own.
 *
 * This is the level a nested failure hides its message at, and getting it wrong is quiet. With
 * `@ValidateNested` on an array, class-validator produces a chain — `items`, then one child per
 * element, then that element's own property errors — and only the *last* of those has the decorator's
 * Persian text. Reading `constraints` off the top of the chain finds nothing, so the message silently
 * degraded to a generic "items.0.productId نامعتبر است." while the test that checked the path still
 * passed. The path is useful and the message is the point, so both are read from the same level.
 */
function leafWithMessage(error: ValidationError): ValidationError {
  const child = error.children?.[0];
  if (!child) return error;
  const deeper = leafWithMessage(child);
  return Object.keys(deeper.constraints ?? {}).length > 0 ? deeper : error;
}

/**
 * One sentence naming the field and what is wrong with it.
 *
 * The unknown-field case is separated because it is the one `forbidNonWhitelisted` produces: it is
 * the operator's typo in a field name, which is worth naming precisely, because Nest's own text for it
 * ("property isAdmin should not exist") is a sentence about the server's whitelist rather than about
 * what they typed.
 */
function describe(error: ValidationError): string {
  if (error.constraints?.whitelistValidation) {
    return `فیلد ناشناخته: ${path(error)}`;
  }
  const where = path(error);
  const message = Object.values(leafWithMessage(error).constraints ?? {})[0];
  // A chain with no constraint anywhere — a type the decorators did not describe — still has to
  // produce something better than the status line this replaced, or the factory is a second way to
  // lose the message.
  return message ? `${where}: ${message}` : `${where} نامعتبر است.`;
}
