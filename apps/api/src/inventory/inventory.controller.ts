// Stock, as the panel's operator sees it.
//
// The lifecycle itself — reserve, commit, release, restock — is in `inventory.service.ts` and has been
// since ticket 08, deliberately free of Nest decorators so the orders service and the tests can reach
// it without a container. This controller is only the operator's edge onto one operation of it: the
// manual adjustment, which is the one thing an operator does to stock that is not an order.
//
// The panel had its own implementation of this, and it was a fourth copy of the rules rather than a
// third: its own compare-and-set, its own reserved-stock floor, and its own audit write, all inside
// a transaction the gateway knew nothing about. Two of the three guarantees here — that an adjustment
// cannot push available stock below what is already reserved, and that a concurrent order cannot be
// overwritten by a stale read of the row — are the reason this exists as a gateway route.
//
// The two rules themselves live in `setVariantStock` in the service, and the product form's variant
// diff calls the same function. When this controller had its own copy, the panel's product write had a
// third one that re-read the row and then compared against that same read, so its compare-and-set
// could never fire while looking as though it did.

import { Body, Controller, Inject, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { writeAudit } from "../common/audit.js";
import { requireAdmin } from "../auth/identity.js";
import { AuthService } from "../auth/auth.service.js";
import { DATA_CLIENT } from "../prisma/data-client.token.js";
import type { PrismaClient } from "../prisma/index.js";
import { setVariantStock } from "./inventory.service.js";
import { VariantNotFoundException } from "./exceptions/inventory.exception.js";
import { AdjustStockDto } from "./dto/inventory.dto.js";

@Controller("inventory")
export class InventoryController {
  constructor(
    private readonly auth: AuthService,
    // The data client arrives through the module that owns it, the same as every other feature. The
    // service file next door is decorator-free on purpose so the tests can drive it directly; a
    // controller has no such excuse and takes the client the way the rest of the gateway does.
    @Inject(DATA_CLIENT) private readonly db: PrismaClient,
  ) {}

  /**
   * Apply an operator's stock adjustment to one variant.
   *
   * The whole operation is one transaction: the compare-and-set, the write, and the audit line. A
   * failure anywhere leaves the variant exactly as it was, and — because the audit line is inside the
   * transaction rather than after it — leaves no trace of an adjustment that did not happen, which is
   * the guarantee the panel's copy could not make: it committed the stock change and then wrote the
   * audit row separately, so a failed audit write was a changed row nobody could account for.
   *
   * `delta` rather than an absolute count, because the two answer different questions. "There are
   * three left" is wrong the moment an order has been placed since the operator looked, and it
   * silently discards a concurrent change; "add two" is right regardless of what the row now says.
   */
  @Post("variants/:id/adjust")
  async adjust(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: AdjustStockDto,
  ): Promise<{ stock: number; reserved: number }> {
    const admin = await requireAdmin(this.auth, req);

    return this.db.$transaction(async (tx) => {
      // Read here so the change is computed from the row as it is, and so `setVariantStock` has an
      // expectation to assert against. Both statements sit inside the transaction, which is what makes
      // the expectation meaningful: they cannot be interleaved with an order's own.
      const before = await tx.variant.findUnique({ where: { id } });
      if (!before) throw new VariantNotFoundException();

      const after = await setVariantStock(tx, id, before.stock + body.delta, {
        stock: before.stock,
        reserved: before.reserved,
      });

      await writeAudit(tx, {
        adminUserId: admin.id,
        action: "STOCK_ADJUSTED",
        entityType: "VARIANT",
        entityId: id,
        meta: {
          delta: body.delta,
          note: body.note ?? null,
          before: before.stock,
          after: after.stock,
          sku: after.sku,
        },
      });

      return { stock: after.stock, reserved: after.reserved };
    });
  }
}
