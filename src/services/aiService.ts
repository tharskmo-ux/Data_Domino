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

/**
 * Service to call the Gemini-powered Cloud Function for spend insights.
 */
export const getAIInsights = async (summary: any, userContext?: string): Promise<AIResponse> => {
  try {
    const getAIInsightsFn = httpsCallable<any, AIResponse>(functions, 'getAIInsights');
    const result = await getAIInsightsFn({ summary, context: userContext });
    return result.data;
  } catch (error) {
    console.error('Error fetching AI insights:', error);
    throw error;
  }
};
