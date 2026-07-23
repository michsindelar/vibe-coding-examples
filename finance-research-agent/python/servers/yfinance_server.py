"""Keyless market-data MCP server backed by yfinance (Yahoo Finance).

Exposes quotes, price history, fundamentals, and earnings surprises as MCP
tools over stdio. No API key required.

Price history is written as a CSV into the shared workspace directory
(FINANCE_AGENT_OUTPUT_DIR) so the python-sandbox MCP server can load it with
pandas — the two servers compose through the filesystem, keeping bulky price
matrices out of the model's context window.
"""

import json
import logging
import os
import re
from pathlib import Path

import yfinance as yf
from mcp.server.fastmcp import FastMCP

# Keep transient Yahoo hiccups out of the REPL — errors still reach the model
# through each tool's JSON result.
logging.getLogger("yfinance").setLevel(logging.CRITICAL)

WORKSPACE = Path(
    os.environ.get("FINANCE_AGENT_OUTPUT_DIR", Path(__file__).resolve().parents[1] / "output")
)

MAX_SYMBOLS = 10

mcp = FastMCP("yfinance", log_level="WARNING")


def _clean_symbols(symbols: list[str]) -> list[str]:
    """Uppercase, strip anything that isn't a ticker character, dedupe."""
    cleaned = []
    for s in symbols:
        s = re.sub(r"[^A-Z0-9.\-^=]", "", s.upper())
        if s and s not in cleaned:
            cleaned.append(s)
    return cleaned[:MAX_SYMBOLS]


def _fail(message: str) -> str:
    return json.dumps({"error": message})


@mcp.tool()
def get_quote(symbols: list[str]) -> str:
    """Get a current market snapshot for one or more stock tickers.

    Call this for questions about the current price, day move, 52-week range,
    or market cap. Returns JSON per symbol: last_price, previous_close,
    day_change_pct, year_high, year_low, market_cap, currency.
    """
    symbols = _clean_symbols(symbols)
    if not symbols:
        return _fail("no valid symbols given")
    out = {}
    for sym in symbols:
        try:
            fi = yf.Ticker(sym).fast_info
            last, prev = fi["lastPrice"], fi["previousClose"]
            out[sym] = {
                "last_price": round(last, 2),
                "previous_close": round(prev, 2),
                "day_change_pct": round((last / prev - 1) * 100, 2) if prev else None,
                "year_high": round(fi["yearHigh"], 2),
                "year_low": round(fi["yearLow"], 2),
                "market_cap": fi["marketCap"],
                "currency": fi["currency"],
            }
        except Exception as exc:  # per-symbol failure shouldn't sink the batch
            out[sym] = {"error": f"{type(exc).__name__}: {exc}"}
    return json.dumps(out)


@mcp.tool()
def get_price_history(symbols: list[str], period: str = "1y", interval: str = "1d") -> str:
    """Download adjusted-close price history and save it as a CSV in the shared
    workspace, for analysis with pandas via the python-sandbox `run_python` tool.

    Call this BEFORE computing returns, volatility, drawdowns, or drawing charts.
    period: e.g. 1mo, 6mo, 1y, 2y, 5y, max. interval: e.g. 1d, 1wk, 1mo.

    Returns JSON with `csv_filename` (load it in run_python with
    pd.read_csv(csv_filename, index_col="Date", parse_dates=True) — the sandbox
    runs inside the workspace), the date range, row count, and each symbol's
    first/last close. The CSV has a Date index column and one adjusted-close
    column per symbol. It is NOT returned inline — do the math in the sandbox.
    """
    symbols = _clean_symbols(symbols)
    if not symbols:
        return _fail("no valid symbols given")
    try:
        df = yf.download(
            symbols, period=period, interval=interval,
            auto_adjust=True, progress=False, group_by="column",
        )
    except Exception as exc:
        return _fail(f"download failed: {type(exc).__name__}: {exc}")
    if df is None or df.empty:
        return _fail(f"no data returned for {symbols} (period={period}, interval={interval})")

    closes = df["Close"] if "Close" in df.columns else df
    closes = closes.dropna(how="all")
    closes.index.name = "Date"
    missing = [s for s in symbols if s not in closes.columns or closes[s].dropna().empty]
    closes = closes[[s for s in symbols if s not in missing]]
    if closes.empty:
        return _fail(f"no usable price data for {symbols}")

    filename = f"prices-{'-'.join(closes.columns).lower().replace('.', '_')}-{period}.csv"
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    closes.to_csv(WORKSPACE / filename, date_format="%Y-%m-%d")

    summary = {
        sym: {
            "first_close": round(col.iloc[0], 2),
            "last_close": round(col.iloc[-1], 2),
        }
        for sym, col in ((s, closes[s].dropna()) for s in closes.columns)
    }
    result = {
        "csv_filename": filename,
        "rows": len(closes),
        "start": str(closes.index[0].date()),
        "end": str(closes.index[-1].date()),
        "columns": list(closes.columns),
        "note": "adjusted closes (splits & dividends), source Yahoo Finance",
        "symbols": summary,
    }
    if missing:
        result["missing_symbols"] = missing
    return json.dumps(result)


@mcp.tool()
def get_fundamentals(symbol: str) -> str:
    """Get key fundamentals for one ticker: name, sector, industry, market cap,
    P/E (trailing & forward), price/book, margins, ROE, revenue & earnings
    growth, dividend yield (already in percent), beta, revenue, free cash flow,
    analyst consensus and mean price target. Values come straight from Yahoo
    Finance; missing fields are omitted. Call once per company.
    """
    cleaned = _clean_symbols([symbol])
    if not cleaned:
        return _fail("no valid symbol given")
    keys = [
        "longName", "sector", "industry", "marketCap",
        "trailingPE", "forwardPE", "priceToBook",
        "profitMargins", "operatingMargins", "returnOnEquity",
        "revenueGrowth", "earningsGrowth", "dividendYield", "beta",
        "totalRevenue", "freeCashflow",
        "recommendationKey", "targetMeanPrice",
    ]
    try:
        info = yf.Ticker(cleaned[0]).info
    except Exception as exc:
        return _fail(f"info lookup failed: {type(exc).__name__}: {exc}")
    if not info or info.get("trailingPE") is None and info.get("longName") is None:
        return _fail(f"no fundamentals found for {cleaned[0]}")
    return json.dumps({k: info[k] for k in keys if info.get(k) is not None})


@mcp.tool()
def get_earnings_surprises(symbol: str) -> str:
    """Get the most recent quarterly earnings surprises for one ticker:
    consensus EPS estimate vs reported EPS and the surprise in percent,
    newest quarter first. Call this (once per company) whenever the user asks
    about earnings, beats/misses, or surprises — never answer from memory.
    """
    cleaned = _clean_symbols([symbol])
    if not cleaned:
        return _fail("no valid symbol given")
    try:
        hist = yf.Ticker(cleaned[0]).earnings_history
    except Exception as exc:
        return _fail(f"earnings lookup failed: {type(exc).__name__}: {exc}")
    if hist is None or hist.empty:
        return _fail(f"no earnings history found for {cleaned[0]}")

    hist = hist.dropna(subset=["epsActual"]).sort_index(ascending=False)
    quarters = [
        {
            "quarter_ended": str(idx.date()),
            "eps_estimate": round(row["epsEstimate"], 2),
            "eps_actual": round(row["epsActual"], 2),
            "surprise_pct": round(row["surprisePercent"] * 100, 2),
        }
        for idx, row in hist.iterrows()
    ]
    return json.dumps({"symbol": cleaned[0], "quarters": quarters})


if __name__ == "__main__":
    mcp.run(transport="stdio")
