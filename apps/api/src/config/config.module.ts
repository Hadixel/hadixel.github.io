import { Global, Module } from "@nestjs/common";
import { CONFIG, ConfigService } from "./config.service.js";

/**
 * The first entry in the composition root's import order, because every later module reads from it.
 *
 * Global, so a feature module does not re-import this to reach configuration — re-importing it in
 * twenty features is twenty chances to construct configuration twenty times, and §7.4's order only
 * means something if the graph reflects it.
 *
 * The environment is handed over as a value rather than read from `process.env` inside the service.
 * That is what makes the service testable: a test constructs ConfigService with the environment it
 * wants, and no test has to mutate a process-global to exercise a missing variable.
 */
@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: (): NodeJS.ProcessEnv => process.env }, ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
