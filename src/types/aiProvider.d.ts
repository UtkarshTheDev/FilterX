/**
 * AI Provider Interface and Types
 * Defines the contract for AI service providers in the FilterX system
 */

export interface AIAnalysisResult {
  isViolation: boolean;
  flags: string[];
  reason: string;
  filteredContent?: string;
}

export interface AIProvider {
  /**
   * Analyze text content for moderation
   * @param text Text to analyze
   * @param oldMessages Previous messages for context
   * @param filterConfig Configuration for content filtering
   * @param modelName Specific model name to use
   * @returns Analysis result with flags, reasoning, and filtered content
   */
  analyzeTextContent(
    text: string,
    oldMessages: Array<any>,
    filterConfig: Record<string, boolean>,
    modelName: string
  ): Promise<AIAnalysisResult>;
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
}

export interface ModelTierConfig {
  provider: "akash" | "gemini";
  model: string;
}

export type AIProviderType = "akash" | "gemini";

export interface AIProviderFactory {
  getProvider(providerType: AIProviderType): AIProvider;
}
