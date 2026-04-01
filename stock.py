from flask import Flask, render_template
import yfinance as yf

app = Flask(__name__)

def fetch_data():
    stock = yf.Ticker("RELIANCE.NS")
    hist = stock.history(period='3mo')

    # convert to lists for JS
    dates = hist.index.strftime('%Y-%m-%d').tolist()
    prices = hist['Close'].tolist()

    return dates, prices

@app.route('/')
def home():
    dates, prices = fetch_data()
    return render_template('index.html', dates=dates, prices=prices)

if __name__ == "__main__":
    app.run(debug=True)
