import { Inject, Injectable } from "@nestjs/common";

/**
 * The gateway's configuration, read once at process start and nowhere else.
 *
 * §7.4 puts "load environment" first in the composition root, before any import that reads
 * config, and this is the only place in the app that reads `process.env`. Every other module takes
 * what it needs from here, which is what makes the tier boundary real: no feature can quietly
 * depend on an environment variable that the audit's example file does not name.
 *
 * Values are validated at construction rather than at use. A gateway that starts with a missing
 * database URL and fails on the first request has already accepted traffic it cannot serve; one
 * that refuses to start has not.
 */
export const CONFIG = "CONFIG";

export interface GatewayConfig {
  readonly port: number;
  readonly nodeEnv: "production" | "development" | "test";
  readonly databaseUrl: string;
  /** Origins allowed to call the gateway. Never a wildcard — see the CORS setup in main.ts. */
  readonly corsOrigins: readonly string[];
  readonly isProduction: boolean;
}

function required(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `${name} is not set. The gateway will not start without it: a server that boots and then ` +
        `fails on first use has already accepted traffic it cannot serve.`,
    );
  }
  return value;
}

function int(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer, got ${JSON.stringify(value)}`);
  }
  return parsed;
}

@Injectable()
export class ConfigService {
  readonly value: GatewayConfig;

  constructor(@Inject(CONFIG) env: NodeJS.ProcessEnv) {
    const nodeEnv = env["NODE_ENV"] ?? "development";
    if (nodeEnv !== "production" && nodeEnv !== "development" && nodeEnv !== "test") {
      throw new Error(`NODE_ENV must be production, development or test, got ${nodeEnv}`);
    }
    this.value = {
      nodeEnv,
      isProduction: nodeEnv === "production",
      // 3102 is the port declared in .env.example, chosen because 3100 and 3101 are the two
      // clients. A default that collided with a client would surface as a confusing EADDRINUSE
      // rather than as a configuration mistake, so the collision is designed out instead.
      port: int("PORT", env["PORT"], 3102),
      databaseUrl: required("DATABASE_URL", env["DATABASE_URL"]),
      corsOrigins: (env["CORS_ORIGINS"] ?? "http://localhost:3100,http://localhost:3101")
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin !== ""),
    };
    if (this.value.corsOrigins.length === 0) {
      throw new Error(
        "CORS_ORIGINS resolved to an empty list. An empty allowlist and a wildcard are both " +
          "wrong here: the first makes the API unreachable, the second makes it public.",
      );
    }
  }

  get port(): number {
    return this.value.port;
  }
  get databaseUrl(): string {
    return this.value.databaseUrl;
  }
  get corsOrigins(): readonly string[] {
    return this.value.corsOrigins;
  }
  get isProduction(): boolean {
    return this.value.isProduction;
  }
  get nodeEnv(): GatewayConfig["nodeEnv"] {
    return this.value.nodeEnv;
  }
}
