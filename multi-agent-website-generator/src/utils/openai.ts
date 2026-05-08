export type OpenAIClient = {
  chat?: {
    completions: {
      create(input: unknown): Promise<{ choices?: Array<{ message?: { content?: string | null } }> }>;
    };
  };
  responses?: {
    create(input: unknown): Promise<{ output_text?: string }>;
  };
};

export async function getOpenAIClient(): Promise<OpenAIClient | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  try {
    const module = await import("openai");
    const OpenAI = module.default;
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) as unknown as OpenAIClient;
  } catch {
    console.warn("OpenAI SDK is not installed.");
    return null;
  }
}
