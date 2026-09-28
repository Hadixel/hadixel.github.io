import { Module } from "@nestjs/common";
import { DataModule } from "../prisma/prisma.module.js";
import { CatalogueController } from "./catalogue.controller.js";
import { CatalogueService } from "./catalogue.service.js";

/**
 * The public catalogue: categories, collections and products, as a logged-out visitor sees them.
 *
 * Its own feature rather than an extension of the operator's `categories` or `products`, because
 * those answer a different question. The panel asks "how is this row arranged" and gets a weight, a
 * spec-field list and counts; a shopper asks "what can I buy here" and gets names, prices and
 * pictures. One route serving both would mean the shopper's answer carried the operator's columns, or
 * the panel's list lost them.
 *
 * `imports` and nothing else. It owns no provider beyond its own service and requires no session, so
 * there is no `AuthModule` here — importing one would be a claim that these routes are checked, and
 * they are not, on purpose.
 */
@Module({
  imports: [DataModule],
  controllers: [CatalogueController],
  providers: [CatalogueService],
})
export class CatalogueModule {}
