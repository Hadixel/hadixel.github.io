// The panel's customers, as the gateway serves them.
//
// The panel used to run these queries itself: an OR over name, phone and email written beside a
// table, a count beside the rows, and three separate statements for one customer's detail page. What
// is worth pinning here is the *shape* the JSX depends on (a flattened count, a spend figure that is
// a number, an order list beside a count of all orders) and the two things a read can quietly stop
// doing: filtering, and refusing a caller with no session.

import { beforeEach, describe, expect, it } from "vitest";
import { CustomersController } from "../src/customers/customers.controller.js";
import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";
import { VALIDATION_PIPE_OPTIONS } from "../src/common/validation.js";
import { CustomerListQueryDto } from "../src/customers/dto/customer.dto.js";
import { CustomersService } from "../src/customers/customers.service.js";
import { CustomerNotFoundException } from "../src/customers/exceptions/customer.exception.js";
import { db } from "../src/prisma/index.js";
import { makeOrder, resetDatabase } from "./harness.js";

/** A query as the pipe would have built it, so the DTO's own defaults apply where the panel omits one. */
function query(over: Partial<CustomerListQueryDto> = {}): CustomerListQueryDto {
  return Object.assign(new CustomerListQueryDto(), over);
}

describe("the panel reads the customers", () => {
  beforeEach(resetDatabase);
  let operatorId: string;

  beforeEach(async () => {
    const operator = await db().adminUser.create({
      data: {
        email: "operator@kmodern.ir",
        name: "اپراتور",
        passwordHash: "scrypt$00$00",
        isActive: true,
      },
    });
    operatorId = operator.id;
  });

  const controller = () => {
    const auth = {
      adminForToken: async (token: string) =>
        token === "good" ? { admin: { id: operatorId, email: "operator@kmodern.ir" } } : null,
    } as never;
    return new CustomersController(auth, new CustomersService(db() as never));
  };

  const request = () => ({ headers: { cookie: "kmodern_admin=good" } }) as never;

  async function makeCustomer(over: { name?: string | null; phone: string; email?: string | null } = { phone: "09120000001" }) {
    return db().customer.create({
      data: {
        phone: over.phone,
        name: over.name ?? null,
        email: over.email ?? null,
      },
    });
  }

  // The badge counts orders, and it counted them through a `_count` the page reached into. The read
  // flattens it, which is only worth doing if the flattened name is the one the table reads.
  it("answers each row with the order count the table's badge shows", async () => {
    const buyer = await makeCustomer({ name: "مریم", phone: "09120000001" });
    await makeCustomer({ name: "رضا", phone: "09120000002" });
    await makeOrder({ customerId: buyer.id, total: 100 });
    await makeOrder({ customerId: buyer.id, total: 250 });

    const page = await controller().list(request(), query());

    const row = page.rows.find((r) => r.id === buyer.id);
    expect(row?.orderCount).toBe(2);
    expect(page.total).toBe(2);
    expect(Object.keys(row ?? {}).sort()).toEqual([
      "email",
      "id",
      "joinedAt",
      "name",
      "orderCount",
      "phone",
    ]);
  });

  // The predicate the panel's search box had, arm for arm. Each arm is searched on its own so that a
  // read which dropped one of them still fails here rather than quietly matching less.
  it("searches name, phone and email, and only what the box named", async () => {
    const byName = await makeCustomer({ name: "مریم رضایی", phone: "09120000001" });
    const byPhone = await makeCustomer({ name: "حسین", phone: "09120000002", email: "hesin@example.ir" });
    const byEmail = await makeCustomer({ name: "سارا", phone: "09120000003", email: "Sara@Example.ir" });

    // The name arm.
    const named = await controller().list(request(), query({ q: "رضایی" }));
    expect(named.rows.map((r) => r.id)).toEqual([byName.id]);
    // The count the header prints is the count of what was found, not of the shop.
    expect(named.total).toBe(1);

    // The phone arm, which matches the digits it is given and is not case-folded: a phone number in
    // this shop is digits, and folding case on it would change nothing an operator can observe.
    const phoned = await controller().list(request(), query({ q: "09120000002" }));
    expect(phoned.rows.map((r) => r.id)).toEqual([byPhone.id]);

    // The email arm, which is case-insensitive: `Sara@` and `sara@` are one address to the mail
    // server and one customer to the operator.
    const emailed = await controller().list(request(), query({ q: "sara@example.ir" }));
    expect(emailed.rows.map((r) => r.id)).toEqual([byEmail.id]);

    // And a term that names nobody narrows to nobody rather than to everyone.
    const nobody = await controller().list(request(), query({ q: "nobody-here" }));
    expect(nobody.rows).toEqual([]);
    expect(nobody.total).toBe(0);
  });

  // A page argument that does not page is a list the operator cannot get past the end of.
  it("pages, and the count beside the rows stays the whole count", async () => {
    const first = await makeCustomer({ name: "اول", phone: "09120000001" });
    const second = await makeCustomer({ name: "دوم", phone: "09120000002" });

    const pageOne = await controller().list(request(), query({ page: 1, size: 1 }));
    const pageTwo = await controller().list(request(), query({ page: 2, size: 1 }));

    expect(pageOne.rows).toHaveLength(1);
    expect(pageTwo.rows).toHaveLength(1);
    expect(pageOne.rows[0]?.id).not.toBe(pageTwo.rows[0]?.id);
    expect([pageOne.rows[0]?.id, pageTwo.rows[0]?.id].sort()).toEqual([first.id, second.id].sort());
    expect(pageTwo.total).toBe(2);
    expect(pageTwo.page).toBe(2);
    expect(pageTwo.size).toBe(1);
  });

  it("refuses a caller with no operator session", async () => {
    // A customer row is a person's name, phone number, address history and what they have spent.
    // Reachable without a session, this read is a customer list handed to anyone who asks.
    await makeCustomer({ name: "مریم", phone: "09120000001" });

    await expect(
      controller().list({ headers: { cookie: "kmodern_admin=bad" } } as never, query()),
    ).rejects.toThrow();
    await expect(
      controller().one({ headers: {} } as never, "anything"),
    ).rejects.toThrow();
  });

  it("answers one customer with their addresses, their newest orders and their whole spend", async () => {
    const buyer = await makeCustomer({ name: "مریم", phone: "09120000001", email: "maryam@example.ir" });
    await makeOrder({ customerId: buyer.id, total: 100 });
    await makeOrder({ customerId: buyer.id, total: 250 });
    await db().address.create({
      data: {
        customerId: buyer.id,
        recipientName: "مریم",
        recipientPhone: "09120000001",
        province: "تهران",
        city: "تهران",
        addressLine: "خیابان ولیعصر",
        postalCode: "1234567890",
        isDefault: false,
      },
    });
    await db().address.create({
      data: {
        customerId: buyer.id,
        recipientName: "مریم رضایی",
        recipientPhone: "09120000001",
        province: "اصفهان",
        city: "اصفهان",
        addressLine: "چهارباغ",
        postalCode: "8134567890",
        isDefault: true,
      },
    });

    const detail = await controller().one(request(), buyer.id);

    // The default address first, because that is the one an operator reads before anything else.
    expect(detail.addresses.map((a) => a.city)).toEqual(["اصفهان", "تهران"]);
    expect(detail.orderCount).toBe(2);
    expect(detail.recentOrders).toHaveLength(2);
    // A number, not a string: the page formats it as money, and a formatted-as-money string is how a
    // total of 350 reaches an operator as "۳۵۰ تومان" with the arithmetic done somewhere else.
    expect(detail.totalSpend).toBe(350);
    expect(detail.smsMarketingConsent).toBe(false);
  });

  it("says a customer with no orders spends nothing, rather than answering null", async () => {
    const buyer = await makeCustomer({ name: "تازه", phone: "09120000009" });

    const detail = await controller().one(request(), buyer.id);

    expect(detail.totalSpend).toBe(0);
    expect(detail.orderCount).toBe(0);
    expect(detail.recentOrders).toEqual([]);
  });

  it("refuses an id that names nobody, rather than answering an empty customer", async () => {
    // The panel's `notFound()` drew the same screen as a customer with no orders and no addresses,
    // on the screen where an operator decides whether to chase an order.
    await expect(controller().one(request(), "does-not-exist")).rejects.toBeInstanceOf(
      CustomerNotFoundException,
    );
  });
});

/**
 * What the gateway will accept about a customer query.
 *
 * Through the *pipe* rather than through the controller, because `@Max` and friends run in the
 * `ValidationPipe` and nowhere else: a test that calls `list(request, query)` cannot see a missing
 * or wrong decorator at all, and passes either way. The options are the gateway's own, so this
 * cannot drift from what the server is configured to do.
 */
describe("the customer query is bounded", () => {
  const pipe = new ValidationPipe(VALIDATION_PIPE_OPTIONS);
  const asQuery: ArgumentMetadata = { type: "query", metatype: CustomerListQueryDto, data: "" };

  async function refusal(query: Record<string, unknown>): Promise<string | null> {
    try {
      await pipe.transform(query, asQuery);
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  }

  it("refuses a page size the caller invented, and an unbounded search", async () => {
    // A caller that chooses its own ceiling is not being served, it is setting the gateway's memory
    // limit. `size=1000000` is the request this read exists to refuse.
    expect(await refusal({ size: "1000000" })).toMatch(/ردیف/);
    expect(await refusal({ page: "0" })).toMatch(/صفحه/);
    expect(await refusal({ page: "1e9" })).toMatch(/صفحه/);
    expect(await refusal({ q: "x".repeat(201) })).toMatch(/جست‌وجو/);
  });

  it("accepts an empty search box rather than refusing the operator's first click", async () => {
    // `?q=` is a cleared box, not a filter over the empty string. Refusing it would turn a search
    // form into an error page the moment someone deleted what they had typed.
    expect(await refusal({ q: "", page: "2", size: "25" })).toBeNull();
    expect(await refusal({ page: "1", size: "25" })).toBeNull();
  });
});
