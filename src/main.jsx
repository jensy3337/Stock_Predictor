import React from "react";
import { createRoot } from "react-dom/client";
import { createChart, LineStyle } from "lightweight-charts";
import "./styles.css";

const INSTRUMENTS = [
  { name: "Reliance Industries", symbol: "RELIANCE.NS", short: "RELIANCE", index: "NIFTY 50", sector: "Energy" },
  { name: "HDFC Bank", symbol: "HDFCBANK.NS", short: "HDFCBANK", index: "NIFTY 50", sector: "Banking" },
  { name: "Infosys", symbol: "INFY.NS", short: "INFY", index: "NIFTY 50", sector: "IT" },
  { name: "TCS", symbol: "TCS.NS", short: "TCS", index: "SENSEX", sector: "IT" },
  { name: "ICICI Bank", symbol: "ICICIBANK.NS", short: "ICICIBANK", index: "SENSEX", sector: "Banking" },
  { name: "Larsen & Toubro", symbol: "LT.NS", short: "LT", index: "SENSEX", sector: "Auto" },
  { name: "Axis Bank", symbol: "AXISBANK.NS", short: "AXISBANK", index: "NIFTY BANK", sector: "Banking" },
  { name: "Kotak Mahindra Bank", symbol: "KOTAKBANK.NS", short: "KOTAKBANK", index: "NIFTY BANK", sector: "Banking" },
  { name: "State Bank of India", symbol: "SBIN.NS", short: "SBIN", index: "NIFTY BANK", sector: "Banking" },
  { name: "Crude Oil", symbol: "CL=F", short: "CRUDEOIL", index: "MCX", sector: "Commodity", commodity: true },
  { name: "Gold", symbol: "GC=F", short: "GOLD", index: "MCX", sector: "Commodity", commodity: true },
  { name: "Silver", symbol: "SI=F", short: "SILVER", index: "MCX", sector: "Commodity", commodity: true }
];

const SECTORS = ["All", "Banking", "IT", "Energy", "FMCG", "Auto", "Pharma"];
const WATCHLIST_KEY = "imp_watchlist";
const ALERTS_KEY = "imp_alerts";
const quoteCache = new Map();
const historyCache = new Map();

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

const safeJson = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
};

const isMarketOpenIST = () => {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const day = ist.getDay();
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return day >= 1 && day <= 5 && mins >= 555 && mins <= 930;
};

const linearRegressionPredict = (data, futureCount = 44) => {
  if (!data || data.length < 30) return [];
  const y = data.map((d) => d.value);
  const n = y.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const sx = x.reduce((a, b) => a + b, 0);
  const sy = y.reduce((a, b) => a + b, 0);
  const sxy = x.reduce((a, xv, i) => a + xv * y[i], 0);
  const sxx = x.reduce((a, xv) => a + xv * xv, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  const out = [];
  const last = data[data.length - 1].time;
  for (let i = 1; i <= futureCount; i++) {
    out.push({ time: last + 86400 * i, value: Number((slope * (n - 1 + i) + intercept).toFixed(2)) });
  }
  return out;
};

const fetchYahooChart = async (symbol, range = "6mo") => {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Quote fetch failed");
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("Malformed quote response");
  const q = result.indicators.quote[0];
  const timestamps = result.timestamp || [];
  const rows = timestamps.map((t, i) => ({
    time: t,
    open: q.open?.[i],
    high: q.high?.[i],
    low: q.low?.[i],
    close: q.close?.[i],
    volume: q.volume?.[i]
  })).filter((r) => Number.isFinite(r.open) && Number.isFinite(r.close));
  return { rows, meta: result.meta };
};

const mockData = (seed = 1000) => {
  const rows = [];
  let p = seed;
  const start = Math.floor(new Date("2025-11-01").getTime() / 1000);
  for (let i = 0; i < 151; i++) {
    const drift = (Math.random() - 0.45) * 25;
    const open = p;
    const close = Math.max(50, open + drift);
    const high = Math.max(open, close) + Math.random() * 10;
    const low = Math.min(open, close) - Math.random() * 10;
    rows.push({ time: start + i * 86400, open, high, low, close, volume: 100000 + Math.random() * 600000 });
    p = close;
  }
  return rows;
};

function App() {
  const [page, setPage] = React.useState("Dashboard");
  const [selected, setSelected] = React.useState(INSTRUMENTS[0]);
  const [quotes, setQuotes] = React.useState({});
  const [history, setHistory] = React.useState([]);
  const [sector, setSector] = React.useState("All");
  const [watchlist, setWatchlist] = React.useState(() => safeJson(WATCHLIST_KEY, []));
  const [alerts, setAlerts] = React.useState(() => safeJson(ALERTS_KEY, []));
  const [news, setNews] = React.useState([]);
  const [newsLoading, setNewsLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [statusOpen, setStatusOpen] = React.useState(isMarketOpenIST());
  const [delayWarning, setDelayWarning] = React.useState(false);

  const filtered = INSTRUMENTS.filter((i) => sector === "All" || i.commodity || i.sector === sector);
  const searchResults = search.length < 2 ? [] : INSTRUMENTS.filter((i) =>
    `${i.short} ${i.name}`.toLowerCase().includes(search.toLowerCase())
  );

  React.useEffect(() => localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist.slice(0, 20))), [watchlist]);
  React.useEffect(() => localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts.slice(0, 10))), [alerts]);

  React.useEffect(() => {
    const tick = () => setStatusOpen(isMarketOpenIST());
    tick();
    const id = setInterval(tick, 1000 * 30);
    return () => clearInterval(id);
  }, []);

  const refreshQuotes = React.useCallback(async () => {
    if (document.hidden) return;
    const out = {};
    let delayed = false;
    for (const item of INSTRUMENTS) {
      const cached = quoteCache.get(item.symbol);
      if (cached && Date.now() - cached.ts < 15000) {
        out[item.symbol] = cached.data;
        continue;
      }
      try {
        const { rows } = await fetchYahooChart(item.symbol, "5d");
        const last = rows.at(-1);
        const prev = rows.at(-2) || last;
        const data = {
          price: last.close,
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
          volume: last.volume,
          changePct: ((last.close - prev.close) / prev.close) * 100
        };
        out[item.symbol] = data;
        quoteCache.set(item.symbol, { ts: Date.now(), data });
      } catch {
        delayed = true;
        const c = quoteCache.get(item.symbol)?.data;
        out[item.symbol] = c || {
          price: 0, open: 0, high: 0, low: 0, close: 0, volume: 0, changePct: 0
        };
      }
    }
    setDelayWarning(delayed);
    setQuotes(out);
  }, []);

  const refreshHistory = React.useCallback(async () => {
    const cached = historyCache.get(selected.symbol);
    if (cached && Date.now() - cached.ts < 15000) {
      setHistory(cached.data);
      return;
    }
    try {
      const { rows } = await fetchYahooChart(selected.symbol, "6mo");
      historyCache.set(selected.symbol, { ts: Date.now(), data: rows });
      setHistory(rows);
    } catch {
      const fallback = mockData(1000 + Math.random() * 500);
      setHistory(fallback);
      setDelayWarning(true);
    }
  }, [selected.symbol]);

  React.useEffect(() => {
    refreshQuotes();
    refreshHistory();
    const qId = setInterval(refreshQuotes, 15000);
    const vis = () => !document.hidden && refreshQuotes();
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(qId);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [refreshHistory, refreshQuotes]);

  React.useEffect(() => { refreshHistory(); }, [selected, refreshHistory]);

  React.useEffect(() => {
    const id = setInterval(async () => {
      if (document.hidden) return;
      setNewsLoading(true);
      try {
        const rss = await fetch("https://api.rss2json.com/v1/api.json?rss_url=https://www.moneycontrol.com/rss/business.xml");
        const json = await rss.json();
        const items = (json.items || []).slice(0, 8).map((it) => ({ title: it.title, link: it.link, source: "Moneycontrol", pubDate: it.pubDate }));
        setNews(items);
      } catch {
        setNews([
          { title: "Indian market opens mixed amid global cues", source: "Sample Feed", pubDate: new Date().toISOString(), link: "#" },
          { title: "Banking stocks lead gains in early trade", source: "Sample Feed", pubDate: new Date().toISOString(), link: "#" },
          { title: "Rupee remains stable against dollar", source: "Sample Feed", pubDate: new Date().toISOString(), link: "#" },
          { title: "Crude and gold show volatility", source: "Sample Feed", pubDate: new Date().toISOString(), link: "#" },
          { title: "Analysts track Q4 earnings expectations", source: "Sample Feed", pubDate: new Date().toISOString(), link: "#" },
          { title: "Nifty and Sensex close flat", source: "Sample Feed", pubDate: new Date().toISOString(), link: "#" }
        ]);
      } finally {
        setNewsLoading(false);
      }
    }, 300000);
    return () => clearInterval(id);
  }, []);

  React.useEffect(() => {
    const triggered = [];
    alerts.forEach((a) => {
      const q = quotes[a.symbol];
      if (!q) return;
      const hit = a.condition === "Above" ? q.price >= a.target : q.price <= a.target;
      if (hit) triggered.push(a);
    });
    if (!triggered.length) return;
    triggered.forEach((a) => {
      if (Notification.permission === "granted") {
        new Notification(`Price alert: ${a.short}`, { body: `${a.condition} ₹${a.target}` });
      } else {
        alert(`Price alert: ${a.short} ${a.condition} ₹${a.target}`);
      }
    });
    setAlerts((prev) => prev.filter((a) => !triggered.find((t) => t.id === a.id)));
  }, [alerts, quotes]);

  const sorted = Object.entries(quotes).map(([symbol, q]) => ({ symbol, ...q })).sort((a, b) => b.changePct - a.changePct);
  const gainers = sorted.slice(0, 5);
  const losers = [...sorted].reverse().slice(0, 5);
  const sentiment = gainers.length > losers.length ? "Bullish" : gainers.length === losers.length ? "Neutral" : "Bearish";

  return (
    <div className="app">
      <header className="header">
        <h1>IndiaMarket Pro</h1>
        <nav>
          <button onClick={() => setPage("Dashboard")}>Dashboard</button>
          <button onClick={() => setPage("Education")}>Education</button>
        </nav>
        <span className={`badge ${statusOpen ? "open" : "closed"}`}>{statusOpen ? "Open" : "Closed"}</span>
        <input placeholder="Search RELIANCE, HDFCBANK" value={search} onChange={(e) => setSearch(e.target.value)} />
        {search.length >= 2 && <div className="dropdown">{searchResults.length ? searchResults.map((r) => <div key={r.symbol} onClick={() => { setSelected(r); setSearch(""); }}>{r.short} - {r.name}</div>) : <div>No results found</div>}</div>}
      </header>

      {page === "Dashboard" ? (
        <>
          {delayWarning && <div className="warn">Data may be delayed</div>}
          <div className="chips">{SECTORS.map((s) => <button key={s} className={s === sector ? "active" : ""} onClick={() => setSector(s)}>{s}</button>)}</div>
          <div className="grid cards">{filtered.map((i) => {
            const q = quotes[i.symbol] || {};
            return <article key={i.symbol} onClick={() => setSelected(i)}>
              <h3>{i.name} ({i.short})</h3><small>{i.index}</small>
              <p>{INR.format(q.price || 0)}</p>
              <p>O:{(q.open || 0).toFixed(2)} H:{(q.high || 0).toFixed(2)} L:{(q.low || 0).toFixed(2)} C:{(q.close || 0).toFixed(2)}</p>
              <p>Vol: {Math.round(q.volume || 0).toLocaleString("en-IN")}</p>
              <p className={q.changePct >= 0 ? "pos" : "neg"}>{(q.changePct || 0).toFixed(2)}%</p>
            </article>;
          })}</div>
          <div className="layout">
            <ChartPanel history={history} selected={selected} quote={quotes[selected.symbol]} />
            <aside>
              <Watchlist selected={selected} quotes={quotes} watchlist={watchlist} setWatchlist={setWatchlist} setSelected={setSelected} />
              <Alerts selected={selected} alerts={alerts} setAlerts={setAlerts} />
            </aside>
          </div>
          <div className="layout">
            <Top title="Top 5 Gainers" rows={gainers} />
            <Top title="Top 5 Losers" rows={losers} />
            <Heatmap quotes={quotes} />
            <div className={`sentiment ${sentiment.toLowerCase()}`}>Market Sentiment: {sentiment}</div>
          </div>
          <section className="news"><h2>Indian Financial News</h2>{newsLoading ? <p>Loading...</p> : news.map((n, idx) => <a key={idx} href={n.link} target="_blank">{n.title} - {n.source} ({new Date(n.pubDate).toLocaleString()})</a>)}</section>
        </>
      ) : <Education />}
    </div>
  );
}

function ChartPanel({ history, selected, quote }) {
  const ref = React.useRef(null);
  const [hover, setHover] = React.useState(null);
  React.useEffect(() => {
    if (!ref.current || !history.length) return;
    ref.current.innerHTML = "";
    const chart = createChart(ref.current, { height: 360, layout: { background: { color: "#111827" }, textColor: "#d1d5db" }, grid: { vertLines: { color: "#1f2937" }, horzLines: { color: "#1f2937" } } });
    const candle = chart.addCandlestickSeries();
    const candleData = history.map((r) => ({ time: r.time, open: r.open, high: r.high, low: r.low, close: r.close }));
    candle.setData(candleData);
    const predBase = history.map((r) => ({ time: r.time, value: r.close }));
    const predData = linearRegressionPredict(predBase, 44);
    if (predData.length) {
      const pred = chart.addLineSeries({ color: "#60a5fa", lineStyle: LineStyle.Dashed, lineWidth: 2 });
      pred.setData([...predBase.slice(-1), ...predData]);
    }
    chart.timeScale().fitContent();
    chart.subscribeCrosshairMove((param) => {
      if (!param?.seriesData?.size) return;
      const v = param.seriesData.get(candle);
      if (!v) return;
      setHover(v);
    });
    const ro = new ResizeObserver(() => chart.applyOptions({ width: ref.current.clientWidth }));
    ro.observe(ref.current);
    return () => { ro.disconnect(); chart.remove(); };
  }, [history]);

  return <section className="chart"><h2>{selected.name} ({selected.short})</h2>
    <div className="tf"><button>1W</button><button>1M</button><button>3M</button><button>5M</button><span>AI-Based Prediction (Not Guaranteed)</span></div>
    <div ref={ref} />
    <div className="ohlc">{hover ? `O:${hover.open?.toFixed(2)} H:${hover.high?.toFixed(2)} L:${hover.low?.toFixed(2)} C:${hover.close?.toFixed(2)} Vol:${Math.round(quote?.volume || 0).toLocaleString("en-IN")}` : "Hover over chart for OHLC"}</div>
  </section>;
}

function Watchlist({ selected, quotes, watchlist, setWatchlist, setSelected }) {
  const add = () => {
    if (watchlist.find((w) => w.symbol === selected.symbol) || watchlist.length >= 20) return;
    setWatchlist([...watchlist, selected]);
  };
  return <section><h3>Watchlist</h3><button onClick={add}>Add current</button>{watchlist.map((w) => <div key={w.symbol} className="row"><span onClick={() => setSelected(w)}>{w.short} {INR.format(quotes[w.symbol]?.price || 0)} ({(quotes[w.symbol]?.changePct || 0).toFixed(2)}%)</span><button onClick={() => setWatchlist(watchlist.filter((x) => x.symbol !== w.symbol))}>x</button></div>)}</section>;
}

function Alerts({ selected, alerts, setAlerts }) {
  const [target, setTarget] = React.useState("");
  const [condition, setCondition] = React.useState("Above");
  return <section><h3>Price Alerts</h3><div className="row"><input placeholder="Target ₹" value={target} onChange={(e) => setTarget(e.target.value)} /><select value={condition} onChange={(e) => setCondition(e.target.value)}><option>Above</option><option>Below</option></select><button onClick={() => {
    if (!target || alerts.length >= 10) return;
    if (Notification.permission === "default") Notification.requestPermission();
    setAlerts([...alerts, { id: Date.now(), symbol: selected.symbol, short: selected.short, target: Number(target), condition }]);
    setTarget("");
  }}>Set</button></div>{alerts.map((a) => <div key={a.id} className="row"><span>{a.short} {a.condition} ₹{a.target}</span><button onClick={() => setAlerts(alerts.filter((x) => x.id !== a.id))}>x</button></div>)}</section>;
}

function Top({ title, rows }) {
  return <section><h3>{title}</h3>{rows.map((r) => <div className="row" key={r.symbol}><span>{r.symbol.replace('.NS', '')}</span><span>{INR.format(r.price || 0)}</span><span className={r.changePct >= 0 ? "pos" : "neg"}>{(r.changePct || 0).toFixed(2)}%</span></div>)}</section>;
}

function Heatmap({ quotes }) {
  const sectors = ["Banking", "IT", "Energy", "FMCG", "Auto", "Pharma"];
  const data = sectors.map((s) => {
    const members = INSTRUMENTS.filter((i) => i.sector === s);
    const avg = members.length ? members.reduce((a, m) => a + (quotes[m.symbol]?.changePct || 0), 0) / members.length : 0;
    return { s, avg };
  });
  return <section><h3>Sector Heatmap</h3><div className="heat">{data.map((d) => <div key={d.s} title={`${d.s}: ${d.avg.toFixed(2)}%`} style={{ background: d.avg >= 0 ? `rgba(16,185,129,${Math.min(0.9, Math.abs(d.avg) / 4 + 0.15)})` : `rgba(239,68,68,${Math.min(0.9, Math.abs(d.avg) / 4 + 0.15)})` }}>{d.s}<br />{d.avg.toFixed(2)}%</div>)}</div></section>;
}

function Education() {
  const sections = [
    ["What is the Stock Market", "The Indian stock market is where shares of listed companies are traded through exchanges like NSE and BSE."],
    ["NSE vs BSE", "NSE is known for NIFTY 50 while BSE is known for SENSEX; both are regulated by SEBI."],
    ["NIFTY & SENSEX Explained", "NIFTY 50 tracks 50 major NSE companies, while SENSEX tracks 30 large BSE companies."],
    ["Bull vs Bear Market", "Bull means broad upward price movement; Bear means broad downward pressure and risk-off sentiment."],
    ["Candlestick Patterns", "Candles show open, high, low, and close. Patterns like doji and engulfing help infer momentum."],
    ["Intraday vs Delivery Trading", "Intraday closes same day; delivery involves holding shares across sessions."],
    ["Market vs Limit Orders", "Market order executes quickly at current price; limit order executes only at your chosen price."],
    ["Basics of Risk Management", "Use position sizing, stop losses, diversification, and avoid over-leverage."],
  ];
  return <section className="education">{sections.map(([t, c]) => <details key={t} open><summary>{t}</summary><p>{c}</p></details>)}</section>;
}

createRoot(document.getElementById("root")).render(<App />);
