import { GoogleGenAI } from "@google/genai";
import { config } from "../config";
import {
  generateAICacheKey,
  getCachedResponse,
  setCachedResponse,
} from "../utils/cache";
import { statsIncrement } from "../utils/redis";
import { trackApiResponseTime } from "../utils/apiResponseTime";
import type { AIProvider, AIAnalysisResult } from "../types/aiProvider";

/**
 * Gemini AI Service for content moderation
 * Implements the same interface as akashChatService for seamless provider switching
 * Uses the latest @google/genai package as per Google's official example
 */
export class GeminiService implements AIProvider {
  private client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({
      apiKey: config.gemini.apiKey,
    });
  }

  /**
   * Process text content through Gemini API
   * @param text Text to analyze
   * @param oldMessages Previous messages for context
   * @param filterConfig Configuration for content filtering
   * @param modelName Gemini model name to use
   * @returns Analysis result with flags, reasoning, and filtered content
   */
  async analyzeTextContent(
    text: string,
    oldMessages: Array<any> = [],
    filterConfig: Record<string, boolean> = {},
    modelName: string = "gemini-2.0-flash-exp"
  ): Promise<AIAnalysisResult> {
    try {
      console.log(
        `[Gemini Analysis] Starting analysis for text: "${text.substring(
          0,
          30
        )}..."`
      );
      console.log(
        `[Gemini Analysis] Filter config:`,
        JSON.stringify(filterConfig)
      );

      // Check if we have a cached result for this text and config
      const cacheKey = generateAICacheKey(text, oldMessages, filterConfig);
      console.log(
        `[Gemini Analysis] Generated AI cache key: ${cacheKey.substring(
          0,
          15
        )}...`
      );

      // Try to get from cache first
      const cachedResult = await getCachedResponse(cacheKey);
      if (cachedResult) {
        console.log(
          `[Gemini Analysis] Cache hit! Using cached AI analysis result`
        );

        // Track AI cache hits for monitoring - in background
        setImmediate(async () => {
          try {
            await statsIncrement("ai:cache:hits");
          } catch (error) {
            console.error("[Gemini Analysis] Error tracking cache hit:", error);
          }
        });

        return cachedResult;
      }

      console.log(`[Gemini Analysis] Cache miss, calling Gemini API`);

      // Track AI cache misses for monitoring - in background
      setImmediate(async () => {
        try {
          await statsIncrement("ai:cache:misses");
        } catch (error) {
          console.error("[Gemini Analysis] Error tracking cache miss:", error);
        }
      });

      // Format previous messages for context - optimize for speed
      const messageHistory = this.formatMessageHistory(oldMessages, text);

      // Create prompt for content moderation (using same system prompt as Akash)
      const systemPrompt = this.createSystemPrompt(filterConfig);
      console.log(
        `[Gemini Analysis] Using system prompt length: ${systemPrompt.length} chars`
      );

      // Prepare contents for Gemini API
      const contents = [
        {
          role: "user" as const,
          parts: [
            {
              text:
                systemPrompt +
                "\n\n" +
                messageHistory
                  .map((msg) => `${msg.role}: ${msg.content}`)
                  .join("\n"),
            },
          ],
        },
      ];

      // Track API call starting time for performance monitoring
      const apiCallStartTime = Date.now();

      // Make API request using Gemini - following Google's official example exactly
      console.log(
        `[Gemini Analysis] Sending request to Gemini API using model: ${modelName}`
      );

      // Use the exact pattern from Google's example
      const config = {
        responseMimeType: "application/json", // Request JSON response for easier parsing
        temperature: 0.1, // Lower temperature for consistent responses
        maxOutputTokens: 300, // Reduced token count for faster response
      };

      const response = await this.client.models.generateContentStream({
        model: modelName,
        config,
        contents,
      });

      // Collect the streamed response - exactly as in Google's example
      let aiResponse = "";
      for await (const chunk of response) {
        if (chunk.text) {
          aiResponse += chunk.text;
        }
      }

      // Calculate API call duration for monitoring
      const apiCallDuration = Date.now() - apiCallStartTime;
      console.log(
        `[Gemini Analysis] API call completed in ${apiCallDuration}ms`
      );

      // Track API call performance IMMEDIATELY (not in background) to ensure stats are recorded
      try {
        await trackApiResponseTime("text", apiCallDuration, false, false);
        console.log(
          `[Gemini Analysis] API stats tracked successfully: ${apiCallDuration}ms`
        );
      } catch (error) {
        console.error(
          "[Gemini Analysis] Error tracking API performance:",
          error
        );
      }

      // Track additional stats in background (non-essential)
      setImmediate(async () => {
        try {
          await statsIncrement("ai:api:total_time", apiCallDuration);
          await statsIncrement("ai:api:call_count");
        } catch (error) {
          console.error(
            "[Gemini Analysis] Error tracking additional stats:",
            error
          );
        }
      });

      console.log(
        `[Gemini Analysis] Received response of length: ${aiResponse.length} chars`
      );
      console.log(
        `[Gemini Analysis] Raw AI response preview: "${aiResponse.substring(
          0,
          100
        )}..."`
      );

      const result = this.parseAiResponse(aiResponse);
      console.log(
        `[Gemini Analysis] Parsed result - isViolation: ${
          result.isViolation
        }, flags: [${result.flags.join(", ")}]`
      );
      if (result.filteredContent) {
        console.log(
          `[Gemini Analysis] Generated filtered content: "${result.filteredContent.substring(
            0,
            50
          )}..."`
        );
      }

      // Cache the result for future use - using adaptive TTL
      // Only cache successful results with proper parsing - in background
      setImmediate(async () => {
        try {
          if (result.flags.indexOf("error") === -1) {
            await setCachedResponse(cacheKey, result);
            console.log(
              `[Gemini Analysis] Cached AI analysis result for future use`
            );
          }
        } catch (error) {
          console.error("[Gemini Analysis] Error caching result:", error);
        }
      });

      return result;
    } catch (error) {
      console.error("Error calling Gemini API:", error);

      // Track API errors IMMEDIATELY (not in background) to ensure stats are recorded
      try {
        const errorDuration = 0; // We don't know the exact error duration
        await trackApiResponseTime("text", errorDuration, true, false);
        console.log(`[Gemini Analysis] API error stats tracked successfully`);
      } catch (statsError) {
        console.error(
          "[Gemini Analysis] Error tracking API error stats:",
          statsError
        );
      }

      // Track additional error stats in background (non-essential)
      setImmediate(async () => {
        try {
          await statsIncrement("ai:api:errors");
        } catch (error) {
          console.error(
            "[Gemini Analysis] Error tracking additional error stats:",
            error
          );
        }
      });

      // Return a safer response on error (don't block by default)
      return {
        isViolation: false,
        flags: ["error"],
        reason: "AI analysis failed, allowing content as a precaution",
      };
    }
  }

  /**
   * Format message history for the API - optimized for efficiency and context preservation
   * @param oldMessages Previous messages
   * @param currentMessage Current message
   * @returns Formatted message history
   */
  private formatMessageHistory(
    oldMessages: Array<any> = [],
    currentMessage: string
  ): Array<{ role: string; content: string }> {
    // If there are no previous messages or only a few, use them all
    if (oldMessages.length <= 5) {
      return [
        ...oldMessages.map((msg, index) => ({
          role: index % 2 === 0 ? "Person1" : "Person2",
          content: typeof msg === "string" ? msg : msg.text || "",
        })),
        // Add current message
        {
          role: "user",
          content: currentMessage,
        },
      ];
    }

    // For longer conversation histories, use a smarter selective approach:
    // 1. Always include the most recent messages (last 3)
    // 2. Sample messages from the middle for context
    // 3. Include a couple of early messages for initial context

    // Get total message count
    const totalMessages = oldMessages.length;

    // Messages to select - prioritize recency and context
    const selectedIndices = new Set<number>();

    // Add last 3 messages (most recent context)
    for (let i = 1; i <= 3; i++) {
      if (totalMessages - i >= 0) {
        selectedIndices.add(totalMessages - i);
      }
    }

    // Add a couple of messages from the first third (beginning context)
    const firstThird = Math.floor(totalMessages / 3);
    if (firstThird > 0) {
      selectedIndices.add(0); // First message
      if (firstThird > 2) {
        selectedIndices.add(Math.floor(firstThird / 2)); // Middle of first third
      }
    }

    // Add a message from the middle for continuity
    const middleIndex = Math.floor(totalMessages / 2);
    if (middleIndex > 0 && !selectedIndices.has(middleIndex)) {
      selectedIndices.add(middleIndex);
    }

    // Convert to array and sort for chronological order
    const indicesToUse = Array.from(selectedIndices).sort((a, b) => a - b);

    // Create history with selected messages
    const formattedHistory = indicesToUse.map((index) => {
      const msg = oldMessages[index];
      return {
        role: index % 2 === 0 ? "Person1" : "Person2",
        content: typeof msg === "string" ? msg : msg.text || "",
      };
    });

    // Add current message at the end
    formattedHistory.push({
      role: "user",
      content: currentMessage,
    });

    // Add marker to indicate this is a summarized conversation
    if (indicesToUse.length < oldMessages.length) {
      // Insert metadata about skipped messages at the beginning
      formattedHistory.unshift({
        role: "system",
        content: `Note: This is a summarized conversation history of ${
          oldMessages.length
        } total messages. ${
          formattedHistory.length - 1
        } key messages were selected for context.`,
      });
    }

    console.log(
      `[Gemini Analysis] Optimized message history: Using ${
        formattedHistory.length - 1
      } messages out of ${oldMessages.length} total messages`
    );

    return formattedHistory;
  }

  /**
   * Create system prompt based on filter configuration
   * Uses the same prompt logic as akashChatService for consistency
   * @param filterConfig Configuration for content filtering
   * @returns System prompt
   */
  private createSystemPrompt(filterConfig: Record<string, boolean>): string {
    // Import the same prompt creation logic from akashChatService
    // This ensures identical behavior across providers
    return this.generateSystemPrompt(filterConfig);
  }

  /**
   * Generate system prompt - identical to akashChatService implementation
   * @param filterConfig Configuration for content filtering
   * @returns System prompt string
   */
  private generateSystemPrompt(filterConfig: Record<string, boolean>): string {
    // Normalize and default the filter config
    // Treat undefined as false (disallowed), but explicit true as allowed
    const normalizedConfig = {
      allowAbuse: filterConfig.allowAbuse === true,
      allowPhone: filterConfig.allowPhone === true,
      allowEmail: filterConfig.allowEmail === true,
      allowPhysicalInformation: filterConfig.allowPhysicalInformation === true,
      allowSocialInformation: filterConfig.allowSocialInformation === true,
      returnFilteredMessage: filterConfig.returnFilteredMessage === true,
    };

    // Track which content types we need to check
    const contentTypesToCheck = [];
    if (!normalizedConfig.allowAbuse) contentTypesToCheck.push("abuse");
    if (!normalizedConfig.allowPhone) contentTypesToCheck.push("phone");
    if (!normalizedConfig.allowEmail) contentTypesToCheck.push("email");
    if (!normalizedConfig.allowPhysicalInformation)
      contentTypesToCheck.push("physical");
    if (!normalizedConfig.allowSocialInformation)
      contentTypesToCheck.push("social");

    // If all content types are allowed, use a simplified prompt
    if (contentTypesToCheck.length === 0) {
      return `You are a content moderation AI. In this case, all content types have been explicitly allowed by the user.
No moderation is needed for this content, so please return a passing result regardless of content.

Your response MUST be in this EXACT JSON format:
{
  "isViolation": false,
  "flags": [],
  "reason": "All content types are allowed"${
    normalizedConfig.returnFilteredMessage ? ',\n  "filteredContent": ""' : ""
  }
}`;
    }

    // Begin standard prompt for normal cases
    let prompt = `You are a highly precise content moderation AI specializing in detecting and filtering ACTUAL sensitive information. Your CRITICAL task is to achieve near-99% accuracy in identifying ONLY REAL, COMPLETE sensitive information, even when disguised or obfuscated. Never flag vague references, incomplete data, or common phrases unless they clearly contain sensitive content. Be vigilant against bypass attempts.

DETECTION REQUIREMENTS: You must ONLY identify the following types of sensitive content:`;

    // Only include instructions for disallowed content types
    if (!normalizedConfig.allowAbuse) {
      prompt += `
- Abusive Language: ONLY clear and severe insults, hate speech, profanity, or explicitly offensive content (e.g., racial slurs, threats). Do NOT flag mild criticism, slight rudeness, or casual expressions like "this sucks" or "I'm annoyed".`;
    }

    if (!normalizedConfig.allowPhone) {
      prompt += `
- Phone Numbers: ONLY COMPLETE and REAL phone numbers, including international formats (e.g., +1 555-123-4567), local formats (e.g., 555-123-4567), or plain digits (e.g., 5551234567). Detect disguised attempts like spelled-out digits (e.g., "five five five one two three four five six seven") or mixed formats (e.g., "five hundred fifty-five, 123-4567"). Look for 10-digit sequences (or 11 with country code) in context. DO NOT flag:
  * Incomplete fragments (e.g., "call 555" or "dial 1234")
  * Vague references (e.g., "my phone" or "call me")
  * Random digits not in phone format (e.g., "I scored 123456 points")
  * Examples: "five apples" or "year 2023" are NOT phone numbers`;
    }

    if (!normalizedConfig.allowEmail) {
      prompt += `
- Email Addresses: ONLY COMPLETE and REAL email addresses (e.g., user@example.com, name.surname@company.co.uk). Catch obfuscated forms like "user [at] example [dot] com", "userATexampleDOTcom", or "user at example dot com". Require username + domain + TLD. DO NOT flag:
  * Incomplete fragments (e.g., "contact me at gmail")
  * Vague refs (e.g., "my email" or "send me mail")
  * Social media handles (e.g., "@username") unless part of a full email`;
    }

    if (!normalizedConfig.allowPhysicalInformation) {
      prompt += `
- Physical Information: ONLY COMPLETE and REAL physical addresses (e.g., "123 Main St, Anytown, CA"), credit card numbers (16 digits, e.g., "1234-5678-9012-3456"), CVV codes (3-4 digits with context), or specific financial details. Detect partial data if combinable (e.g., "123 Main St" + "Anytown"). DO NOT flag:
  * Vague locations (e.g., "near downtown" or "in CA")
  * Incomplete refs (e.g., "Main St" alone)
  * Generic payment mentions (e.g., "use my card")
  * Random numbers not in financial format`;
    }

    if (!normalizedConfig.allowSocialInformation) {
      prompt += `
- Social Information: ONLY COMPLETE and REAL social media handles (e.g., "@cooluser"), profile links (e.g., "instagram.com/cooluser"), or personal URLs. Catch indirect refs like "find me on the gram as cooluser" or "my TikTok is funuser". DO NOT flag:
  * Generic platform mentions (e.g., "I use Twitter")
  * Vague refs (e.g., "my profile")
  * Non-personal URLs (e.g., "example.com")`;
    }

    // Add special instruction for explicitly allowed content types
    prompt += `\n\nIMPORTANT: The user has explicitly allowed the following content types:`;
    if (normalizedConfig.allowAbuse)
      prompt +=
        "\n- Abusive language (DO NOT flag any profanity or offensive content)";
    if (normalizedConfig.allowPhone)
      prompt +=
        "\n- Phone numbers (DO NOT flag any phone numbers, even complete ones)";
    if (normalizedConfig.allowEmail)
      prompt +=
        "\n- Email addresses (DO NOT flag any email addresses, even complete ones)";
    if (normalizedConfig.allowPhysicalInformation)
      prompt +=
        "\n- Physical information (DO NOT flag addresses, credit cards, or location information)";
    if (normalizedConfig.allowSocialInformation)
      prompt +=
        "\n- Social information (DO NOT flag social media handles, usernames, or profiles)";

    prompt += `

CRITICAL: ONLY flag content with ACTUAL, COMPLETE, REAL sensitive information that is NOT in the allowed list. Analyze context to distinguish genuine data from coincidental phrases. Avoid false positives at all costs.

EXAMPLES TO FLAG (only if that content type is not allowed):
- "Call me at 555-123-4567" → Phone number
- "Contact me at five five five one two three four five six seven" → Disguised phone number
- "Email: user [at] example [dot] com" → Obfuscated email
- "I'm at 123 Main St, Anytown, CA" → Complete address
- "Card: 1234-5678-9012-3456" → Credit card
- "My Insta is cooluser" → Social handle

EXAMPLES NOT TO FLAG:
- "Five friends came over" → Not a phone number
- "My email is private" → No email address
- "I'm near the park" → Vague location
- "Check Instagram" → No handle

Your response MUST be in this EXACT JSON format:
{
  "isViolation": true/false,
  "flags": ["flag1", "flag2", ...],
  "reason": "Brief explanation without showing the sensitive content"`;

    if (normalizedConfig.returnFilteredMessage) {
      prompt += `,
  "filteredContent": "Original message with ALL sensitive information replaced with asterisks (*)"`;
    }

    prompt += `
}

Available flags: "abuse", "phone", "email", "address", "creditCard", "cvv", "socialMedia", "pii", "inappropriate"

CRITICAL REQUIREMENTS:
1. Set "isViolation" to true ONLY for ACTUAL prohibited content that's not explicitly allowed
2. List ONLY relevant flags for disallowed content types
3. In "reason", be BRIEF and generic (e.g., "contains a phone number")
4. When unsure, DO NOT flag—better to miss borderline cases than block legit content`;

    if (normalizedConfig.returnFilteredMessage) {
      prompt += `
5. FILTERED CONTENT RULES:
   - Replace ENTIRE sensitive data with asterisks (*) ONLY FOR DISALLOWED CONTENT TYPES
   - Do NOT censor allowed content types (${Object.entries(normalizedConfig)
     .filter(([key, value]) => key.startsWith("allow") && value === true)
     .map(([key]) => key.replace("allow", "").toLowerCase())
     .join(", ")})
   - E.g., "Call 555-123-4567" → "Call ***********" (only if phone numbers aren't allowed)
   - Match asterisk count to data length, preserve message structure`;
    }

    return prompt;
  }

  /**
   * Parse AI response to extract moderation result - optimized for speed
   * Handles reasoning models with <think></think> brackets
   * @param aiResponse Raw AI response
   * @returns Parsed moderation result with optional filtered content
   */
  private parseAiResponse(aiResponse: string): AIAnalysisResult {
    try {
      // Handle reasoning models - remove <think></think> content if present
      let cleanedResponse = aiResponse;
      if (aiResponse.includes("<think>") && aiResponse.includes("</think>")) {
        // Remove thinking content but preserve the actual response
        cleanedResponse = aiResponse
          .replace(/<think>[\s\S]*?<\/think>/g, "")
          .trim();
        console.log(
          `[Gemini Parsing] Removed reasoning content, cleaned response length: ${cleanedResponse.length}`
        );
      }

      // Try to extract JSON from the response using more efficient extraction
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        console.log(
          `[Gemini Parsing] Found JSON in response: "${jsonMatch[0].substring(
            0,
            100
          )}..."`
        );
        const jsonData = JSON.parse(jsonMatch[0]);

        // Log the parsed data
        console.log(`[Gemini Parsing] Successfully parsed JSON response`);
        console.log(`[Gemini Parsing] isViolation: ${jsonData.isViolation}`);
        console.log(
          `[Gemini Parsing] flags: ${JSON.stringify(jsonData.flags || [])}`
        );
        console.log(
          `[Gemini Parsing] reason: "${
            jsonData.reason?.substring(0, 100) || "N/A"
          }..."`
        );
        if (jsonData.filteredContent) {
          console.log(
            `[Gemini Parsing] filteredContent: "${
              jsonData.filteredContent?.substring(0, 100) || "N/A"
            }..."`
          );
        }

        // Ensure reason doesn't contain sensitive information (shorten it if needed)
        const safeReason = this.ensureSafeReason(jsonData.reason || "");

        return {
          isViolation: Boolean(jsonData.isViolation),
          flags: Array.isArray(jsonData.flags) ? jsonData.flags : [],
          reason: safeReason,
          filteredContent: jsonData.filteredContent || undefined,
        };
      } else {
        console.log(`[Gemini Parsing] Failed to find valid JSON in response`);
      }

      // If no valid JSON found, use simplified extraction method
      console.log(`[Gemini Parsing] Using fallback parsing method`);
      const containsViolation = cleanedResponse
        .toLowerCase()
        .includes("violation");

      // Extract flags using a simpler approach
      const potentialFlags = [
        "abuse",
        "phone",
        "email",
        "address",
        "creditCard",
        "cvv",
        "socialMedia",
        "pii",
        "inappropriate",
      ];

      const extractedFlags = potentialFlags.filter((flag) =>
        cleanedResponse.toLowerCase().includes(flag.toLowerCase())
      );

      return {
        isViolation: containsViolation,
        flags: extractedFlags.length > 0 ? extractedFlags : ["unknown"],
        reason: containsViolation
          ? "Content contains sensitive information"
          : "Content passed all moderation checks",
      };
    } catch (error) {
      console.error(`[Gemini Parsing] Error parsing AI response:`, error);

      // Default response on error - don't block
      return {
        isViolation: false,
        flags: ["error"],
        reason: "Failed to parse AI response",
      };
    }
  }

  /**
   * Ensure the reason doesn't contain sensitive information
   * @param reason Original reason from AI
   * @returns Safe reason without sensitive data
   */
  private ensureSafeReason(reason: string): string {
    // If reason is too long, it might contain sensitive data - truncate it
    if (reason.length > 100) {
      // Extract just the beginning part that likely describes the issue
      const briefReason = reason.substring(0, 50).split(".")[0];
      return `${briefReason}...`;
    }

    // Check for common patterns that might indicate sensitive data
    const containsPhone =
      /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\+\d{1,3}\s?\d{5,}/.test(reason);
    const containsEmail =
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/.test(reason);

    if (containsPhone) {
      return reason.replace(
        /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\+\d{1,3}\s?\d{5,}/g,
        "***"
      );
    }

    if (containsEmail) {
      return reason.replace(
        /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g,
        "***"
      );
    }

    // Return a simplified reason without potential sensitive data
    if (reason.length > 50) {
      return "The content contains sensitive information";
    }

    return reason;
  }
}

// Export a singleton instance for use in the provider factory
export const geminiService = new GeminiService();
