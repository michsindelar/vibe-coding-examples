# Ollama Prompt Engineering Benchmark

Benchmarks a local Ollama model across several prompt-engineering techniques and
measures **accuracy**, **consistency**, and **relevance** — exactly the three
dimensions the assignment asks for.

Zero npm dependencies. Uses Node's built-in `fetch` (Node 18+).

## What it does

1. Sends a test set of queries to the model **as-is** (baseline).
2. Re-runs the same queries with four prompt-engineering techniques:
   - Rephrased query
   - One-shot prompting
   - Few-shot prompting
   - Chain of Thought
3. Repeats each query N times to measure consistency.
4. Scores everything and writes a console summary + a Markdown report + raw JSON.

## Prerequisites

1. Install Ollama: https://ollama.com
2. Start it (usually automatic): `ollama serve`
3. Pull a model that fits 8 GB VRAM:
   ```bash
   ollama pull llama3.1
   ```
4. **Load it into memory** (the benchmark only offers models that are loaded):
   ```bash
   ollama run llama3.1   # then /bye to exit the chat; it stays in memory
   ```
5. Verify it is loaded on the GPU:
   ```bash
   ollama ps   # the model should be listed; PROCESSOR should read 100% GPU
   ```

## Run it

```bash
npm start
```

That's it — no `npm install` needed.

### Choosing the model

On startup the benchmark inspects **the models currently loaded in Ollama's
memory** (the same list as `ollama ps`, via the `/api/ps` endpoint) and:

- **No models loaded → it stops with an error** telling you to `ollama run`
  a model first. (Note: Ollama unloads idle models after a few minutes, so if
  you see this, just `ollama run <model>` again.)
- **One model loaded →** it is selected automatically.
- **Several models loaded →** you get an interactive numbered menu to pick one.
- Set `OLLAMA_MODEL` to a loaded model to skip the menu (useful for scripts/CI).

Because the choice comes from loaded models, the exact name always matches what
Ollama's generate API expects — no more `404 model not found` from tag
mismatches.

### Manual review (human-in-the-loop grading)

Automatic accuracy scoring is strict (whole-word match against the expected
answer and its `acceptable` variants). A correct answer phrased in an
unanticipated way will be scored 0 — a false negative.

To fix this, after the run the benchmark can ask **you** to grade the responses
the matcher rejected:

- Only **non-matching** responses are shown (matches auto-pass).
- Review happens **once, after the full run** — you can leave it running
  unattended and grade at the end.
- For each, you see the question, expected answer, and the model's response,
  then press **`y`** (correct), **`n`** (wrong), **`s`** (skip), or **`q`**
  (quit review). Marking correct flips that response's score and updates the
  report.
- Identical responses to the same question are grouped, so you grade each
  unique answer only once.
- Afterward it offers to **save** the phrasings you accepted into the dataset
  JSON, so future runs match them automatically.

Controlled by `MANUAL_REVIEW`:

| Value | Behavior |
| --- | --- |
| `auto` (default) | Review when interactive (TTY); skip when piped/CI |
| `on` | Always review |
| `off` | Never review; non-matches stay scored as 0 |

### Configuration (environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `OLLAMA_MODEL` | _(prompt)_ | Pre-select a loaded model; skips the menu |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama endpoint |
| `OLLAMA_REPETITIONS` | `3` | Runs per query (consistency) |
| `OLLAMA_TEMPERATURE` | `0.2` | Sampling temperature |
| `OLLAMA_NUM_CTX` | `4096` | Context window (lower if OOM) |
| `OLLAMA_TIMEOUT_MS` | `120000` | Per-request timeout |
| `TESTSET_LIMIT` | `0` (all) | Max items per category (quick runs) |
| `MANUAL_REVIEW` | `auto` | Human grading of non-matches: `auto`/`on`/`off` |

Example (pre-selecting a loaded model and skipping the menu):

```bash
OLLAMA_MODEL=llama3.1:8b OLLAMA_REPETITIONS=5 npm start
```

## Output

Written to `benchmark/results/`:

- `report-<timestamp>.md` — submission-ready report (tables + auto-analysis)
- `results-<timestamp>.json` — full raw responses for appendices/re-analysis

## Project structure

```
benchmark/
├── package.json
├── README.md
├── data/                # one JSON file per category, 100 queries each
│   ├── math.json
│   ├── factual.json
│   └── reasoning.json
└── src/
    ├── index.js        # entry point: orchestrates run + saves reports
    ├── config.js       # all settings (env-overridable)
    ├── testSet.js      # merges + validates every data/*.json file
    ├── techniques.js   # baseline / rephrase / one-shot / few-shot / CoT
    ├── ollamaClient.js # native-fetch client (/api/generate, /api/ps, /api/tags)
    ├── selectModel.js  # picks a model loaded in memory (interactive menu)
    ├── runner.js       # runs the matrix, collects results
    ├── scoring.js      # accuracy / consistency / relevance metrics
    ├── manualReview.js # human-in-the-loop grading of non-matches
    └── report.js       # console + Markdown report generation
```

## The dataset

The test set lives in `data/`, **one JSON file per category**, each containing
**100 queries** (300 total):

| File | Category | Count |
| --- | --- | --- |
| `data/math.json` | math (arithmetic, percentages, powers, averages) | 100 |
| `data/factual.json` | factual (capitals, elements, authors, science, history) | 100 |
| `data/reasoning.json` | reasoning (rates, ages, sequences, logic puzzles) | 100 |

The loader (`src/testSet.js`) automatically merges **every `*.json` file** in
`data/`, so adding a new category is just dropping in `data/<category>.json` —
no code changes needed. It validates required fields and enforces globally
unique `id`s.

> **Heads up:** 300 queries × 5 techniques × 3 repetitions = **4,500 model
> calls**. On an 8 GB local model that can take a while. Use `TESTSET_LIMIT` to
> sample a few items per category for a fast trial run:
>
> ```bash
> TESTSET_LIMIT=5 npm start   # 15 queries instead of 300
> ```

## Customizing for your assignment

- **Add your own queries:** edit the relevant `data/<category>.json` file. Keep
  `expected` answers short and unambiguous so automatic scoring stays reliable.
  Add a `rephrased` field for the rephrase technique, and an optional
  `acceptable` array for alternative correct answers. Each entry requires `id`,
  `category`, `query`, and `expected`; the loader validates this on startup and
  rejects duplicate ids.
- **Add a whole new category:** drop a new file like `data/coding.json` into
  `data/`. It's merged automatically — no code changes required. Give its
  entries unique ids (e.g. `coding-001`).
- **Change techniques:** edit `src/techniques.js`, or comment items out of the
  `techniques` array in `src/config.js`.
- **Tune scoring:** the metrics in `src/scoring.js` are documented heuristics.
  Always spot-check a few raw responses in the JSON by hand for your writeup.

## Notes on the metrics

- **Accuracy** — does the expected answer appear in the response as a whole
  word/phrase (not a raw substring, so "5" is not matched inside "15")? For
  Chain of Thought it reads the `Final answer:` line first. Because matching is
  strict, each dataset item can list `acceptable` answer variants (number words,
  unit forms like `40 km/h`, currency forms like `$30`) to avoid false negatives
  on correct-but-differently-phrased answers.
- **Consistency** — fraction of repeated runs that agreed (all correct or all
  wrong = perfectly consistent).
- **Relevance** — heuristic blending query/response keyword overlap with a
  verbosity penalty; rewards on-topic, appropriately-sized answers.

These are good for spotting trends. For a final grade, combine them with a
manual review of a sample of responses.
