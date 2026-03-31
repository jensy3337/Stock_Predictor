diff --git a/README.md b/README.md
index cec875d961d3b76f843604d67669d17b38d195c5..fd1d91b7616875c16075bdef99945877e45442ea 100644
--- a/README.md
+++ b/README.md
@@ -1 +1,34 @@
-# Practice-Projects
\ No newline at end of file
+# Practice-Projects
+
+## Live Stock Analysis + Predictor
+
+This repository now includes `live_stock_analysis_predictor.py`, a Python script that:
+
+- Pulls live market data from Yahoo Finance at runtime.
+- Analyzes **3 stocks from each of 3 major US indices**:
+  - S&P 500: `AAPL`, `MSFT`, `JPM`
+  - NASDAQ-100: `NVDA`, `AMZN`, `META`
+  - Dow Jones: `UNH`, `HD`, `V`
+- Predicts price targets for approximately:
+  - **2 months ahead** (`~42` trading days)
+  - **5 months ahead** (`~105` trading days)
+
+### Run
+
+```bash
+python3 live_stock_analysis_predictor.py
+```
+
+Optional period override (historical window used for fitting):
+
+```bash
+python3 live_stock_analysis_predictor.py --period 24mo
+```
+
+### Dependencies
+
+```bash
+pip install yfinance pandas numpy
+```
+
+> Forecasts are trend-based estimates for educational use and are **not financial advice**.
