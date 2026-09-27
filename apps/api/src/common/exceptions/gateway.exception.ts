import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * The base every domain exception extends.
 *
 * It exists so the error filter has exactly two cases to handle: an exception that deliberately
 * carries a Persian message for a shopper, and everything else. The alternative — inspecting
 * `HttpException.message` and guessing whether the text was chosen or defaulted — leaks Nest's
 * English ("Bad Request Exception", "Cannot GET /nope") straight through the envelope, because
 * `HttpException` does not set `name`, so a message can never be told from a class name.
 *
 * A message on this class is shown to a customer. Write it as Persian prose, not as a log line.
 */
export abstract class GatewayException extends HttpException {
  protected constructor(status: HttpStatus, message: string) {
    super(message, status);
  }
}

export class NotFoundException extends GatewayException {
  constructor(message = "موردی که خواستید پیدا نشد.") {
    super(HttpStatus.NOT_FOUND, message);
  }
}

export class ConflictException extends GatewayException {
  constructor(message = "این کار قبلاً انجام شده است.") {
    super(HttpStatus.CONFLICT, message);
  }
}

export class BadRequestException extends GatewayException {
  constructor(message = "درخواست نامعتبر است.") {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

export class UnauthorizedException extends GatewayException {
  constructor(message = "برای ادامه باید وارد حساب خود شوید.") {
    super(HttpStatus.UNAUTHORIZED, message);
  }
}

/**
 * The caller is known, and is not allowed to do this.
 *
 * Distinct from `UnauthorizedException` on purpose. 401 means "who are you" and sends a client to log
 * in; 403 means "we know who you are, and the answer is still no", and sending that to a login screen
 * is how an operator ends up logging in four times in a row against a permission that was never the
 * problem.
 */
export class ForbiddenException extends GatewayException {
  constructor(message = "به این بخش دسترسی ندارید.") {
    super(HttpStatus.FORBIDDEN, message);
  }
}
