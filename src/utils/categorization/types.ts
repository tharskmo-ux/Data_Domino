export type CategorySource = 'hsn' | 'keyword' | 'ai' | 'manual' | 'unmapped';
export type Confidence = 'high' | 'medium' | 'low';

export interface CategoryResult {
  category: string;
  source: CategorySource;
  confidence: Confidence;
}

/** Pluggable LLM classifier: returns one taxonomy label per input description, same order. */
export type ClassifyFn = (
  descriptions: string[],
  taxonomy: readonly string[],
) => Promise<string[]>;
