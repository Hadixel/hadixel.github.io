import { Module } from "@nestjs/common";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CategoriesModule } from "./categories/categories.module.js";
import { CatalogueModule } from "./catalogue/catalogue.module.js";
import { CollectionsModule } from "./collections/collections.module.js";
import { CheckoutModule } from "./checkout/checkout.module.js";
import { ConfigModule } from "./config/config.module.js";
import { ContentModule } from "./content/content.module.js";
import { CustomersModule } from "./customers/customers.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { HealthModule } from "./health/health.module.js";
import { InventoryModule } from "./inventory/inventory.module.js";
import { DiscountsModule } from "./discounts/discounts.module.js";
import { MediaModule } from "./media/media.module.js";
import { NavModule } from "./nav/nav.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { DataModule } from "./prisma/prisma.module.js";
import { PagesModule } from "./pages/pages.module.js";
import { PostsModule } from "./posts/posts.module.js";
import { ProductsModule } from "./products/products.module.js";
import { ScraperModule } from "./scraper/scraper.module.js";
import { SettingsModule } from "./settings/settings.module.js";
import { PriceWatchModule } from "./price-watch/price-watch.module.js";
import { ShopperModule } from "./shopper/shopper.module.js";
import { StockLevelsModule } from "./stock-levels/stock-levels.module.js";
import { StorefrontModule } from "./storefront/storefront.module.js";

/**
 * The composition module. It declares `imports` and nothing else.
 *
 * The order is fixed because each tier is read by the ones below it: configuration first, the data
 * client second because nearly everything depends on it, then features in a stable order. Changing
 * the order would not change what compiles — it would change what a reader can assume, which is
 * the thing worth protecting.
 *
 * There are no `providers` here. A provider constructed in this file is constructed outside the
 * wiring layer, which is how a dependency ends up reachable from a module that never declared it.
 * Everything arrives through a module that owns it.
 */
@Module({
  imports: [
    ConfigModule,
    DataModule,
    HealthModule,
    AuthModule,
    // The public catalogue sits with the content read above it, because both answer a logged-out
    // visitor and neither requires a session. It declares no auth module, and the comment on it says
    // why: a public read behind a session check is a storefront nobody can look at.
    CatalogueModule,
    ContentModule,
    // Storefront sits beside the content read for the same reason and one more: it is the tables the
    // chrome and the blog read with no session, and the rule that a public read may not see a draft
    // lives in its own service rather than beside the operator's version of the same query.
    StorefrontModule,
    // Audit sits directly below Auth, because the trail records what the auth feature's own
    // sign-ins and password changes did, and every other feature writes to it.
    AuditModule,
    // Dashboard sits with the other operator reads. It composes figures from orders, inventory and
    // the content features rather than owning rows, so it names them in its queries and declares
    // nothing of its own beyond the data client.
    DashboardModule,
    // Categories, collections and discounts are the panel's catalogue tree, and sit below Auth
    // because every route they own is an operator's. A discount names products, categories and
    // collections, so it belongs beside the two features it points at rather than after them.
    CategoriesModule,
    CollectionsModule,
    DiscountsModule,
    MediaModule,
    NavModule,
    OrdersModule,
    // Shopper sits directly below Orders: it answers for one signed-in customer's own orders and
    // reads the order read model rather than defining a second one.
    ShopperModule,
    // Inventory sits below Orders because orders compose its lifecycle, and above nothing because
    // nothing composes an adjustment.
    InventoryModule,
    // Stock levels sit below Inventory: the list and the adjustment are two views of the same rows,
    // and reading one of them should not make the other a stranger.
    StockLevelsModule,
    CheckoutModule,
    // Customers sit below Orders because a customer is reached through the orders they placed, and
    // beside Auth because the storefront's session and the panel's list read the same row.
    CustomersModule,
    // Products sit below Inventory: their variant diff writes a variant's stock and so calls the
    // same primitive the manual adjustment does, rather than a second copy of the floor.
    PostsModule,
    ProductsModule,
    // The scraper sits with the operator's writes and after Products, because an import is a bulk
    // upsert of products, their categories and their variants: it is the one route that writes every
    // table Products writes, and it holds the vocabulary deciding which of those rows exist.
    ScraperModule,
    // The price watch sits with the scraper and after it, because it reads the same source: its
    // comparison is against the Datees Shop catalogue the scraper harvested from. It writes no
    // product of its own — only `PriceChange` rows, and `Variant.price` when an operator applies
    // one — so it declares nothing beyond the data client.
    PriceWatchModule,
    // Pages sit beside the content reads they feed: the storefront renders these blocks.
    PagesModule,
    // Settings last among the operator's features: it names no other feature's rows, and everything
    // that composes a decision from a setting reads it rather than declaring it.
    SettingsModule,
  ],
})
export class AppModule {}
