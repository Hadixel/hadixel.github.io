// The auth routes.
//
// A token comes back in the body rather than being set as a cookie, because the gateway is not the
// thing that will answer the browser's next request — the storefront or the panel is. The client puts
// the token in its own httpOnly cookie, which means the credential is never readable by the page's
// JavaScript, and the clients hold nothing else: no signing secret, no user table, no session rule.

import { Body, Controller, Get, Headers, HttpCode, Post } from "@nestjs/common";
import { IsEmail, IsIn, IsOptional, IsString, Length, MaxLength } from "class-validator";
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "../common/exceptions/gateway.exception.js";
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

export class AdminPasswordChangeDto {
  @IsString()
  @Length(1, 200)
  current!: string;

  @IsString()
  @Length(1, 200)
  next!: string;
}

export class AdminSessionIdDto {
  @IsString()
  @Length(1, 64)
  sessionId!: string;
}

/**
 * What the panel needs to know about who is signed in.
 *
 * The fields are named, not the row. A panel page that received the admin row could read
 * `passwordHash`, `failedAttempts` and `lockedUntil` — none of which are its business, and one of
 * which is a credential. A session is reduced to its id because that is the only thing a page can
 * act on, and the only thing it was using.
 */
export interface AdminContextResponse {
  session: { id: string };
  admin: {
    id: string;
    email: string;
    name: string;
    role: string;
    mustChangePassword: boolean;
  };
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
  ): Promise<SignInResponse & { mustChangePassword: boolean }> {
    const result = await this.auth.signInAdmin(body.email, body.password, metaFrom(headers));
    if (!result.ok) throw new UnauthorizedException(adminSignInMessage(result.reason));
    return {
      token: result.signIn.token,
      cookie: ADMIN_COOKIE,
      ttlMs: result.signIn.ttlMs,
      subjectId: result.signIn.customerId,
      mustChangePassword: result.mustChangePassword,
    };
  }

  /**
   * Who the calling operator is.
   *
   * The panel's `getAdminUser` used to be this: read the cookie, find the session, check the account
   * is still active, touch `lastSeenAt`. All of that is now here, which is the point — a page cannot
   * be the thing that decides whether a session is valid, or it will decide it differently on every
   * page that needs the answer.
   */
  @Get("admin/me")
  async adminMe(@Headers("cookie") cookie: string | undefined): Promise<AdminContextResponse | never> {
    const token = tokenFromCookie(cookie, ADMIN_COOKIE);
    if (!token) throw new UnauthorizedException();
    const found = await this.auth.adminForToken(token);
    if (!found) throw new UnauthorizedException();
    return {
      session: { id: found.session.id },
      admin: {
        id: found.admin.id,
        email: found.admin.email,
        name: found.admin.name,
        role: found.admin.role,
        mustChangePassword: found.admin.mustChangePassword,
      },
    };
  }

  /**
   * Change the calling operator's password, and hand back a rotated token.
   *
   * The token comes back rather than being set here, for the same reason sign-in does: the browser
   * will answer the next request, not the gateway, and the panel is what owns the cookie. The
   * rotation is the reason the panel must write the new one — keeping the old cookie would leave the
   * session that performed the change still valid.
   */
  @Post("admin/password")
  @HttpCode(200)
  async changeAdminPassword(
    @Body() body: AdminPasswordChangeDto,
    @Headers("cookie") cookie: string | undefined,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<{ ok: true; token: string; cookie: string; ttlMs: number } | never> {
    const token = tokenFromCookie(cookie, ADMIN_COOKIE);
    if (!token) throw new UnauthorizedException();
    const result = await this.auth.changeAdminPassword(token, body.current, body.next, metaFrom(headers));
    if (!result.ok) {
      if (result.reason === "unauthenticated") throw new UnauthorizedException();
      throw new BadRequestException(adminPasswordMessage(result.reason));
    }
    return { ok: true, token: result.token, cookie: ADMIN_COOKIE, ttlMs: result.ttlMs };
  }

  /** Revoke one of the calling operator's own sessions. */
  @Post("admin/sessions/revoke")
  @HttpCode(200)
  async revokeAdminSession(
    @Body() body: AdminSessionIdDto,
    @Headers("cookie") cookie: string | undefined,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<{ ok: true } | never> {
    const token = tokenFromCookie(cookie, ADMIN_COOKIE);
    if (!token) throw new UnauthorizedException();
    const result = await this.auth.revokeOwnAdminSession(token, body.sessionId, metaFrom(headers));
    if (!result.ok) {
      if (result.reason === "unauthenticated") throw new UnauthorizedException();
      throw new NotFoundException("نشست پیدا نشد");
    }
    return { ok: true };
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

/**
 * The panel's sign-in messages, per reason.
 *
 * Two of the three are deliberately more informative than the bad-credentials message. An operator
 * who is told the account is locked, or that the attempt rate is too high, knows what to do about
 * it; hiding it just produces a support call. The password being wrong is not the operator's
 * business, so that one stays the same string as "no such account".
 */
function adminSignInMessage(reason: string): string {
  if (reason === "locked-out") return "تعداد تلاش‌های ناموفق از حد مجاز گذشت؛ حساب ۳۰ دقیقه قفل شد";
  if (reason === "too-many-attempts") return "تلاش‌های ناموفق زیاد؛ کمی بعد دوباره تلاش کنید";
  return "ایمیل یا گذرواژه اشتباه است";
}

function adminPasswordMessage(reason: string): string {
  if (reason === "wrong-current") return "گذرواژه فعلی اشتباه است";
  if (reason === "reused") return "گذرواژه جدید نباید همان قبلی باشد";
  return "گذرواژه جدید باید حداقل ۸ نویسه باشد";
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
