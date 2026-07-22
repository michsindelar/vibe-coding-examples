// Prompt engineering techniques.
//
// Each technique is a function that receives a test-set item and returns the
// final prompt string sent to the model. Keeping these isolated means the only
// thing that changes between runs is the prompt - the model and sampling
// options stay constant, so differences are attributable to the technique.

// Worked examples used for one-shot / few-shot prompting. These are
// deliberately from DIFFERENT topics than the test set so we measure the
// effect of the *format/demonstration*, not memorized answers.
const examples = [
  {
    q: "What is the capital of Japan?",
    a: "Tokyo",
  },
  {
    q: "What is 8 multiplied by 7?",
    a: "56",
  },
  {
    q: "Who painted the Mona Lisa?",
    a: "Leonardo da Vinci",
  },
];

// 1) Baseline - send the raw query, no engineering.
function baseline(item) {
  return item.query;
}

// 2) Rephrase - use a clearer restatement of the query.
function rephrase(item) {
  return item.rephrased ?? item.query;
}

// 3) One-shot - prepend a single worked example.
function oneShot(item) {
  const ex = examples[0];
  return [
    "Answer the question concisely.",
    "",
    `Question: ${ex.q}`,
    `Answer: ${ex.a}`,
    "",
    `Question: ${item.query}`,
    "Answer:",
  ].join("\n");
}

// 4) Few-shot - prepend several worked examples.
function fewShot(item) {
  const shots = examples
    .map((ex) => `Question: ${ex.q}\nAnswer: ${ex.a}`)
    .join("\n\n");
  return [
    "Answer the question concisely, following the format of the examples.",
    "",
    shots,
    "",
    `Question: ${item.query}`,
    "Answer:",
  ].join("\n");
}

// 5) Chain of Thought - ask the model to reason step by step, then give a
//    clearly delimited final answer that the scorer can extract.
function chainOfThought(item) {
  return [
    item.query,
    "",
    "Let's think step by step. Show your reasoning, then end your response",
    'with a line in the exact form "Final answer: <answer>".',
  ].join("\n");
}

export const techniques = {
  baseline,
  rephrase,
  oneShot,
  fewShot,
  chainOfThought,
};

// Human-friendly labels for reports.
export const techniqueLabels = {
  baseline: "Baseline (raw query)",
  rephrase: "Rephrased query",
  oneShot: "One-shot",
  fewShot: "Few-shot",
  chainOfThought: "Chain of Thought",
};
