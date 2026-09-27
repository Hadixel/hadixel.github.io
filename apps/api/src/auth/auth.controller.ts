// The auth routes.
//
// A token comes back in the body rather than being set as a cookie, because the gateway is not the
// thing that will answer the browser's next request — the storefront or the panel is. The client puts
// the token in its own httpOnly cookie, which means the credential is never readable by the page's
// JavaScript, and the clients hold nothing else: no signing secret, no user table, no session rule.

import { Body, Controller, Get, Headers, HttpCode, Post } from "@nestjs/common";
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator";
import { UnauthorizedException } from "../common/exceptions/gateway.exception.js";
import { AuthService } from "./auth.service.js";
import { ADMIN_COOKIE, CUSTOMER_COOKIE } from "./session.js";

/**
 * A phone number as it arrives, before normalisation.
 *
 * Not validated against the stored shape on purpose: this is the boundary where a human's spelling is
 * still intact, and refusing `+989121234567` here is the bug the shared normaliser exists to remove.
 * Length is bounded so the field cannot be used to send something enormous to the SMS provider.
 */
export class PhoneDto {
  @IsString()
  @MaxLength(32, { message: "شماره موبایل نامعتبر است." })
  phone!: string;

  @IsOptional()
  @IsIn(["LOGIN", "PLACE_ORDER"])
  purpose?: "LOGIN" | "PLACE_ORDER";
}

export class OtpCodeDto {
  @IsString()
  @Length(4, 8)
  code!: string;
}

export class PasswordLoginDto {
  @IsString()
  @MaxLength(32)
  phone!: string;

  @IsString()
  @Length(1, 200)
  password!: string;
}

export class AdminLoginDto {
  @IsEmail({}, { message: "نشانی ایمیل معتبر نیست." })
  @MaxLength(200)
  email!: string;

  @IsString()
  @Length(1, 200)
  password!: string;
}

export class SetPasswordDto {
  @IsString()
  @Length(8, 200, { message: "گذرواژه باید حداقل ۸ نویسه باشد." })
  password!: string;
}

export interface SignInResponse {
  token: string;
  /** The cookie the client should set, and how long for. */
  cookie: string;
  ttlMs: number;
  subjectId: string;
}

/** Read the caller's IP and user agent for the session row, from whatever the proxy set. */
function metaFrom(headers: Record<string, string | string[] | undefined>): { ip: string | null; userAgent: string | null } {
  const first = (value: string | string[] | undefined): string | null => (Array.isArray(value) ? value[0] : value) ?? null;
  return {
    ip: first(headers["x-forwarded-for"]),
    userAgent: first(headers["user-agent"]),
  };
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("otp")
  async requestOtp(@Body() body: PhoneDto): Promise<{ delivered: boolean; devCode?: string } | never> {
    const result = await this.auth.requestOtp(body.phone, body.purpose ?? "LOGIN");
    if (!result.ok) {
      // "too-soon" is the one that a caller can act on, and the message is deliberately vague about
      // whether a code was sent: this endpoint is reachable without an account, so its responses are
      // not a way to learn which numbers exist.
      throw new UnauthorizedException(
        result.reason === "too-soon"
          ? "درخواست کد بیش از حد است؛ کمی بعد دوباره تلاش کنید."
          : "شماره موبایل نامعتبر است.",
      );
    }
    return { delivered: result.delivered, ...(result.devCode ? { devCode: result.devCode } : {}) };
  }

  @Post("otp/verify")
  async verifyOtp(
    @Body() body: PhoneDto & OtpCodeDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<SignInResponse> {
    const result = await this.auth.signInWithOtp(body.phone, body.code, metaFrom(headers));
    if (!result.ok) throw new UnauthorizedException(otpMessage(result.reason));
    return {
      token: result.signIn.token,
      cookie: CUSTOMER_COOKIE,
      ttlMs: result.signIn.ttlMs,
      subjectId: result.signIn.customerId,
    };
  }

  @Post("password")
  async signInWithPassword(
    @Body() body: PasswordLoginDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<SignInResponse> {
    const result = await this.auth.signInWithPassword(body.phone, body.password, metaFrom(headers));
    if (!result.ok) throw new UnauthorizedException("شماره موبایل یا گذرواژه اشتباه است");
    return {
      token: result.signIn.token,
      cookie: CUSTOMER_COOKIE,
      ttlMs: result.signIn.ttlMs,
      subjectId: result.signIn.customerId,
    };
  }

  @Post("password/check")
  async hasPassword(@Body() body: PhoneDto): Promise<{ hasPassword: boolean }> {
    return { hasPassword: await this.auth.hasPassword(body.phone) };
  }

  @Post("password/set")
  async setPassword(
    @Body() body: SetPasswordDto,
    @Headers("cookie") cookie: string | undefined,
  ): Promise<{ ok: true }> {
    const token = tokenFromCookie(cookie, CUSTOMER_COOKIE);
    if (!token) throw new UnauthorizedException();
    const result = await this.auth.setPassword(token, body.password);
    if (!result.ok) throw new UnauthorizedException("گذرواژه باید حداقل ۸ نویسه باشد");
    return { ok: true };
  }

  @Post("sign-out")
  @HttpCode(200)
  async signOut(@Headers("cookie") cookie: string | undefined): Promise<{ ok: true }> {
    // Signing out when already signed out is a success, not an error: a shopper clicking "sign out"
    // on a stale tab should end up signed out either way.
    const token = tokenFromCookie(cookie, CUSTOMER_COOKIE);
    if (token) await this.auth.signOutCustomer(token);
    return { ok: true };
  }

  @Post("admin")
  async signInAdmin(
    @Body() body: AdminLoginDto,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<SignInResponse> {
    const result = await this.auth.signInAdmin(body.email, body.password, metaFrom(headers));
    if (!result.ok) throw new UnauthorizedException("ایمیل یا گذرواژه اشتباه است");
    return {
      token: result.signIn.token,
      cookie: ADMIN_COOKIE,
      ttlMs: result.signIn.ttlMs,
      subjectId: result.signIn.customerId,
    };
  }

  @Post("admin/sign-out")
  @HttpCode(200)
  async signOutAdmin(@Headers("cookie") cookie: string | undefined): Promise<{ ok: true }> {
    const token = tokenFromCookie(cookie, ADMIN_COOKIE);
    if (token) await this.auth.signOutAdmin(token);
    return { ok: true };
  }

  /** Who the caller's token belongs to, or nothing. */
  @Get("me")
  async me(@Headers("cookie") cookie: string | undefined): Promise<{ customerId: string; phone: string } | never> {
    const token = tokenFromCookie(cookie, CUSTOMER_COOKIE);
    if (!token) throw new UnauthorizedException();
    const found = await this.auth.customerForToken(token);
    if (!found) throw new UnauthorizedException();
    return { customerId: found.customer.id, phone: found.customer.phone };
  }
}

function otpMessage(reason: string): string {
  if (reason === "too-many-attempts") return "تعداد تلاش بیش از حد است";
  if (reason === "wrong-code") return "کد اشتباه است";
  if (reason === "invalid-phone") return "شماره موبایل نامعتبر است";
  return "کد منقضی یا نامعتبر است";
}

/** One cookie out of a `Cookie:` header, by name. */
export function tokenFromCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}
