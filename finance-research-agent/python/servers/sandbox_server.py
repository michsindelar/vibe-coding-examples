"""Python-sandbox MCP server: runs model-written Python in a subprocess.

Each `run_python` call executes in a fresh interpreter whose working directory
is the shared workspace (FINANCE_AGENT_OUTPUT_DIR) — the same directory where
the yfinance MCP server saves price-history CSVs and where charts should land.

The subprocess gets a scrubbed environment (no API keys) with matplotlib
forced to the non-interactive Agg backend. See the README's security note:
this is process isolation for hygiene, not a hardened jail.
"""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

from mcp.server.fastmcp import FastMCP

WORKSPACE = Path(
    os.environ.get("FINANCE_AGENT_OUTPUT_DIR", Path(__file__).resolve().parents[1] / "output")
)

TIMEOUT_SECONDS = 90
MAX_STREAM_CHARS = 6_000

mcp = FastMCP("python-sandbox", log_level="WARNING")


def _scrubbed_env() -> dict[str, str]:
    """Minimal allowlisted environment — never inherit API keys or tokens."""
    env = {k: os.environ[k] for k in ("PATH", "HOME", "LANG", "LC_ALL", "TERM", "TZ") if k in os.environ}
    mpl_dir = Path(tempfile.gettempdir()) / "finance-agent-mpl"
    mpl_dir.mkdir(exist_ok=True)
    env["MPLBACKEND"] = "Agg"
    env["MPLCONFIGDIR"] = str(mpl_dir)
    return env


def _clip(stream: str) -> str:
    if len(stream) <= MAX_STREAM_CHARS:
        return stream
    return stream[:MAX_STREAM_CHARS] + f"\n… [truncated, {len(stream)} chars total]"


@mcp.tool()
def run_python(code: str) -> str:
    """Execute a self-contained Python script and return its output.

    Runs in a FRESH process each call (no state carries over), with the shared
    workspace as the working directory. pandas, numpy, matplotlib, and yfinance
    are preinstalled; matplotlib is preconfigured for headless PNG output
    (never call plt.show()).

    Use it to load CSVs saved by get_price_history — e.g.
    pd.read_csv("prices-aapl-msft-1y.csv", index_col="Date", parse_dates=True)
    — compute statistics, and save charts: plt.savefig("name.png", dpi=150,
    bbox_inches="tight"). Files saved to the working directory are reported
    back and persist between calls. print() what you want to see.
    """
    WORKSPACE.mkdir(parents=True, exist_ok=True)
    before = {p.name: p.stat().st_mtime for p in WORKSPACE.iterdir() if p.is_file()}

    script = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", suffix=".py", prefix="sandbox-", delete=False, encoding="utf-8"
        ) as f:
            f.write(code)
            script = f.name
        proc = subprocess.run(
            [sys.executable, script],
            cwd=WORKSPACE,
            env=_scrubbed_env(),
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
        )
        exit_code, stdout, stderr = proc.returncode, proc.stdout, proc.stderr
    except subprocess.TimeoutExpired as exc:
        exit_code = -1
        stdout = exc.stdout.decode() if isinstance(exc.stdout, bytes) else (exc.stdout or "")
        stderr = f"TIMEOUT: script exceeded {TIMEOUT_SECONDS}s and was killed"
    finally:
        if script:
            Path(script).unlink(missing_ok=True)

    new_files = sorted(
        p.name
        for p in WORKSPACE.iterdir()
        if p.is_file()
        and not p.name.startswith(".")
        and (p.name not in before or p.stat().st_mtime > before[p.name])
    )

    parts = [f"exit code: {exit_code}"]
    parts.append("--- stdout ---\n" + (_clip(stdout) if stdout.strip() else "(empty)"))
    if stderr.strip():
        parts.append("--- stderr ---\n" + _clip(stderr))
    if new_files:
        parts.append("--- files written to workspace ---\n" + "\n".join(new_files))
    return "\n".join(parts)


if __name__ == "__main__":
    mcp.run(transport="stdio")
