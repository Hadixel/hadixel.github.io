import {
  Catch,
  type ArgumentsHost,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { GatewayException } from "../exceptions/gateway.exception.js";

/**
 * The one error shape the gateway returns for everything that fails.
 *
 * §7.4 makes this a global filter rather than per-route error handling, and the reason is that a
 * client cannot write correct error handling against a shape it has to guess. Every failure —
 * a validation pipe rejection, a thrown HttpException, an unmapped error — comes back as
 * `{ statusCode, message, timestamp }`, so the storefront has exactly one branch to write.
 *
 * The message is Persian because the shopper reads it, not the operator: a validation message is
 * shown to a customer. The status code carries the machine-readable part, so a client that wants
 * to branch on the cause branches on the code and leaves the prose alone.
 */
export interface GatewayError {
  statusCode: number;
  message: string;
  timestamp: string;
}

/** Persian copy for the failures a shopper can actually cause, keyed by HTTP status. */
const PERSIAN_BY_STATUS: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: "درخواست نامعتبر است.",
  [HttpStatus.UNAUTHORIZED]: "برای ادامه باید وارد حساب خود شوید.",
  [HttpStatus.FORBIDDEN]: "به این بخش دسترسی ندارید.",
  [HttpStatus.NOT_FOUND]: "موردی که خواستید پیدا نشد.",
  [HttpStatus.CONFLICT]: "این کار قبلاً انجام شده است.",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "اطلاعات واردشده کامل یا درست نیست.",
  [HttpStatus.TOO_MANY_REQUESTS]: "تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.",
};

@Catch()
export class GatewayExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GatewayExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const request = host.switchToHttp().getRequest<Request>();

    const { status, message } = this.describe(exception);

    // A 5xx is the gateway's fault and belongs in the log with its stack. A 4xx is the caller's
    // and logging it at error level trains everyone to ignore the error log.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request?.method ?? "?"} ${request?.url ?? "?"} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: GatewayError = { statusCode: status, message, timestamp: new Date().toISOString() };
    response.status(status).json(body);
  }

  /** The one place a status and a message are decided, so no route has to invent either. */
  private describe(exception: unknown): { status: number; message: string } {
    // A GatewayException carries a message a human wrote for a shopper, in Persian. It is the only
    // message this filter trusts.
    if (exception instanceof GatewayException) {
      return { status: exception.getStatus(), message: exception.message };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      // Everything else that is an HttpException gets the copy for its status. Nest's own default
      // text is an English implementation detail — "Bad Request Exception", "Cannot GET /nope" —
      // and it reaches the shopper as-is unless something deliberately replaces it here.
      return { status, message: PERSIAN_BY_STATUS[status] ?? "خطایی رخ داد." };
    }
    // An unmapped error is a bug, and its message can name a table or a file. It never reaches the
    // caller: the log gets it, the shopper gets a generic Persian line.
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: "خطایی رخ داد." };
  }
}
