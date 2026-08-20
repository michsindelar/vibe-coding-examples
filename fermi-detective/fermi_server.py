"""Fermi Detective — custom tool server (MCP).

Exposes the agent's custom tools over the Model Context Protocol using
FastMCP with stdio transport:

  - calculator       safe arithmetic evaluator (pure Python, AST whitelist)
  - log_assumption   append one assumption to the audit ledger
  - read_ledger      dump the ledger as JSON (used by the host for the report)
  - reset_ledger     clear the ledger before a new question

The ledger lives in this process, so it persists exactly as long as one MCP
session. The host must therefore keep a single session open for a whole
question (see main.py) instead of spawning a server per tool call.
"""

from __future__ import annotations

import ast
import json
import math
import operator
import warnings

# Keep this server's stderr clean — it shares the console with the live
# ReAct trace of the host process.
warnings.filterwarnings("ignore", message=".*incomplete definition.*")

from mcp.server.fastmcp import FastMCP  # noqa: E402

from formatting import human_number  # noqa: E402

mcp = FastMCP("fermi-tools", log_level="WARNING")

_LEDGER: list[dict] = []

_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_UNARY_OPS = {ast.UAdd: operator.pos, ast.USub: operator.neg}
_CONSTANTS = {"pi": math.pi, "e": math.e}


def _eval_node(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _eval_node(node.body)
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float)) and not isinstance(node.value, bool):
            return float(node.value)
        raise ValueError(f"only numbers are allowed, got {node.value!r}")
    if isinstance(node, ast.Name):
        if node.id in _CONSTANTS:
            return _CONSTANTS[node.id]
        raise ValueError(f"unknown name {node.id!r} (only 'pi' and 'e' are allowed)")
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
        return _UNARY_OPS[type(node.op)](_eval_node(node.operand))
    if isinstance(node, ast.BinOp) and type(node.op) in _BIN_OPS:
        left, right = _eval_node(node.left), _eval_node(node.right)
        if isinstance(node.op, ast.Pow) and (abs(right) > 300 or abs(left) > 1e150):
            raise ValueError("exponent too large — write big numbers as e-notation like 1.5e6")
        return _BIN_OPS[type(node.op)](left, right)
    raise ValueError(f"unsupported syntax: {ast.dump(node, annotate_fields=False)[:80]}")


@mcp.tool()
def calculator(expression: str) -> str:
    """Evaluate ONE arithmetic expression and return the numeric result.

    Allowed: numbers (use e-notation like 1.86e6 for big values), + - * / // %,
    ** for powers, parentheses, constants pi and e. No variables, no functions.
    Example: "1.86e6 / 2.5 * 0.03 / 180"
    """
    try:
        expr = (
            expression.replace("^", "**")
            .replace(",", "")
            .replace("×", "*")
            .replace("−", "-")
        )
        if len(expr) > 500:
            raise ValueError("expression too long")
        value = _eval_node(ast.parse(expr, mode="eval"))
        out = f"{value:.6g}"
        pretty = human_number(value)
        if pretty.replace(",", "") != out:
            out = f"{out} (≈ {pretty})"
        return out
    except ZeroDivisionError:
        return "CALCULATOR ERROR: division by zero. Check the expression and retry."
    except (ValueError, SyntaxError, OverflowError) as exc:
        return (
            f"CALCULATOR ERROR: {exc}. Fix the expression and call again — use * for "
            f"multiplication, ** for powers, e-notation (1.5e6) for large numbers."
        )


@mcp.tool()
def log_assumption(
    name: str, value: float, unit: str, low: float, high: float, source: str, rationale: str
) -> str:
    """Record ONE assumption in the audit ledger BEFORE using it in any calculation.

    `value` is your best estimate; `low`/`high` bound its plausible range.
    `source` is a Wikipedia article title, a URL from web_search, or 'own estimate'.
    `rationale` is one short sentence on why this value is reasonable.
    """
    entry = {
        "n": len(_LEDGER) + 1,
        "name": name,
        "value": value,
        "unit": unit,
        "low": low,
        "high": high,
        "source": source,
        "rationale": rationale,
    }
    _LEDGER.append(entry)
    return (
        f"Logged assumption #{entry['n']}: {name} = {human_number(value)} {unit} "
        f"[{human_number(low)} – {human_number(high)}] (source: {source})"
    )


@mcp.tool()
def read_ledger() -> str:
    """Return every logged assumption as a JSON array (audit report)."""
    return json.dumps(_LEDGER)


@mcp.tool()
def reset_ledger() -> str:
    """Clear the assumption ledger (the host calls this before each new question)."""
    _LEDGER.clear()
    return "Ledger cleared."


if __name__ == "__main__":
    mcp.run(transport="stdio")
