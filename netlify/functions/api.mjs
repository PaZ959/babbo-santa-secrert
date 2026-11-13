import { getStore } from "@netlify/blobs";

// Variabili d'ambiente opzionali (Netlify → Site configuration → Environment variables)
const PASSWORD = Netlify.env.get("ADMIN_PASSWORD") || "qaz";
const LINK = Netlify.env.get("PHASE2_LINK") || "https://luxury-yeot-7060ac.netlify.app";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const clean = (n) => String(n || "").replace(/\s+/g, " ").trim().slice(0, 40);

export default async (req) => {
  const store = getStore({ name: "babbe-natale", consistency: "strong" });
  const url = new URL(req.url);
  const a = url.searchParams.get("a") || "state";
  let body = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { body = {}; } }

  const people = async () => {
    const { blobs } = await store.list({ prefix: "p/" });
    const all = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
    return all.filter(Boolean).sort((x, y) => x.ts - y.ts);
  };
  const getCfg = async () => (await store.get("cfg", { type: "json" })) || { sent: false, at: 0 };

  try {
    if (a === "state") {
      const me = url.searchParams.get("me") || "";
      const [list, cfg] = await Promise.all([people(), getCfg()]);
      const iAm = !!me && list.some((p) => p.id === me);
      const now = Date.now();
      const released = !!cfg.sent && now >= (cfg.at || 0);
      return json({
        people: list.map((p) => ({ name: p.name, mine: p.id === me })),
        iAm, sent: !!cfg.sent, at: cfg.at || 0, now,
        link: released && iAm ? LINK : "",
      });
    }

    if (a === "join") {
      const name = clean(body.name);
      if (!name) return json({ error: "nome" }, 400);
      if ((await people()).length >= 300) return json({ error: "pieno" }, 400);
      const id = crypto.randomUUID();
      await store.setJSON("p/" + id, { id, name, ts: Date.now() });
      return json({ id });
    }

    if (a === "leave") {
      const id = String(body.id || "");
      if (id) await store.delete("p/" + id);
      return json({ ok: true });
    }

    if (a === "admin") {
      if (body.password !== PASSWORD) return json({ error: "password" }, 401);
      const id = String(body.id || "");
      if (body.op === "rename" && id) {
        const cur = await store.get("p/" + id, { type: "json" });
        const name = clean(body.name);
        if (cur && name) await store.setJSON("p/" + id, { ...cur, name });
      } else if (body.op === "delete" && id) {
        await store.delete("p/" + id);
      } else if (body.op === "send") {
        // sblocco simultaneo per tutti: 15 secondi dopo il clic
        await store.setJSON("cfg", { sent: true, at: Date.now() + 15000 });
      } else if (body.op === "unsend") {
        await store.setJSON("cfg", { sent: false, at: 0 });
      }
      const [list, cfg] = await Promise.all([people(), getCfg()]);
      const me = String(body.me || "");
      return json({
        people: list.map((p) => ({ id: p.id, name: p.name, mine: p.id === me })),
        iAm: !!me && list.some((p) => p.id === me),
        sent: !!cfg.sent, at: cfg.at || 0, now: Date.now(), link: LINK,
      });
    }
    return json({ error: "azione" }, 400);
  } catch (e) {
    return json({ error: "server" }, 500);
  }
};

export const config = { path: "/api" };
