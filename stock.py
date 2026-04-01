from flask import Flask, render_template, request
import yfinance as yf
import os

app = Flask(__name__)

# Assets list
ASSETS = {
    "Reliance": "RELIANCE.NS",
    "TCS": "TCS.NS",
    "HDFC Bank": "HDFCBANK.NS",
    "Infosys": "INFY.NS",
    "NIFTY 50": "^NSEI",
    "SENSEX": "^BSESN",
    "Gold": "GC=F",
    "Silver": "SI=F",
    "Crude Oil": "CL=F"
}

def fetch_data(symbol):
    stock = yf.Ticker(symbol)
    hist = stock.history(period='3mo')

    dates = hist.index.strftime('%Y-%m-%d').tolist()
    prices = hist['Close'].round(2).tolist()

    return dates, prices

@app.route('/', methods=['GET', 'POST'])
def home():
    selected = "Reliance"

    if request.method == "POST":
        selected = request.form.get("stock")

    symbol = ASSETS[selected]
    dates, prices = fetch_data(symbol)

    return render_template(
        'index.html',
        dates=dates,
        prices=prices,
        stocks=ASSETS.keys(),
        selected=selected
    )

if __name__ == "__main__":
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
