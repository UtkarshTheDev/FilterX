import axios from "axios";
import { config } from "../config";

// Create axios client
const client = axios.create({
  baseURL: config.akashChat.baseUrl,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.akashChat.apiKey}`,
  },
  timeout: 10000, // 10 seconds
});

/**
 * Process text content through Akash Chat API
 * @param text Text to analyze
 * @param oldMessages Previous messages for context
 * @param filterConfig Configuration for content filtering
 * @returns Analysis result with flags and reasoning
 */
export const analyzeTextContent = async (
  text: string,
  oldMessages: Array<any> = [],
  filterConfig: Record<string, boolean> = {}
): Promise<{
  isViolation: boolean;
  flags: string[];
  reason: string;
}> => {
  try {
    // Format previous messages for context
    const messageHistory = formatMessageHistory(oldMessages, text);

    // Create prompt for content moderation
    const messages = [
      {
        role: "system",
        content: createSystemPrompt(filterConfig),
      },
      ...messageHistory,
    ];

    // Make API request
    const response = await client.post("/chat/completions", {
      model: config.akashChat.model,
      messages: messages,
      temperature: 0.2, // Low temperature for consistent responses
      max_tokens: 500,
    });

    // Parse the response
    const aiResponse = response.data?.choices?.[0]?.message?.content || "";
    return parseAiResponse(aiResponse);
  } catch (error) {
    console.error("Error calling Akash Chat API:", error);

    // Return a conservative response on error
    return {
      isViolation: true, // Block content on error to be safe
      flags: ["error"],
      reason: "AI analysis failed, blocking content as a precaution",
    };
  }
};

/**
 * Format message history for the API
 * @param oldMessages Previous messages
 * @param currentMessage Current message
 * @returns Formatted message history
 */
const formatMessageHistory = (
  oldMessages: Array<any> = [],
  currentMessage: string
): Array<{ role: string; content: string }> => {
  const formattedHistory: Array<{ role: string; content: string }> = [];

  // Process old messages (up to 15 max)
  const limitedMessages = oldMessages.slice(-15);

  // Add each message with alternating roles
  limitedMessages.forEach((msg, index) => {
    formattedHistory.push({
      role: index % 2 === 0 ? "Person1" : "Person2",
      content: typeof msg === "string" ? msg : msg.text || "",
    });
  });

  // Add current message
  formattedHistory.push({
    role: "user",
    content: currentMessage,
  });

  return formattedHistory;
};

/**
 * Create system prompt based on filter configuration
 * @param filterConfig Configuration for content filtering
 * @returns System prompt
 */
const createSystemPrompt = (filterConfig: Record<string, boolean>): string => {
  // Base prompt
  let prompt = `You are a content moderation assistant. Analyze the following messages to detect inappropriate content, return your response in a specific JSON format.
  
Rules for moderation:`;

  // Add rules based on config
  if (!filterConfig.allowAbuse) {
    prompt += `
- Flag abusive language, insults, hate speech, profanity, or offensive content`;
  }

  if (!filterConfig.allowPhone) {
    prompt += `
- Flag phone numbers (any format)`;
  }

  if (!filterConfig.allowEmail) {
    prompt += `
- Flag email addresses`;
  }

  if (!filterConfig.allowPhysicalInformation) {
    prompt += `
- Flag physical addresses, location information, credit card numbers, CVV codes, or any other financial information`;
  }

  if (!filterConfig.allowSocialInformation) {
    prompt += `
- Flag social media handles, usernames, profile links (Instagram, Twitter, Facebook, etc.)`;
  }

  // Add format instruction
  prompt += `

For your response, you must use this exact JSON format:
{
  "isViolation": true/false,
  "flags": ["flag1", "flag2", ...],
  "reason": "Detailed explanation of why the content violates rules"
}

Possible flags are: "abuse", "phone", "email", "address", "creditCard", "cvv", "socialMedia", "inappropriate", "pii".
If there are no violations, set isViolation to false and include an empty flags array.
If analyzing conversation history, focus on detecting attempts to circumvent moderation by spreading sensitive information across multiple messages.
`;

  return prompt;
};

/**
 * Parse AI response to extract moderation result
 * @param aiResponse Raw AI response
 * @returns Parsed moderation result
 */
const parseAiResponse = (
  aiResponse: string
): {
  isViolation: boolean;
  flags: string[];
  reason: string;
} => {
  try {
    // Try to extract JSON from the response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const jsonData = JSON.parse(jsonMatch[0]);

      return {
        isViolation: Boolean(jsonData.isViolation),
        flags: Array.isArray(jsonData.flags) ? jsonData.flags : [],
        reason: jsonData.reason || "No specific reason provided",
      };
    }

    // If no valid JSON found, create a default response
    return {
      isViolation:
        aiResponse.toLowerCase().includes("violation") ||
        aiResponse.toLowerCase().includes("inappropriate"),
      flags: ["unknown"],
      reason: aiResponse.substring(0, 200), // Truncate to avoid very long responses
    };
  } catch (error) {
    console.error("Error parsing AI response:", error);

    // Default response on error
    return {
      isViolation: false, // Conservative approach on parsing error
      flags: ["error"],
      reason: "Failed to parse AI response, blocking as precaution",
    };
  }
};
