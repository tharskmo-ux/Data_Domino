import type { ClassifyFn } from '../types';
import { ollamaClassify } from './ollama';

export function getClassifier(): ClassifyFn | undefined {
  const provider = (import.meta as any).env?.VITE_CATEGORIZER_LLM || 'none';
  switch (provider) {
    case 'ollama':
      return ollamaClassify;
    // 'gemini' and 'webllm' adapters can be added later behind this switch.
    default:
      return undefined;
  }
}
