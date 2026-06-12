import { getStore } from "@netlify/blobs";

export const config = { path: "/api/scores" };

const MAX_ENTRIES = 500; // bound each bucket — nobody scrolls past this anyway
const TOP_RETURNED = 100;
const NAME_RE = /^[a-z0-9 _.\-]{2,16}$/i;

const bad = msg => Response.json({ error: msg }, { status: 400 });
const noStore = { "cache-control": "no-store" };

const dayKey = () => new Date().toISOString().slice(0, 10);
const weekKey = () => {
  const d = new Date();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return t.getUTCFullYear() + "-W" + Math.ceil(((t - y0) / 86400000 + 1) / 7);
};

// schema: { all: {nameKey: entry}, day: {"2026-06-12": {…}}, week: {"2026-W24": {…}} }
// older blobs were a flat all-time map — wrap them on read
const normalize = data => {
  if (!data) return { all: {}, day: {}, week: {} };
  if (!data.all) return { all: data, day: {}, week: {} };
  data.day = data.day || {}; data.week = data.week || {};
  return data;
};
const trim = m => Object.fromEntries(
  Object.entries(m).sort((a, b) => b[1].score - a[1].score).slice(0, MAX_ENTRIES));
const top = m => Object.values(m).sort((a, b) => b.score - a.score).slice(0, TOP_RETURNED);

export default async req => {
  const store = getStore("leaderboard");
  const url = new URL(req.url);

  if (req.method === "GET") {
    // viewing tolerates a few seconds of staleness — eventual reads come from the
    // edge cache and keep the board snappy even on a cold function
    const data = normalize(await store.get("scores", { type: "json" }));
    const w = url.searchParams.get("window");
    const bucket = w === "day" ? (data.day[dayKey()] || {})
                 : w === "week" ? (data.week[weekKey()] || {})
                 : data.all;
    return Response.json({ scores: top(bucket), total: Object.keys(bucket).length },
      { headers: noStore });
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

  // one entry per username (case-insensitive), keeping the max score, in every window.
  // strong consistency here only: the read-modify-write must see the latest board
  const key = name.toLowerCase();
  const data = normalize(await store.get("scores", { type: "json", consistency: "strong" }));
  const dk = dayKey(), wk = weekKey();
  // old periods fall away — only the live day/week buckets are kept
  data.day = { [dk]: data.day[dk] || {} };
  data.week = { [wk]: data.week[wk] || {} };

  const entry = { name, score, time, at: Date.now() };
  const place = bucket => {
    const prev = bucket[key];
    if (!prev || score > prev.score) bucket[key] = entry;
  };
  const prevAll = data.all[key];
  const improved = !prevAll || score > prevAll.score;
  place(data.all); place(data.day[dk]); place(data.week[wk]);
  data.all = trim(data.all);
  data.day[dk] = trim(data.day[dk]);
  data.week[wk] = trim(data.week[wk]);
  await store.setJSON("scores", data);

  const best = improved ? score : prevAll.score;
  const rank = 1 + Object.values(data.all).filter(e => e.score > best).length;
  return Response.json({ best, rank, improved, total: Object.keys(data.all).length },
    { headers: noStore });
};
