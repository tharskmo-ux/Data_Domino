import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

export interface AIInsight {
  title: string;
  description: string;
  impact: 'High' | 'Medium' | 'Low';
}

export interface AIResponse {
  insights: AIInsight[];
  summary: string;
}

const env = (import.meta as any).env ?? {};
// 'ollama' = local, private inference (nothing leaves the machine).
// 'gemini' = Google Cloud Function (default, for the hosted app).
const AI_PROVIDER: string = env.VITE_AI_INSIGHTS_PROVIDER || 'gemini';
const OLLAMA_URL: string = env.VITE_OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL: string = env.VITE_OLLAMA_INSIGHTS_MODEL || env.VITE_OLLAMA_MODEL || 'llama3.1';

/** Local, private insights via Ollama — the spend summary never leaves the machine. */
async function getOllamaInsights(summary: any, userContext?: string): Promise<AIResponse> {
  const prompt =
    `You are a procurement expert and data scientist. Analyze the spend summary and give ` +
    `3-5 actionable insights focused on savings, risk reduction and vendor consolidation.\n\n` +
    `Currency: ${summary?.currency || 'INR'}\n` +
    `Spend Summary:\n${JSON.stringify(summary, null, 2)}\n` +
    `User Context: ${userContext || 'None'}\n\n` +
    `Return ONLY JSON of exactly this shape:\n` +
    `{"insights":[{"title":"...","description":"...","impact":"High|Medium|Low"}],"summary":"..."}`;

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, format: 'json' }),
  });
  if (!res.ok) throw new Error(`Ollama request failed (${(res as any).status}). Is 'ollama serve' running at ${OLLAMA_URL}?`);

  const data = await res.json();
  const parsed = JSON.parse(data.response ?? '{}');
  return {
    insights: Array.isArray(parsed.insights) ? parsed.insights : [],
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  };
}

/** Gemini insights via the Firebase Cloud Function (summary is sent to Google). */
async function getGeminiInsights(summary: any, userContext?: string): Promise<AIResponse> {
  const getAIInsightsFn = httpsCallable<any, AIResponse>(functions, 'getAIInsights');
  const result = await getAIInsightsFn({ summary, context: userContext });
  return result.data;
}

/**
 * Fetch procurement insights. Provider is chosen by VITE_AI_INSIGHTS_PROVIDER:
 *   'ollama' → local inference (private)   |   'gemini' → Google Cloud Function.
 */
export const getAIInsights = async (summary: any, userContext?: string): Promise<AIResponse> => {
  try {
    return AI_PROVIDER === 'ollama'
      ? await getOllamaInsights(summary, userContext)
      : await getGeminiInsights(summary, userContext);
  } catch (error) {
    console.error(`[aiService] ${AI_PROVIDER} insights failed:`, error);
    throw error;
  }
};

export const getAIInsightsProvider = (): string => AI_PROVIDER;
