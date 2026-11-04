"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Logo } from "./Logo";
import {
  COLUMNS,
  SIZES,
  chainName,
  colorOf,
  columnOf,
  isDear,
  latest,
  money,
  pct,
  pts,
  ranked,
  spread,
  symlog,
  updatedLabel,
  venueName,
  type Dashboard as Data,
  type Size,
  type Venue,
} from "@/lib/assay";
import { DATA_URL, RAW_URL } from "@/lib/urls";

type View = "overview" | "venues" | "alerts" | "agent";
interface Alert {
  id: number;
  ticker: string;
  threshold: number;
}

const VIEWS: { key: View; label: string; icon: string }[] = [
  { key: "overview", label: "Overview", icon: "M3 13h7V3H3v10zm0 8h7v-6H3v6zm11 0h7V11h-7v10zm0-18v6h7V3h-7z" },
  { key: "venues", label: "Venues", icon: "M4 6h16M4 12h16M4 18h16" },
  { key: "alerts", label: "Alerts", icon: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" },
  { key: "agent", label: "Agent API", icon: "M8 9l-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" },
];

const ALERTS_KEY = "assayer.alerts";
// Where the zero line sits on the horizontal log axis, and how wide the axis runs.
const xpos = (p: number) => Math.min(99, Math.max(1, 14 + 84 * symlog(p)));

function readAlerts(): Alert[] {
  try {
    const raw = window.localStorage.getItem(ALERTS_KEY);
    return raw ? (JSON.parse(raw) as Alert[]) : [];
  } catch {
    return [];
  }
}

function writeAlerts(alerts: Alert[]) {
  try {
    window.localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
  } catch {
    /* storage unavailable: alerts last for this visit only */
  }
}

export function Dashboard({ initial }: { initial: Data }) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState<View>("overview");
  const [size, setSize] = useState<Size>("a");
  const tickers = Object.keys(data.stocks);
  const [ticker, setTicker] = useState(tickers[0] ?? "NVDA");

  // Refresh once a round; the collector writes a new file every five minutes.
  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const res = await fetch(DATA_URL, { cache: "no-store" });
        if (res.ok) {
          const next = (await res.json()) as Data;
          if (next.rounds?.length) setData(next);
        }
      } catch {
        /* keep showing the last good round */
      }
    }, 300_000);
    return () => window.clearInterval(id);
  }, []);

  const stock = data.stocks[ticker] ?? data.stocks[tickers[0]];
  const headings: Record<View, [string, string]> = {
    overview: ["Overview", `${ticker} across every venue, ${SIZES[size].label} buys`],
    venues: ["Venues", `Every venue, round of ${updatedLabel(data)}`],
    alerts: ["Alerts", "Get told when a venue drifts too far from Nasdaq"],
    agent: ["Agent API", "The same answers, sold to trading bots"],
  };

  return (
    <div className="app">
      <aside className="side">
        <Link href="/" className="home">
          <Logo />
          <span>ASSAYER</span>
        </Link>
        <nav className="nav" aria-label="Dashboard">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" onClick={() => setView(v.key)} aria-current={v.key === view ? "page" : undefined}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={v.icon} />
              </svg>
              {v.label}
            </button>
          ))}
        </nav>
        <div className="status">
          <span>
            Last round <b>{data.updated ? data.updated.slice(11, 16) + " UTC" : "none"}</b>
          </span>
          <span>Collected every 5 minutes</span>
          <span>
            Nasdaq <b>{data.market_open ? "open" : "closed"}</b>
          </span>
        </div>
      </aside>

      <div className="body">
        <div className="tape" role="group" aria-label="Stocks">
          {tickers.map((t) => {
            const sp = spread(data.stocks[t], size);
            return (
              <button key={t} type="button" aria-pressed={t === ticker} onClick={() => setTicker(t)}>
                <span className="line">
                  <span className="t">{t}</span>
                  <span>{money(data.stocks[t].ref)}</span>
                </span>
                <span className="line s">
                  <span className="muted">Spread</span>
                  <span className={isDear(sp) ? "coral strong" : "gold strong"}>{pts(sp)}</span>
                </span>
              </button>
            );
          })}
        </div>

        <main className="main">
          <div className="title-row">
            <div>
              <h1>{headings[view][0]}</h1>
              <span className="sub">{headings[view][1]}</span>
            </div>
            <div className="toggle" role="group" aria-label="Trade size">
              {(Object.keys(SIZES) as Size[]).map((k) => (
                <button key={k} type="button" aria-pressed={k === size} onClick={() => setSize(k)}>
                  {SIZES[k].label}
                </button>
              ))}
            </div>
          </div>

          {view === "overview" && stock && (
            <Overview data={data} ticker={ticker} size={size} onPick={setTicker} />
          )}
          {view === "venues" && <Venues data={data} size={size} />}
          {view === "alerts" && <Alerts data={data} size={size} />}
          {view === "agent" && <Agent ticker={ticker} size={size} />}

          <footer className="dash-foot">
            <span>Prices from Finnhub (Nasdaq), Jupiter (Solana) and KyberSwap (Ethereum, BNB Chain). Stablecoins counted at $1.</span>
            <a href={RAW_URL}>Raw rounds on GitHub</a>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Overview({ data, ticker, size, onPick }: { data: Data; ticker: string; size: Size; onPick: (t: string) => void }) {
  const stock = data.stocks[ticker];
  const r = ranked(stock, size);
  const refX = xpos(0);
  const label = SIZES[size].label;
  const sp = spread(stock, size);

  return (
    <>
      <div className="grid">
        <section className="panel wide">
          <div className="panel-head">
            <h2>
              {ticker} buy price at {label} by venue, against Nasdaq
            </h2>
            <span className="muted">Log scale</span>
          </div>
          <div className="bars">
            <div className="row" style={{ borderTop: "none", paddingTop: 0 }}>
              <div className="lab" />
              <div className="axis">
                {[
                  [0, "0%"],
                  [0.1, "+0.1%"],
                  [1, "+1%"],
                  [10, "+10%"],
                  [100, "+100%"],
                  [1000, "+1,000%"],
                ].map(([p, l]) => (
                  <span key={l} style={{ left: `${xpos(p as number)}%` }}>
                    {l}
                  </span>
                ))}
              </div>
            </div>
            {r.map(({ venue, premium }) => {
              const px = xpos(premium);
              return (
                <div className="row" key={venue.id}>
                  <div className="lab">
                    <span className="strong">{venue.symbol}</span>
                    <small>
                      {venue.issuer} on {chainName(venue.chain)}
                    </small>
                  </div>
                  <div className="plot">
                    <div className="refline" style={{ left: `${refX}%` }} />
                    <div className="reach" style={{ left: `${Math.min(refX, px)}%`, width: `${Math.abs(px - refX)}%` }} />
                    <div className="mark" style={{ left: `${px}%`, background: isDear(premium) ? "var(--coral)" : "var(--gold)" }} />
                  </div>
                </div>
              );
            })}
            <div className="row">
              <div className="lab muted">Nasdaq</div>
              <div className="axis">
                <span className="strong" style={{ left: `${refX}%`, color: "var(--ivory)" }}>
                  {money(stock.ref)}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="panel narrow">
          <h2>
            {ticker} venues at {label}
          </h2>
          <table>
            <thead>
              <tr>
                <th>Venue</th>
                <th>Price</th>
                <th>Over Nasdaq</th>
              </tr>
            </thead>
            <tbody>
              {r.map(({ venue, premium }) => (
                <tr key={venue.id}>
                  <td>
                    <span className="key" style={{ background: colorOf(venue) }} />
                    {venue.symbol} <span className="muted">{chainName(venue.chain)}</span>
                  </td>
                  <td>{money(size === "a" ? venue.ap : venue.bp)}</td>
                  <td className={isDear(premium) ? "coral strong" : "strong"}>{pct(premium)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="facts">
            <div>
              <span className="muted">Cheapest venue</span>
              <span>{r[0] ? `${venueName(r[0].venue)}, ${pct(r[0].premium)}` : "None"}</span>
            </div>
            <div>
              <span className="muted">Spread</span>
              <span className={isDear(sp) ? "coral strong" : "gold strong"}>{pts(sp)}</span>
            </div>
          </div>
        </section>
      </div>

      <History data={data} ticker={ticker} size={size} />

      <section className="panel">
        <h2>Premium over Nasdaq at {label}, every stock and venue</h2>
        <div className="scroll-x">
          <table className="matrix">
            <thead>
              <tr>
                <th>Stock</th>
                {COLUMNS.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(data.stocks).map((t) => (
                <tr key={t}>
                  <td>
                    <button type="button" className="pick" aria-pressed={t === ticker} onClick={() => onPick(t)}>
                      {t}
                    </button>
                  </td>
                  {COLUMNS.map((c) => {
                    const v = data.stocks[t].venues.find((x) => columnOf(x) === c.key);
                    const p = v ? latest(v, size) : null;
                    return (
                      <td key={c.key} style={heat(p)}>
                        {v ? pct(p) : "No token"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function heat(p: number | null): React.CSSProperties {
  if (p === null) return { color: "rgba(242,239,232,0.35)", background: "#000" };
  const a = Math.min(0.85, 0.08 + 0.8 * Math.max(0, symlog(p)));
  return p >= 1
    ? { color: "#FBEFEA", background: `rgba(229,131,99,${a.toFixed(2)})` }
    : { color: "#F2EFE8", background: `rgba(214,174,85,${(0.06 + a * 0.3).toFixed(2)})` };
}

function History({ data, ticker, size }: { data: Data; ticker: string; size: Size }) {
  const stock = data.stocks[ticker];
  const n = data.rounds.length;
  const W = 1000;
  const H = 260;
  const PAD = 14;
  const lo = -0.12;
  const yv = (p: number) => H - PAD - ((H - 2 * PAD) * (Math.max(lo, symlog(p)) - lo)) / (1 - lo);
  const xv = (i: number) => (n > 1 ? (W * i) / (n - 1) : W / 2);

  const path = (series: (number | null)[]) => {
    let d = "";
    let pen = false;
    series.forEach((p, i) => {
      if (p === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${xv(i).toFixed(1)} ${yv(p).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };

  const step = Math.max(1, Math.ceil(n / 6));
  const xticks = data.rounds.map((t, i) => ({ t, i })).filter(({ i }) => i % step === 0);
  const yticks: [number, string][] = [
    [-1, "−1%"],
    [0, "0%"],
    [0.1, "0.1%"],
    [1, "1%"],
    [10, "10%"],
    [100, "100%"],
    [1000, "1,000%"],
  ];

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          {ticker} premium over Nasdaq at {SIZES[size].label} by venue, last {n} rounds to {updatedLabel(data)}
        </h2>
        <span className="muted">Log scale, one point per round, UTC</span>
      </div>
      <div className="chart">
        <div className="y">
          {yticks.map(([p, l]) => (
            <span key={l} style={{ top: `${(yv(p) / H) * 100}%` }}>
              {l}
            </span>
          ))}
        </div>
        <div className="area">
          {yticks.map(([p, l]) => (
            <div key={l} className="grid-line" style={{ top: `${(yv(p) / H) * 100}%` }} />
          ))}
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${ticker} premium history`}>
            {stock.venues.map((v: Venue) => (
              <path key={v.id} d={path(v[size])} fill="none" stroke={colorOf(v)} strokeWidth={2.25} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            ))}
          </svg>
          {stock.venues.map((v) => {
            const p = latest(v, size);
            return p === null ? null : (
              <span key={v.id} className="end" style={{ top: `${(yv(p) / H) * 100}%`, color: colorOf(v) }}>
                {v.symbol} {chainName(v.chain)}
              </span>
            );
          })}
        </div>
        <div className="pad" />
      </div>
      <div className="chart">
        <div className="y" style={{ height: 16 }} />
        <div className="x">
          {xticks.map(({ t, i }) => (
            <span key={i} style={{ left: `${(xv(i) / W) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="pad" />
      </div>
    </section>
  );
}

function Venues({ data, size }: { data: Data; size: Size }) {
  const [desc, setDesc] = useState(true);
  const rows = useMemo(() => {
    const all = Object.values(data.stocks).flatMap((s) => s.venues.map((v) => ({ v, a: latest(v, "a"), b: latest(v, "b") })));
    const key = (r: { a: number | null; b: number | null }) => r[size] ?? -Infinity;
    return all.sort((x, y) => (desc ? key(y) - key(x) : key(x) - key(y)));
  }, [data, size, desc]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>
          All {rows.length} venues at both sizes, sorted by premium at {SIZES[size].label}
        </h2>
        <button type="button" className="small-btn" onClick={() => setDesc(!desc)}>
          {desc ? "Dearest first" : "Cheapest first"}
        </button>
      </div>
      <div className="scroll-x">
        <table style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>Token</th>
              <th className="l">Issuer</th>
              <th className="l">Chain</th>
              <th>At $1,000</th>
              <th>At $10,000</th>
              <th>Size penalty</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ v, a, b }) => (
              <tr key={v.id}>
                <td className="strong">{v.symbol}</td>
                <td className="l muted">{v.issuer}</td>
                <td className="l muted">{chainName(v.chain)}</td>
                <td className={isDear(a) ? "coral strong" : "strong"}>{pct(a)}</td>
                <td className={isDear(b) ? "coral strong" : "strong"}>{pct(b)}</td>
                <td className="muted">{a !== null && b !== null ? (b - a >= 0 ? "+" : "") + pts(b - a) : "None"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Alerts({ data, size }: { data: Data; size: Size }) {
  const tickers = Object.keys(data.stocks);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [form, setForm] = useState({ ticker: tickers[0] ?? "NVDA", threshold: "1" });
  const [error, setError] = useState("");

  useEffect(() => setAlerts(readAlerts()), []);
  const save = (next: Alert[]) => {
    setAlerts(next);
    writeAlerts(next);
  };

  const add = () => {
    const th = Number.parseFloat(form.threshold);
    if (!Number.isFinite(th) || th < 0) {
      setError("Enter a percentage of 0 or more, such as 1 or 2.5.");
      return;
    }
    setError("");
    save([...alerts, { id: Date.now(), ticker: form.ticker, threshold: th }]);
  };

  return (
    <div className="grid" style={{ alignItems: "flex-start" }}>
      <section className="panel narrow">
        <h2>New alert</h2>
        <label className="field">
          Stock
          <select value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value })}>
            {tickers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Alert me when any venue is more than this far over Nasdaq (%)
          <input type="number" min="0" step="0.1" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
        </label>
        {error && <span className="coral">{error}</span>}
        <button type="button" className="pill pill-gold" onClick={add}>
          Create alert
        </button>
        <span className="muted">Alerts are checked against every new round and saved in this browser.</span>
      </section>
      <section className="panel wide">
        <h2>Your alerts</h2>
        {alerts.length === 0 && <p className="muted" style={{ margin: 0 }}>No alerts yet. Create one to see when a gap opens.</p>}
        {alerts.map((al) => {
          const s = data.stocks[al.ticker];
          const worst = s ? ranked(s, size).at(-1) : undefined;
          const firing = worst !== undefined && worst.premium > al.threshold;
          return (
            <div className="alert-row" key={al.id}>
              <div>
                <span className="strong">
                  {al.ticker} over {al.threshold}% at {SIZES[size].label}
                </span>
                <small className={firing ? "coral" : "muted"}>
                  {!worst
                    ? "No prices for this stock in the latest round"
                    : firing
                      ? `Firing now: ${venueName(worst.venue)} is ${pct(worst.premium)}`
                      : `Quiet: every venue is within ${al.threshold}%`}
                </small>
              </div>
              <button type="button" className="small-btn" onClick={() => save(alerts.filter((x) => x.id !== al.id))}>
                Delete
              </button>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function Agent({ ticker, size }: { ticker: string; size: Size }) {
  const [step, setStep] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const request = { ticker, side: "buy", size_usd: SIZES[size].usd };

  useEffect(() => {
    setStep(0);
    setBody(`POST /api/v1/best-venue\n\n${JSON.stringify(request, null, 2)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker, size]);

  const call = async (preview: boolean) => {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/best-venue", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...request, preview }),
      });
      setBody(`HTTP ${res.status} ${res.statusText}\n\n${JSON.stringify(await res.json(), null, 2)}`);
      setStep(preview ? 2 : 1);
    } catch {
      setBody("The request did not reach the server. Check your connection and send it again.");
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    ["Request", `POST /api/v1/best-venue for ${ticker} at ${SIZES[size].label}`],
    ["Payment due", "0.25 USDC to a NEAR Intents deposit address, from any chain"],
    ["Answer", "The cheapest venue in the latest round"],
  ];

  return (
    <div className="grid">
      <section className="panel narrow">
        <h2>Ask the Assayer Agent</h2>
        <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
          A bot asks where {ticker} is cheapest at {SIZES[size].label}. Paid answers settle through NEAR Intents; this
          page uses the free preview so you can see the real response.
        </p>
        {steps.map(([title, text], i) => (
          <div key={title} className={`step ${i === step ? "now" : i < step ? "done" : ""}`}>
            <span className="strong">{title}</span>
            <span className="muted">{text}</span>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: "auto" }}>
          <button
            type="button"
            className="pill pill-gold"
            style={{ flex: 1 }}
            disabled={busy || step === 2}
            onClick={() => call(step === 1)}
          >
            {step === 0 ? "Send request" : step === 1 ? "Get the preview answer" : "Answered"}
          </button>
          <button
            type="button"
            className="pill pill-ghost"
            onClick={() => {
              setStep(0);
              setBody(`POST /api/v1/best-venue\n\n${JSON.stringify(request, null, 2)}`);
            }}
          >
            Reset
          </button>
        </div>
      </section>
      <section className="wide" style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <span className="muted">{step === 0 ? "Request" : "Response"}</span>
        <pre className="code" aria-live="polite">
          {body}
        </pre>
      </section>
    </div>
  );
}
