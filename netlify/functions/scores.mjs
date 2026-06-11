import { getStore } from "@netlify/blobs";

export const config = { path: "/api/scores" };

const MAX_ENTRIES = 500; // bound the blob — nobody scrolls past this anyway
const TOP_RETURNED = 100;
const NAME_RE = /^[a-z0-9 _.\-]{2,16}$/i;

const bad = msg => Response.json({ error: msg }, { status: 400 });
const noStore = { "cache-control": "no-store" };

export default async req => {
  // strong consistency: max-per-name decisions must read the latest write,
  // not a stale CDN copy
  const store = getStore({ name: "leaderboard", consistency: "strong" });

  if (req.method === "GET") {
    const data = (await store.get("scores", { type: "json" })) || {};
    const scores = Object.values(data)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_RETURNED);
    return Response.json({ scores }, { headers: noStore });
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: { allow: "GET, POST" } });
  }

  let body;
  try { body = await req.json(); } catch { return bad("invalid json"); }
  const name = String(body.name ?? "").trim();
  const score = Math.floor(Number(body.score));
  const time = Math.round(Number(body.time));
  if (!NAME_RE.test(name)) return bad("invalid name");
  if (!Number.isFinite(score) || score < 1 || score > 1e9) return bad("invalid score");
  if (!Number.isFinite(time) || time < 5 || time > 86400) return bad("invalid time");
  // generous ceiling on score-per-second; blocks lazy forgery, not determined cheaters
  if (score > (time + 10) * 25000) return bad("implausible score");

  // one entry per username (case-insensitive), keeping the max score
  const key = name.toLowerCase();
  const data = (await store.get("scores", { type: "json" })) || {};
  const prev = data[key];
  const improved = !prev || score > prev.score;
  if (improved) {
    data[key] = { name, score, time, at: Date.now() };
    const trimmed = Object.entries(data)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, MAX_ENTRIES);
    await store.setJSON("scores", Object.fromEntries(trimmed));
  }

  const best = improved ? score : prev.score;
  const rank = 1 + Object.values(data).filter(e => e.score > best).length;
  return Response.json({ best, rank, improved }, { headers: noStore });
};
