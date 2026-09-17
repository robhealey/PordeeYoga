import { Hono } from "hono";
import type { AppEnv } from "../types.ts";
import { attachUser, requireUser } from "../middleware/auth.ts";
import {
  createPendingMemberPackage,
  getPackage,
  hasUsedOneTimePackage,
  listActivePackages,
  listMemberPackagesForUser,
  listUsablePackagesForUser,
} from "../lib/packages.ts";
import { activateAndMaybeCombine, assertCombinePurchaseAllowed, createExtendRenewalRequest } from "../lib/renewals.ts";
import { listBirthdayCouponsForUser } from "../lib/coupons.ts";

const packages = new Hono<AppEnv>();

packages.use("*", attachUser);

packages.get("/", async (c) => {
  const rows = await listActivePackages(c.env);
  return c.json({ packages: rows });
});

packages.get("/mine", requireUser, async (c) => {
  const user = c.get("user")!;
  const rows = await listMemberPackagesForUser(c.env, user.id);
  return c.json({ memberPackages: rows });
});

packages.get("/usable", requireUser, async (c) => {
  const user = c.get("user")!;
  const rows = await listUsablePackagesForUser(c.env, user.id);
  return c.json({ memberPackages: rows });
});

packages.get("/renewals/:id", requireUser, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid renewal id" }, 400);
  const renewal = await c.env.DB.prepare(
    `SELECT pr.*, mp.user_id FROM package_renewals pr JOIN member_packages mp ON mp.id = pr.old_member_package_id
     WHERE pr.id = ?`
  )
    .bind(id)
    .first<{ user_id: number } & Record<string, unknown>>();
  if (!renewal || renewal.user_id !== user.id) return c.json({ error: "Not found" }, 404);
  return c.json({ renewal });
});

packages.get("/coupons/birthday", requireUser, async (c) => {
  const user = c.get("user")!;
  const rows = await listBirthdayCouponsForUser(c.env, user.id);
  return c.json({ coupons: rows });
});

packages.post("/purchase", requireUser, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json<{
    packageId: number;
    trialFullName?: string;
    trialPhone?: string;
    renewOldMemberPackageId?: number;
  }>();
  if (!Number.isInteger(body.packageId)) return c.json({ error: "packageId is required" }, 400);

  const pkg = await getPackage(c.env, body.packageId);
  if (!pkg || !pkg.active) return c.json({ error: "Package not found" }, 404);

  if (pkg.one_time_per_person) {
    const fullName = body.trialFullName ?? user.display_name;
    const phone = body.trialPhone;
    if (!phone) return c.json({ error: "A phone number is required to check trial eligibility" }, 400);
    if (await hasUsedOneTimePackage(c.env, pkg.id, fullName, phone)) {
      return c.json({ error: "This name and phone number has already used a trial class" }, 409);
    }
    await c.env.DB.prepare("UPDATE users SET phone = COALESCE(phone, ?) WHERE id = ?").bind(phone, user.id).run();
  }

  if (body.renewOldMemberPackageId) {
    const check = await assertCombinePurchaseAllowed(c.env, body.renewOldMemberPackageId);
    if (!check.ok) return c.json({ error: check.error }, 400);
    const old = await c.env.DB.prepare("SELECT user_id FROM member_packages WHERE id = ?")
      .bind(body.renewOldMemberPackageId)
      .first<{ user_id: number }>();
    if (!old || old.user_id !== user.id) return c.json({ error: "Not your package" }, 403);
  }

  const memberPackage = await createPendingMemberPackage(c.env, user.id, pkg, body.renewOldMemberPackageId);
  return c.json({ memberPackage }, 201);
});

/** Section 17, option 1 step 2: activate a purchased package, combining with an old
 * package's remaining credits if it was purchased as a renewal and the window still holds. */
packages.post("/:id/activate", requireUser, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid package id" }, 400);

  const mp = await c.env.DB.prepare("SELECT user_id FROM member_packages WHERE id = ?")
    .bind(id)
    .first<{ user_id: number }>();
  if (!mp) return c.json({ error: "Not found" }, 404);
  if (mp.user_id !== user.id) return c.json({ error: "Not your package" }, 403);

  const result = await activateAndMaybeCombine(c.env, id, "member");
  if (!result.ok) return c.json({ error: result.error }, (result.status ?? 400) as 400 | 404);
  return c.json(result.data);
});

/** Section 17, option 2 step 1: request the paid 1-month extension. Returns a renewalId to
 * pay for via /api/payments/omise/charge — the extension is applied once that succeeds. */
packages.post("/:id/renewals/extend", requireUser, async (c) => {
  const user = c.get("user")!;
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid package id" }, 400);

  const mp = await c.env.DB.prepare("SELECT user_id FROM member_packages WHERE id = ?")
    .bind(id)
    .first<{ user_id: number }>();
  if (!mp) return c.json({ error: "Not found" }, 404);
  if (mp.user_id !== user.id) return c.json({ error: "Not your package" }, 403);

  const result = await createExtendRenewalRequest(c.env, { memberPackageId: id, processedBy: "member" });
  if (!result.ok) return c.json({ error: result.error }, (result.status ?? 400) as 400 | 404);
  return c.json(result.data, 201);
});

export default packages;
