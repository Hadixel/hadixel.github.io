import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { GatewayExceptionFilter } from "./common/filters/gateway-exception.filter.js";
import { OriginGuard } from "./common/guards/origin.guard.js";
import { ConfigService } from "./config/config.service.js";

/**
 * The composition root: load configuration, create the app, and attach the global concerns in the
 * fixed order §7.4 sets out. Each step appears exactly once and lives in this file, so "where is
 * CORS configured" has one answer.
 *
 * The order is not cosmetic. Validation is installed before the exception filter so a pipe
 * rejection is caught by the same envelope as everything else; security headers go on before the
 * listener exists so no response can escape without them; documentation is registered last and only
 * outside production, because a route that should not exist is worse than a route that is missing.
 */
async function bootstrap(): Promise<void> {
  // abortOnError: false so a failure to construct the app throws here, where the stack is
  // available, instead of Nest calling process.exit(1) from inside its factory with the reason
  // written to a logger this process may not have configured yet. A gateway that exits with status
  // 1 and no message is the hardest kind of outage to diagnose.
  const app = await NestFactory.create(AppModule, { abortOnError: false });

  // The environment is read through ConfigService, which validates it in its constructor, so a
  // missing DATABASE_URL stops the boot here rather than on the first request that needs it.
  const config = app.get(ConfigService);

  // CORS: an explicit allowlist read from configuration, never a wildcard. A wildcard on an API
  // that carries session credentials lets any site a shopper visits make authenticated requests on
  // their behalf, and credentials cannot be combined with a wildcard origin anyway, so a wildcard
  // here would break the clients while appearing to work.
  app.enableCors({
    origin: [...config.corsOrigins],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  // One validation pipe for every inbound body and query. `forbidNonWhitelisted` rejects a field
  // the DTO does not declare, and `whitelist` strips one that is declared for the form but not for
  // the wire. Both, because a silently ignored field is how a client ends up sending `isAdmin` and
  // wondering why it does nothing.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // The one error envelope. Registered after the pipe so it catches the pipe's own rejections.
  app.useGlobalFilters(new GatewayExceptionFilter());

  // The origin check, on every mutating route, installed here rather than per controller so a route
  // added next year is covered by being a write. Reads are left to CORS above, which answers the
  // browser rather than the requester. Registered before the filter so its refusals come out in the
  // same envelope as everything else.
  app.useGlobalGuards(new OriginGuard(config));

  // Security headers on every route. helmet's defaults are a sane floor; they are applied to the
  // whole app rather than to media paths, because the header that matters most here is the one a
  // JSON response would otherwise go out without.
  app.use(helmet());
  app.getHttpAdapter().getInstance().disable("x-powered-by");

  // Documentation outside production only. In production the routes are never registered, so
  // there is nothing to gate at request time and no window where a flag is wrong.
  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle("Kmodern gateway")
        .setDescription("The one process that talks to the database.")
        .setVersion("0.1.0")
        .addTag("content", "Storefront reads")
        .addTag("health", "Liveness and readiness")
        .build(),
    );
    SwaggerModule.setup("docs", app, document);
  }

  // Graceful shutdown: stop accepting connections, finish in-flight requests, then close the data
  // client. Without the hook a deploy closes the pool under a query that is already running.
  app.enableShutdownHooks();

  await app.listen(config.port);
  // eslint-disable-next-line no-console -- the composition root is the one place a line of output
  // is the point: an operator starting the process needs to know it is up and where.
  console.log(`gateway listening on :${config.port} (${config.nodeEnv})`);
}

void bootstrap();
