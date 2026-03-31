diff --git a/live_stock_analysis_predictor.py b/live_stock_analysis_predictor.py
new file mode 100644
index 0000000000000000000000000000000000000000..322bfa0c0d2c008290c9b678aed2f2520c18e4ed
--- /dev/null
+++ b/live_stock_analysis_predictor.py
@@ -0,0 +1,174 @@
+"""
+Live Stock Analysis + 2-Month and 5-Month Forecasts
+
+What this script does
+---------------------
+1) Pulls recent market data from Yahoo Finance (live at runtime).
+2) Groups stocks by major US indices and analyzes 3 stocks per index.
+3) Produces simple trend-based forecasts for approximately:
+   - 2 months ahead (~42 trading days)
+   - 5 months ahead (~105 trading days)
+
+Notes
+-----
+- Forecasts are model-based estimates (not financial advice).
+- A log-price linear trend is used as a transparent baseline model.
+"""
+
+from __future__ import annotations
+
+import argparse
+import math
+from dataclasses import dataclass
+from datetime import datetime, timezone
+from typing import Dict, Iterable, List
+
+import numpy as np
+import pandas as pd
+import yfinance as yf
+
+
+# 3 stocks from each index (US-focused)
+INDEX_STOCKS: Dict[str, List[str]] = {
+    "S&P 500": ["AAPL", "MSFT", "JPM"],
+    "NASDAQ-100": ["NVDA", "AMZN", "META"],
+    "DOW JONES": ["UNH", "HD", "V"],
+}
+
+TRADING_DAYS_2_MONTHS = 42
+TRADING_DAYS_5_MONTHS = 105
+
+
+@dataclass
+class ForecastResult:
+    ticker: str
+    last_close: float
+    avg_daily_return: float
+    annualized_volatility: float
+    predicted_2m: float
+    predicted_5m: float
+
+
+def _safe_float(value: float) -> float:
+    """Round for stable printing while keeping numeric operations easy."""
+    return float(np.round(value, 4))
+
+
+def fetch_close_series(ticker: str, period: str) -> pd.Series:
+    """Fetch close price series for a ticker."""
+    frame = yf.download(ticker, period=period, interval="1d", auto_adjust=True, progress=False)
+    if frame.empty or "Close" not in frame:
+        raise ValueError(f"No close price data returned for {ticker}.")
+
+    series = frame["Close"].dropna()
+    if series.empty:
+        raise ValueError(f"Close price series is empty for {ticker}.")
+    return series
+
+
+def fit_log_linear_forecast(close: pd.Series, horizon_days: int) -> float:
+    """Forecast by fitting linear trend on log prices and projecting forward."""
+    if len(close) < 30:
+        raise ValueError("At least 30 daily data points are required for forecasting.")
+
+    y = np.log(close.to_numpy())
+    x = np.arange(len(y), dtype=float)
+
+    # y = a*x + b
+    slope, intercept = np.polyfit(x, y, 1)
+    future_x = len(y) - 1 + horizon_days
+    predicted_log_price = slope * future_x + intercept
+    predicted_price = math.exp(predicted_log_price)
+    return predicted_price
+
+
+def analyze_ticker(ticker: str, period: str) -> ForecastResult:
+    close = fetch_close_series(ticker=ticker, period=period)
+    returns = close.pct_change().dropna()
+
+    last_close = close.iloc[-1]
+    avg_daily_return = returns.mean()
+    annualized_volatility = returns.std() * math.sqrt(252)
+
+    pred_2m = fit_log_linear_forecast(close, TRADING_DAYS_2_MONTHS)
+    pred_5m = fit_log_linear_forecast(close, TRADING_DAYS_5_MONTHS)
+
+    return ForecastResult(
+        ticker=ticker,
+        last_close=_safe_float(last_close),
+        avg_daily_return=_safe_float(avg_daily_return),
+        annualized_volatility=_safe_float(annualized_volatility),
+        predicted_2m=_safe_float(pred_2m),
+        predicted_5m=_safe_float(pred_5m),
+    )
+
+
+def analyze_indices(period: str) -> Dict[str, List[ForecastResult]]:
+    report: Dict[str, List[ForecastResult]] = {}
+
+    for index_name, tickers in INDEX_STOCKS.items():
+        results: List[ForecastResult] = []
+        for ticker in tickers:
+            try:
+                result = analyze_ticker(ticker=ticker, period=period)
+                results.append(result)
+            except Exception as exc:  # Keep report running even if one ticker fails.
+                print(f"[WARN] {index_name}::{ticker} failed: {exc}")
+        report[index_name] = results
+
+    return report
+
+
+def print_report(report: Dict[str, List[ForecastResult]]) -> None:
+    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
+    print("\n" + "=" * 84)
+    print("LIVE STOCK ANALYSIS + FORECAST REPORT")
+    print(f"Generated: {generated_at}")
+    print("Model: log-linear trend on adjusted close prices")
+    print("Forecast horizons: ~2 months (42 trading days), ~5 months (105 trading days)")
+    print("=" * 84)
+
+    for index_name, rows in report.items():
+        print(f"\n[{index_name}]")
+        if not rows:
+            print("  No successful results for this index.")
+            continue
+
+        table = pd.DataFrame(
+            [
+                {
+                    "Ticker": r.ticker,
+                    "Last Close": r.last_close,
+                    "Avg Daily Return": r.avg_daily_return,
+                    "Ann. Volatility": r.annualized_volatility,
+                    "Predicted 2M": r.predicted_2m,
+                    "Predicted 5M": r.predicted_5m,
+                }
+                for r in rows
+            ]
+        )
+        print(table.to_string(index=False))
+
+
+
+def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
+    parser = argparse.ArgumentParser(
+        description="Live stock analysis and 2M/5M predictor for 3 stocks per major index."
+    )
+    parser.add_argument(
+        "--period",
+        default="18mo",
+        help="Historical period to fit trend model (default: 18mo).",
+    )
+    return parser.parse_args(argv)
+
+
+
+def main() -> None:
+    args = parse_args()
+    report = analyze_indices(period=args.period)
+    print_report(report)
+
+
+if __name__ == "__main__":
+    main()
