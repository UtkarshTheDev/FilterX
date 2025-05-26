import { config } from "../config";
import { geminiService } from "./geminiService";
import { analyzeTextContent as akashAnalyzeTextContent } from "./akashChatService";
import type {
  AIProvider,
  AIAnalysisResult,
  AIProviderType,
} from "../types/aiProvider";

/**
 * Akash Chat Provider Wrapper
 * Wraps the existing akashChatService to implement the AIProvider interface
 */
class AkashChatProvider implements AIProvider {
  async analyzeTextContent(
    text: string,
    oldMessages: Array<any>,
    filterConfig: Record<string, boolean>,
    modelName: string
  ): Promise<AIAnalysisResult> {
    // Use the existing akashChatService function
    // The modelName parameter is actually the tier, but we'll handle that in the factory
    return await akashAnalyzeTextContent(
      text,
      oldMessages,
      filterConfig,
      modelName
    );
  }
}

/**
 * AI Provider Factory
 * Handles provider selection and instantiation based on configuration
 */
export class AIProviderFactory {
  private static akashProvider: AkashChatProvider | null = null;

  /**
   * Get the appropriate AI provider for a given model tier
   * @param modelTier Model tier (pro, normal, fast)
   * @returns AI provider instance
   */
  static getProviderForTier(modelTier: string): {
    provider: AIProvider;
    modelName: string;
    providerType: AIProviderType;
  } {
    // Get the provider configuration for this tier
    const tierConfig = this.getTierConfig(modelTier);

    console.log(
      `[AI Factory] Selected provider: ${tierConfig.provider}, model: ${tierConfig.model} for tier: ${modelTier}`
    );

    // Get the appropriate provider instance
    const provider = this.getProvider(tierConfig.provider);

    return {
      provider,
      modelName: tierConfig.model,
      providerType: tierConfig.provider,
    };
  }

  /**
   * Get provider instance by type
   * @param providerType Provider type (akash or gemini)
   * @returns AI provider instance
   */
  static getProvider(providerType: AIProviderType): AIProvider {
    switch (providerType) {
      case "akash":
        if (!this.akashProvider) {
          this.akashProvider = new AkashChatProvider();
        }
        return this.akashProvider;

      case "gemini":
        return geminiService;

      default:
        console.warn(
          `[AI Factory] Unknown provider type: ${providerType}, falling back to akash`
        );
        if (!this.akashProvider) {
          this.akashProvider = new AkashChatProvider();
        }
        return this.akashProvider;
    }
  }

  /**
   * Get tier configuration from environment variables
   * @param modelTier Model tier (pro, normal, fast)
   * @returns Tier configuration with provider and model
   */
  private static getTierConfig(modelTier: string): {
    provider: AIProviderType;
    model: string;
  } {
    // Validate model tier
    const validTiers = ["pro", "normal", "fast"];
    const tier = validTiers.includes(modelTier) ? modelTier : "normal";

    // Get configuration from config
    const tierConfig =
      config.modelTiers[tier as keyof typeof config.modelTiers];

    // Validate provider type
    const validProviders: AIProviderType[] = ["akash", "gemini"];
    const provider = validProviders.includes(tierConfig.provider)
      ? tierConfig.provider
      : "akash";

    return {
      provider,
      model: tierConfig.model,
    };
  }

  /**
   * Validate provider configuration
   * @param providerType Provider type to validate
   * @returns True if provider is properly configured
   */
  static isProviderConfigured(providerType: AIProviderType): boolean {
    switch (providerType) {
      case "akash":
        return !!(config.akashChat.apiKey && config.akashChat.baseUrl);

      case "gemini":
        // Gemini only needs API key - no base URL required as it's handled by @google/genai
        return !!config.gemini.apiKey;

      default:
        return false;
    }
  }

  /**
   * Get all available providers
   * @returns Array of available provider types
   */
  static getAvailableProviders(): AIProviderType[] {
    const providers: AIProviderType[] = [];

    if (this.isProviderConfigured("akash")) {
      providers.push("akash");
    }

    if (this.isProviderConfigured("gemini")) {
      providers.push("gemini");
    }

    return providers;
  }

  /**
   * Get provider statistics and health information
   * @returns Provider health information
   */
  static getProviderHealth(): Record<
    AIProviderType,
    {
      configured: boolean;
      available: boolean;
      lastError?: string;
    }
  > {
    return {
      akash: {
        configured: this.isProviderConfigured("akash"),
        available: this.isProviderConfigured("akash"),
      },
      gemini: {
        configured: this.isProviderConfigured("gemini"),
        available: this.isProviderConfigured("gemini"),
      },
    };
  }
}

/**
 * Convenience function to analyze text content using the appropriate provider
 * This maintains backward compatibility with the existing API
 * @param text Text to analyze
 * @param oldMessages Previous messages for context
 * @param filterConfig Configuration for content filtering
 * @param modelTier AI model tier to use (pro, normal, fast)
 * @returns Analysis result with flags, reasoning, and filtered content
 */
export const analyzeTextContentWithProvider = async (
  text: string,
  oldMessages: Array<any> = [],
  filterConfig: Record<string, boolean> = {},
  modelTier: string = "normal"
): Promise<AIAnalysisResult> => {
  try {
    // Get the appropriate provider for this tier
    const { provider, modelName, providerType } =
      AIProviderFactory.getProviderForTier(modelTier);

    console.log(
      `[AI Factory] Using ${providerType} provider with model ${modelName} for tier ${modelTier}`
    );

    // Check if the provider is properly configured
    if (!AIProviderFactory.isProviderConfigured(providerType)) {
      console.error(
        `[AI Factory] Provider ${providerType} is not properly configured`
      );
      throw new Error(`Provider ${providerType} is not properly configured`);
    }

    // For Akash provider, we need to pass the tier instead of the model name
    // because the existing akashChatService expects a tier
    const modelParam = providerType === "akash" ? modelTier : modelName;

    // Analyze the content using the selected provider
    return await provider.analyzeTextContent(
      text,
      oldMessages,
      filterConfig,
      modelParam
    );
  } catch (error) {
    console.error(`[AI Factory] Error in provider analysis:`, error);

    // Fallback to a safe response
    return {
      isViolation: false,
      flags: ["error"],
      reason: "AI analysis failed, allowing content as a precaution",
    };
  }
};
