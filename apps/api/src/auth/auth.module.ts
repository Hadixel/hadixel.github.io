import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { OtpService } from "./otp.service.js";

/**
 * Auth, in the §7.3 shape.
 *
 * `OtpService` is provided rather than inlined in `AuthService` because requesting a code and
 * verifying one are separate operations with separate callers — the storefront's modal asks for one and
 * the other only in a sign-in flow — and because the rate limits belong to the code, not to the session
 * that a successful verification opens.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, OtpService],
  exports: [AuthService],
})
export class AuthModule {}
