import { Module } from "@nestjs/common";
import { ContentController } from "./content.controller.js";
import { ContentService } from "./content.service.js";

/**
 * One feature, in the §7.3 shape: module, controller, service, dto/.
 *
 * The feature owns its query and its rules. It reaches the database only through the injected data
 * client, so there is exactly one way in and the import graph can check it later.
 */
@Module({
  controllers: [ContentController],
  providers: [ContentService],
  exports: [ContentService],
})
export class ContentModule {}
