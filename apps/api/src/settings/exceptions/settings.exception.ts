import { HttpStatus } from "@nestjs/common";
import { GatewayException } from "../../common/exceptions/gateway.exception.js";

/**
 * A settings save the gateway will not apply.
 *
 * One class rather than one per rule, because every one of these is the same answer to the operator's
 * question — "this value is not allowed" — and the message says which. The panel returned a generic
 * "ذخیره انجام نشد" for a rejected enum and for a database that was down, and the operator had no way
 * to tell those apart.
 */
export class SettingsRuleException extends GatewayException {
  constructor(message: string) {
    super(HttpStatus.BAD_REQUEST, message);
  }
}

/**
 * A section the gateway does not have.
 *
 * A 404 rather than a 400: the caller asked for something that is not there, which is different in
 * kind from asking to store a value that is not allowed. The panel answered both with the same
 * sentence, which is why a stale form and a typo looked alike.
 */
export class SettingSectionNotFoundException extends GatewayException {
  constructor(section: string) {
    super(HttpStatus.NOT_FOUND, `بخش «${section}» پیدا نشد.`);
  }
}
