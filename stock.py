from flask import Flask, render_template, request
import yfinance as yf
import os

app = Flask(__name__)

# Assets (Indian + commodities)
ASSETS = {
    "Reliance": "RELIANCE.NS",
    "TCS": "TCS.NS",
    "Infosys": "INFY.NS",
    "HDFC Bank": "HDFCBANK.NS",
    "NIFTY 50": "^NSEI",
    "SENSEX": "^BSESN",
    "Gold": "GC=F",
    "Silver": "SI=F",
    "Crude Oil": "CL=F"
}

def fetch_data(symbol):
    stock = yf.Ticker(symbol)
    hist = stock.history(period="3mo")

    dates = hist.index.strftime('%Y-%m-%d').tolist()
    prices = hist['Close'].round(2).tolist()

    return dates, prices

@app.route("/", methods=["GET", "POST"])
def home():
    selected = "NIFTY 50"

    if request.method == "POST":
        selected = request.form.get("stock")

    symbol = ASSETS[selected]
    dates, prices = fetch_data(symbol)

    return render_template(
        "index.html",
        stocks=ASSETS.keys(),
        selected=selected,
        dates=dates,
        prices=prices
    )

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)))
