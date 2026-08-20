"""Human-friendly number rendering, shared by the CLI, the MCP server and eval.

A Fermi answer like 3.45e13 is precise but hard for a person to read; these
helpers render it as "34.5 trillion" wherever a human is the audience, while
the machine-facing layer (calculator chaining, the JSON ledger, the eval
parser) keeps exact scientific notation.
"""

from __future__ import annotations

import math

_SCALES = ((1e12, "trillion"), (1e9, "billion"), (1e6, "million"))


def _round3(v: float) -> float:
    """Round to three significant digits."""
    if v == 0:
        return 0.0
    exp = math.floor(math.log10(abs(v)))
    return round(v, -exp + 2)


def human_number(x) -> str:
    """Render a number the way a person would say it (3 significant digits).

    124 → '124' · 0.053 → '0.053' · 46000 → '46,000' ·
    1.87e6 → '1.87 million' · 3.45e13 → '34.5 trillion' ·
    magnitudes beyond words (≥ 1e15 or < 1e-4) stay scientific.
    """
    try:
        v = float(x)
    except (TypeError, ValueError):
        return str(x)
    if not math.isfinite(v):
        return str(v)
    if v == 0:
        return "0"
    sign, a = ("-" if v < 0 else ""), abs(v)
    if a >= 1e15 or a < 1e-4:
        return f"{v:.3g}"
    for scale, name in _SCALES:
        if a >= scale:
            return f"{sign}{_round3(a / scale):g} {name}"
    if a >= 1000:
        return f"{sign}{_round3(a):,.0f}"
    return f"{sign}{_round3(a):g}"
