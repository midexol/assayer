import Link from "next/link";
import { Logo } from "@/components/Logo";
import { bestVenue, isDear, pct, ranked, symlog, updatedLabel, venueName, money } from "@/lib/assay";
import { loadDashboard } from "@/lib/data";
import { dollars, loadThesis, venueLabel } from "@/lib/thesis";

export const revalidate = 300;

export default async function Landing() {
  const [d, thesis] = await Promise.all([loadDashboard(), loadThesis()]);
  const big = thesis.headline["10000"];
  const worstThin = Object.values(thesis.stocks)
    .flatMap((s) => s["1000"].venues)
    .filter((v) => v.thin && v.median_premium !== null)
    .sort((x, y) => (y.median_premium ?? 0) - (x.median_premium ?? 0))[0];
  const bestNvda = thesis.stocks.NVDA?.["10000"].usable_venues.best_static_venue ?? null;
  const tickers = Object.keys(d.stocks);

  const rows = tickers
    .map((t) => ({ t, stock: d.stocks[t], r: ranked(d.stocks[t], "a") }))
    .filter((x) => x.r.length > 0);

  // The stock with the widest $10,000 spread makes the clearest example.
  const example =
    tickers
      .map((t) => ({ t, r: ranked(d.stocks[t], "b") }))
      .filter((x) => x.r.length > 1)
      .sort((x, y) => y.r[y.r.length - 1].premium - y.r[0].premium - (x.r[x.r.length - 1].premium - x.r[0].premium))[0] ?? null;
  const answer = example ? bestVenue(d, example.t, "b") : null;

  return (
    <main>
      <section className="hero">
        <div className="hero-stage">
          <header className="wrap topbar">
            <span className="brand">
              <Logo size={22} />
              Built at NEAR HACKATHON
            </span>
            <Link href="/dashboard" className="pill pill-ivory">
              Open the dashboard
            </Link>
          </header>
          <div className="hero-center">
            <h1 className="wordmark">ASSAYER</h1>
            <p className="hero-line">
              Tokenized stocks like Nvidia and Tesla trade on Solana, Ethereum, BNB Chain and Gate.io, and the price differs on each.
              Assayer checks every venue against Nasdaq every five minutes and shows where each stock is cheapest to buy.
            </p>
            <Link href="/dashboard" className="pill pill-gold pill-big">
              See today&apos;s prices
            </Link>
          </div>
          <div className="hero-foot">Scroll</div>
        </div>
      </section>

      <section className="wrap section">
        <div className="head-row arrive">
          <h2 className="display">One stock. Many prices.</h2>
          <p className="lede">
            Nvidia, Tesla and Apple now trade as tokens on Solana, Ethereum, BNB Chain and crypto exchanges. The same share does not cost
            the same everywhere.
          </p>
        </div>
        <div className="stock-rows arrive">
          {rows.map(({ t, stock, r }) => {
            const lo = r[0];
            const hi = r[r.length - 1];
            return (
              <div className="stock-row" key={t}>
                <div className="who">
                  <span className="tick">{t}</span>
                  <span className="muted">
                    {stock.name}, Nasdaq {money(stock.ref)}
                  </span>
                </div>
                <div className="cell">
                  <small>Closest token</small>
                  <span>
                    <span className="gold strong">{pct(lo.premium)}</span> {venueName(lo.venue)}
                  </span>
                </div>
                <div className="cell">
                  <small>Dearest token</small>
                  <span>
                    <span className={isDear(hi.premium) ? "coral strong" : "gold strong"}>{pct(hi.premium)}</span>{" "}
                    {venueName(hi.venue)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="note arrive">
          Real $1,000 buys compared with Nasdaq, collection round of {updatedLabel(d)}
          {d.market_open ? "." : ". Nasdaq was closed, so its last price is the reference."}
        </p>
      </section>

      {example && (
        <section className="wrap split">
          <div className="arrive" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <h2 className="display">Weighed every five minutes.</h2>
            <p className="lede">
              Assayer asks each venue what a real $1,000 and $10,000 trade would fill at, then weighs the answer against
              the Nasdaq price from the same minute.
            </p>
          </div>
          <div className="arrive">
            <div className="muted" style={{ display: "flex", justifyContent: "space-between", paddingBottom: 14, fontSize: 13 }}>
              <span>{example.t}, $10,000 buy</span>
              <span>Over Nasdaq</span>
            </div>
            {example.r.map(({ venue, premium }) => {
              const color = isDear(premium) ? "var(--coral)" : "var(--gold)";
              return (
                <div className="scale-row" key={venue.id}>
                  <div className="top">
                    <span>{venueName(venue)}</span>
                    <span className="strong" style={{ color }}>
                      {pct(premium)}
                    </span>
                  </div>
                  <div className="track">
                    <div style={{ width: `${Math.max(1.5, symlog(Math.max(0, premium)) * 100)}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="wrap split">
        <div className="arrive" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <h2 className="display">What the split costs.</h2>
          <p className="lede">
            Measured over {thesis.rounds_used} rounds while Nasdaq was open, on venues that trade near the real price.
            Thin pools are counted separately.
          </p>
        </div>
        <div className="ask arrive">
          <div>
            <small>Buying $10,000 at an average venue instead of the cheapest</small>
            <span className="gold">{dollars(big.tax_mean, 10000)} more</span>
          </div>
          <div>
            <small>Switching venue every round instead of picking one well</small>
            <span>
              {dollars(big.router_savings_mean, 10000)} saved. The cheapest venue barely changes: for Nvidia it was{" "}
              {venueLabel(bestNvda)}.
            </span>
          </div>
          {worstThin && (
            <div>
              <small>The thinnest pool, on median, for a $1,000 buy</small>
              <span className="coral">
                {venueLabel(worstThin.id)}, {pct(worstThin.median_premium)} over Nasdaq
              </span>
            </div>
          )}
        </div>
      </section>

      {answer && (
        <section className="wrap split">
          <div className="arrive" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <h2 className="display">Bots can ask too.</h2>
            <p className="lede">
              A trading bot asks where a stock is cheapest at its size and pays 25 cents in any token, from any chain,
              settled through NEAR Intents.
            </p>
          </div>
          <div className="ask arrive">
            <div>
              <small>The bot asks</small>
              <span>Where is {answer.ticker} cheapest for a $10,000 buy?</span>
            </div>
            <div>
              <small>It pays</small>
              <span>0.25 USDC, from any chain, through NEAR Intents</span>
            </div>
            <div>
              <small>Assayer answers</small>
              <span className="gold">
                {answer.venue}, {pct(answer.over_nasdaq_pct)} over Nasdaq
              </span>
            </div>
          </div>
        </section>
      )}

      <section className="closing">
        <div className="wrap closing-inner arrive">
          <h2 className="display">See every price, live.</h2>
          <Link href="/dashboard" className="pill pill-gold pill-big">
            Open the dashboard
          </Link>
        </div>
        <footer className="wrap footer">
          <span>Assayer, built at NEAR HACKATHON, November 2026</span>
          <span>Prices from Finnhub, Jupiter, KyberSwap and Gate.io</span>
        </footer>
      </section>
    </main>
  );
}
