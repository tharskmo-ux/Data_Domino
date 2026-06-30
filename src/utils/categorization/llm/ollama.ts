import type { ClassifyFn } from '../types';

const OLLAMA_URL = (import.meta as any).env?.VITE_OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = (import.meta as any).env?.VITE_OLLAMA_MODEL || 'llama3.1';

export const ollamaClassify: ClassifyFn = async (descriptions, taxonomy) => {
  const prompt =
    `You are a procurement spend categorizer. Assign each item to exactly ONE ` +
    `category from this list:\n${taxonomy.join('\n')}\n\n` +
    `Return ONLY a JSON array of category strings, one per item, in the same order.\n` +
    `Items:\n${descriptions.map((d, i) => `${i + 1}. ${d}`).join('\n')}`;

  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, format: 'json' }),
  });
  if (!res.ok) throw new Error(`Ollama ${(res as any).status}`);

  const data = await res.json();
  const parsed = JSON.parse(data.response);
  return Array.isArray(parsed) ? parsed : (parsed.categories ?? []);
};
