import axios from "axios";
import { config } from "../config";
import {
  generateAICacheKey,
  getCachedResponse,
  setCachedResponse,
} from "../utils/cache";
import { statsIncrement } from "../utils/redis";
import { trackApiResponseTime } from "../utils/apiResponseTime";

// Create axios client with optimized settings
const client = axios.create({
  baseURL: config.akashChat.baseUrl,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.akashChat.apiKey}`,
  },
  timeout: config.akashChat.timeout || 5000, // Use configured timeout
  // Add additional optimizations
  decompress: true, // Handle gzip/deflate responses to reduce payload size
});

/**
 * Pre-screen text to determine if AI analysis is needed
 * This method uses lightweight checks to avoid unnecessary AI API calls
 * @param text Text to pre-screen
 * @param filterConfig Configuration for content filtering
 * @returns Boolean indicating if AI review is needed
 */
export const isAIReviewNeeded = (
  text: string,
  filterConfig: Record<string, boolean> = {}
): boolean => {
  // If text is empty, no review needed
  if (!text || text.trim().length === 0) {
    setImmediate(() =>
      console.log(`[AI Pre-screen] Empty text, skipping AI review`)
    );
    return false;
  }

  // If text is too short (less than 3 words), likely no sensitive content
  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount < 3) {
    setImmediate(() =>
      console.log(
        `[AI Pre-screen] Text too short (${wordCount} words), skipping AI review`
      )
    );
    return false;
  }

  // Normalize text for more accurate screening
  const normalizedText = text.toLowerCase();

  // Check for benign phrases that can safely skip AI review
  const benignPhrases = [
    "do you know my no",
    "know my number",
    "know my no.",
    "what is your name",
    "how are you",
    "hello",
    "hi there",
    "good morning",
    "good afternoon",
    "good evening",
    "nice to meet you",
  ];

  if (normalizedText.length < 50) {
    for (const phrase of benignPhrases) {
      if (normalizedText.includes(phrase)) {
        setImmediate(() =>
          console.log(
            `[AI Pre-screen] Detected common benign phrase, skipping AI review`
          )
        );
        return false;
      }
    }
  }

  let needsReview = false;

  // PHONE NUMBER DETECTION - simplified for speed
  if (!filterConfig.allowPhone) {
    // Simplified phone regex for speed
    const phoneRegex = /\d{3}[-.\s)]\d{3}[-.\s]\d{4}|\d{10,}/;

    // Phone intent phrases
    const phoneIntentPhrases = ["call me", "my number", "phone", "text me"];

    const hasPhonePattern = phoneRegex.test(normalizedText);
    let hasPhoneIntent = false;

    if (!hasPhonePattern) {
      // Only check intent phrases if regex didn't match
      for (const phrase of phoneIntentPhrases) {
        if (normalizedText.includes(phrase)) {
          hasPhoneIntent = true;
          break;
        }
      }
    }

    if (hasPhonePattern || hasPhoneIntent) {
      setImmediate(() =>
        console.log(
          `[AI Pre-screen] Detected phone pattern or intent, AI review needed`
        )
      );
      return true; // Return early
    }
  }

  // EMAIL DETECTION - simplified for speed
  if (!filterConfig.allowEmail) {
    // Simplified email check for speed
    const emailRegex = /\S+@\S+\.\S+/;

    // Email intent phrases
    const emailIntentPhrases = ["my email", "email me", "contact me"];

    const hasEmailPattern = emailRegex.test(normalizedText);
    let hasEmailIntent = false;

    if (!hasEmailPattern) {
      // Only check intent phrases if regex didn't match
      for (const phrase of emailIntentPhrases) {
        if (normalizedText.includes(phrase)) {
          hasEmailIntent = true;
          break;
        }
      }
    }

    if (hasEmailPattern || hasEmailIntent) {
      setImmediate(() =>
        console.log(
          `[AI Pre-screen] Detected email pattern or intent, AI review needed`
        )
      );
      return true; // Return early
    }
  }

  // OFFENSIVE LANGUAGE DETECTION - simplified for speed
  if (!filterConfig.allowAbuse) {
    // Simplified offensive terms check
    const offensiveRegex = /\b(shit|fuck|bitch|ass|idiot|stupid)\b/i;

    // Offensive phrases
    const offensiveIntentPhrases = ["hate you", "shut up", "kill yourself"];

    const hasOffensivePattern = offensiveRegex.test(normalizedText);
    let hasOffensiveIntent = false;

    if (!hasOffensivePattern) {
      // Only check intent phrases if regex didn't match
      for (const phrase of offensiveIntentPhrases) {
        if (normalizedText.includes(phrase)) {
          hasOffensiveIntent = true;
          break;
        }
      }
    }

    if (hasOffensivePattern || hasOffensiveIntent) {
      setImmediate(() =>
        console.log(
          `[AI Pre-screen] Detected offensive content, AI review needed`
        )
      );
      return true; // Return early
    }
  }

  // PHYSICAL INFORMATION DETECTION - simplified for speed
  if (!filterConfig.allowPhysicalInformation) {
    // Simplified address check
    const addressRegex = /\d+\s+[A-Za-z\s]+(st|ave|rd|dr|ln|blvd)/i;

    // Simplified credit card pattern
    const creditCardRegex = /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/;

    // Location phrases
    const locationPhrases = ["i live at", "my address", "come to"];

    const hasAddressPattern = addressRegex.test(text);
    const hasCreditCardPattern = creditCardRegex.test(text);
    let hasLocationIntent = false;

    if (!hasAddressPattern && !hasCreditCardPattern) {
      // Only check intent phrases if patterns didn't match
      for (const phrase of locationPhrases) {
        if (normalizedText.includes(phrase)) {
          hasLocationIntent = true;
          break;
        }
      }
    }

    if (hasAddressPattern || hasCreditCardPattern || hasLocationIntent) {
      setImmediate(() =>
        console.log(
          `[AI Pre-screen] Detected physical information, AI review needed`
        )
      );
      return true; // Return early
    }
  }

  // SOCIAL INFORMATION DETECTION - simplified for speed
  if (!filterConfig.allowSocialInformation) {
    // Simplified social media check
    const socialMediaRegex = /@\w+|(?:instagram|twitter|facebook)\.com/i;

    // Social phrases
    const socialPhrases = ["follow me", "my profile", "username"];

    const hasSocialPattern = socialMediaRegex.test(text);
    let hasSocialIntent = false;

    if (!hasSocialPattern) {
      // Only check intent phrases if pattern didn't match
      for (const phrase of socialPhrases) {
        if (normalizedText.includes(phrase)) {
          hasSocialIntent = true;
          break;
        }
      }
    }

    if (hasSocialPattern || hasSocialIntent) {
      setImmediate(() =>
        console.log(
          `[AI Pre-screen] Detected social media information, AI review needed`
        )
      );
      return true; // Return early
    }
  }

  // CRITICAL TERMS CHECK - direct string matching for maximum speed
  const criticalTerms = [
    "account number",
    "routing number",
    "cvv",
    "bank account",
    "ssn",
    "social security",
    "passport",
    "license number",
    "password",
    "hack",
    "exploit",
  ];

  for (const term of criticalTerms) {
    if (normalizedText.includes(term)) {
      setImmediate(() =>
        console.log(
          `[AI Pre-screen] Detected critical term: ${term}, AI review needed`
        )
      );
      return true; // Return early
    }
  }

  // If we got here, no sensitive content was detected
  setImmediate(() =>
    console.log(
      `[AI Pre-screen] No sensitive patterns detected, skipping AI review`
    )
  );
  return false;
};

/**
 * Process text content through Akash Chat API
 * @param text Text to analyze
 * @param oldMessages Previous messages for context
 * @param filterConfig Configuration for content filtering
 * @returns Analysis result with flags, reasoning, and filtered content
 */
export const analyzeTextContent = async (
  text: string,
  oldMessages: Array<any> = [],
  filterConfig: Record<string, boolean> = {}
): Promise<{
  isViolation: boolean;
  flags: string[];
  reason: string;
  filteredContent?: string;
}> => {
  // First check if AI review is even needed
  if (!isAIReviewNeeded(text, filterConfig)) {
    console.log(
      `[AI Analysis] Pre-screening determined AI review not needed, returning safe result`
    );

    // Handle post-response stats in background
    setImmediate(async () => {
      try {
        await statsIncrement("ai:prescreening:skipped");
      } catch (error) {
        console.error(
          "[AI Analysis] Error tracking prescreening stats:",
          error
        );
      }
    });

    return {
      isViolation: false,
      flags: [],
      reason: "Content passed all moderation checks",
      filteredContent: filterConfig.generateFilteredContent ? text : undefined,
    };
  }

  try {
    console.log(
      `[AI Analysis] Starting analysis for text: "${text.substring(0, 30)}..."`
    );
    console.log(`[AI Analysis] Filter config:`, JSON.stringify(filterConfig));

    // Check if we have a cached result for this text and config
    const cacheKey = generateAICacheKey(text, oldMessages, filterConfig);
    console.log(
      `[AI Analysis] Generated AI cache key: ${cacheKey.substring(0, 15)}...`
    );

    // Try to get from cache first
    const cachedResult = await getCachedResponse(cacheKey);
    if (cachedResult) {
      console.log(`[AI Analysis] Cache hit! Using cached AI analysis result`);

      // Track AI cache hits for monitoring - in background
      setImmediate(async () => {
        try {
          await statsIncrement("ai:cache:hits");
        } catch (error) {
          console.error("[AI Analysis] Error tracking cache hit:", error);
        }
      });

      return cachedResult;
    }

    console.log(`[AI Analysis] Cache miss, calling Akash Chat API`);

    // Track AI cache misses for monitoring - in background
    setImmediate(async () => {
      try {
        await statsIncrement("ai:cache:misses");
      } catch (error) {
        console.error("[AI Analysis] Error tracking cache miss:", error);
      }
    });

    // Format previous messages for context - optimize for speed
    const messageHistory = formatMessageHistory(oldMessages, text);

    // Create prompt for content moderation
    const systemPrompt = createSystemPrompt(filterConfig);
    console.log(
      `[AI Analysis] Using system prompt length: ${systemPrompt.length} chars`
    );

    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
      ...messageHistory,
    ];

    // Track API call starting time for performance monitoring
    const apiCallStartTime = Date.now();

    // Make API request - optimized for speed
    console.log(
      `[AI Analysis] Sending request to Akash Chat API with ${messages.length} messages`
    );
    const response = await client.post("/chat/completions", {
      model: config.akashChat.model,
      messages: messages,
      temperature: 0.1, // Lower temperature for faster, more consistent responses
      max_tokens: 300, // Reduced token count for faster response
    });

    // Calculate API call duration for monitoring
    const apiCallDuration = Date.now() - apiCallStartTime;
    console.log(`[AI Analysis] API call completed in ${apiCallDuration}ms`);

    // Track API call performance for monitoring - in background
    setImmediate(async () => {
      try {
        await statsIncrement("ai:api:total_time", apiCallDuration);
        await statsIncrement("ai:api:call_count");

        // Track API response time for monitoring
        await trackApiResponseTime("text", apiCallDuration, false, false);
      } catch (error) {
        console.error("[AI Analysis] Error tracking API performance:", error);
      }
    });

    // Parse the response
    const aiResponse = response.data?.choices?.[0]?.message?.content || "";
    console.log(
      `[AI Analysis] Received response of length: ${aiResponse.length} chars`
    );
    console.log(
      `[AI Analysis] Raw AI response preview: "${aiResponse.substring(
        0,
        100
      )}..."`
    );

    const result = parseAiResponse(aiResponse);
    console.log(
      `[AI Analysis] Parsed result - isViolation: ${
        result.isViolation
      }, flags: [${result.flags.join(", ")}]`
    );
    if (result.filteredContent) {
      console.log(
        `[AI Analysis] Generated filtered content: "${result.filteredContent.substring(
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
          console.log(`[AI Analysis] Cached AI analysis result for future use`);
        }
      } catch (error) {
        console.error("[AI Analysis] Error caching result:", error);
      }
    });

    return result;
  } catch (error) {
    console.error("Error calling Akash Chat API:", error);

    // Track API errors for monitoring - in background
    setImmediate(async () => {
      try {
        await statsIncrement("ai:api:errors");

        // Track error response time for monitoring
        const errorDuration = 0; // We don't know the exact error duration
        await trackApiResponseTime("text", errorDuration, true, false);
      } catch (error) {
        console.error("[AI Analysis] Error tracking API error:", error);
      }
    });

    // Return a safer response on error (don't block by default)
    return {
      isViolation: false,
      flags: ["error"],
      reason: "AI analysis failed, allowing content as a precaution",
    };
  }
};

/**
 * Format message history for the API - optimized for efficiency and context preservation
 * @param oldMessages Previous messages
 * @param currentMessage Current message
 * @returns Formatted message history
 */
const formatMessageHistory = (
  oldMessages: Array<any> = [],
  currentMessage: string
): Array<{ role: string; content: string }> => {
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
    `[AI Analysis] Optimized message history: Using ${
      formattedHistory.length - 1
    } messages out of ${oldMessages.length} total messages`
  );

  return formattedHistory;
};

/**
 * Create system prompt based on filter configuration
 * @param filterConfig Configuration for content filtering
 * @returns System prompt
 */
const createSystemPrompt = (filterConfig: Record<string, boolean>): string => {
  // Base prompt
  let prompt = `You are a highly precise content moderation AI specializing in detecting and filtering ACTUAL sensitive information. Your CRITICAL task is to accurately analyze content and identify ONLY REAL sensitive information, never flagging vague references or common phrases.

DETECTION REQUIREMENTS: You must ONLY identify the following types of sensitive content:`;

  // Add rules based on config
  if (!filterConfig.allowAbuse) {
    prompt += `
- Abusive Language: ONLY clear and severe insults, hate speech, profanity, or explicitly offensive content. Do NOT flag mild criticism, slight rudeness, or common expressions like "this sucks" or "I'm annoyed".`;
  }

  if (!filterConfig.allowPhone) {
    prompt += `
- Phone Numbers: ONLY COMPLETE and REAL phone numbers including international formats with country codes (like +1 555-123-4567), local formats (like 555-123-4567), or plain digits in phone number format (like 5551234567). DO NOT flag:
  * Incomplete number fragments (like "call 555" or "dial 1234")
  * References to phone numbers without actual numbers (like "my phone" or "call me" or "do you know my no.")
  * Random digits that aren't in phone number format (like "I scored 123456 points")
  * Dates, addresses, or other number sequences not intended as phone numbers`;
  }

  if (!filterConfig.allowEmail) {
    prompt += `
- Email Addresses: ONLY COMPLETE and REAL email addresses with proper format (like user@example.com or name.surname@company.co.uk). DO NOT flag:
  * Incomplete email fragments (like "contact me at gmail" or "my email is with hotmail")
  * References to email without actual addresses (like "my email" or "send me an email")
  * Simple @ symbols used in other contexts (like "@username" for social media)`;
  }

  if (!filterConfig.allowPhysicalInformation) {
    prompt += `
- Physical Information: ONLY COMPLETE and REAL physical addresses (like "123 Main St, Anytown, CA"), specific credit card numbers (16 digits, possibly separated by spaces/dashes), CVV codes, or other specific financial information. DO NOT flag:
  * Vague location references (like "near downtown" or "in California")
  * Incomplete address fragments (like "Main Street" without a number)
  * References to payments without actual numbers (like "use my credit card")
  * Random numbers that aren't in credit card format`;
  }

  if (!filterConfig.allowSocialInformation) {
    prompt += `
- Social Information: ONLY COMPLETE and REAL social media handles (like @username), profile links (like instagram.com/username), or website URLs with personal identifiers. DO NOT flag:
  * Generic platform mentions (like "I use Instagram" or "check Facebook")
  * References to social media without specific handles (like "my profile" or "my account")
  * Generic website domains without personal information (like example.com)`;
  }

  // Add format instruction with improved detail and emphasis
  prompt += `

CRITICAL: ONLY mark content as violations if it contains ACTUAL, COMPLETE, REAL sensitive information - not vague references or incomplete data. Be extremely careful with false positives.

EXAMPLES OF WHAT NOT TO FLAG:
- "You can call me about the phone" - contains no actual phone number
- "Do you know my no." - contains no actual phone number, just a reference
- "My email is at gmail" - contains no complete email address
- "I'm in New York" - general location, not a specific address
- "Follow me online" - no specific social media handle
- "John is stupid sometimes" - mild criticism, not severe abuse

Your response MUST be in this EXACT JSON format:
{
  "isViolation": true/false,
  "flags": ["flag1", "flag2", ...],
  "reason": "Brief explanation without showing the sensitive content"`;

  // Add filtered content field if requested
  if (filterConfig.generateFilteredContent) {
    prompt += `,
  "filteredContent": "Original message with ALL sensitive information replaced with asterisks (*)"`;
  }

  prompt += `
}

Available flags: "abuse", "phone", "email", "address", "creditCard", "cvv", "socialMedia", "pii", "inappropriate"

CRITICAL REQUIREMENTS:
1. ONLY set "isViolation" to true if ACTUAL prohibited content is detected
2. List ONLY relevant flags that apply
3. In the "reason" field, be BRIEF and DO NOT include the actual sensitive content - instead use a generic reference like "contains a phone number" not "contains 555-123-4567"
4. When in doubt, DO NOT flag the content. It is better to let borderline content through than to block legitimate communication.`;

  // Add filtered content instructions if requested
  if (filterConfig.generateFilteredContent) {
    prompt += `
5. FILTERED CONTENT GENERATION IS EXTREMELY IMPORTANT:
   - You MUST replace THE ENTIRE sensitive information with asterisks (*), NOT just words like "phone" or "email"
   - Example: "My phone number is 555-123-4567" → "My phone number is ***********"
   - Example: "Call me at (123) 456-7890" → "Call me at **************"
   - Example: "Email me at user@example.com" → "Email me at ******************"
   - Replace ENTIRE phone numbers, ENTIRE email addresses, etc. with asterisks
   - Preserve the structure of the message - only replace the sensitive parts
   - The number of asterisks should roughly match the length of the filtered content`;
  }

  prompt += `

EXAMPLE 1 - REAL VIOLATION:
User: "My phone number is 555-123-4567 and email is user@example.com"
Your response:
{
  "isViolation": true,
  "flags": ["phone", "email"],
  "reason": "The content contains a phone number and an email address",
  "filteredContent": "My phone number is *********** and email is ****************"
}

EXAMPLE 2 - NOT A VIOLATION:
User: "You can call me about the phone"
Your response:
{
  "isViolation": false,
  "flags": [],
  "reason": "Content passed all moderation checks",
  "filteredContent": ""
}

EXAMPLE 3 - NOT A VIOLATION:
User: "My email is at gmail"
Your response:
{
  "isViolation": false,
  "flags": [],
  "reason": "Content passed all moderation checks",
  "filteredContent": ""
}

EXAMPLE 4 - NOT A VIOLATION:
User: "Hi how are you do you know my no."
Your response:
{
  "isViolation": false,
  "flags": [],
  "reason": "Content passed all moderation checks",
  "filteredContent": ""
}

EXAMPLE 5 - REAL VIOLATION:
User: "Contact me at +1-555-123-4567"
Your response:
{
  "isViolation": true,
  "flags": ["phone"],
  "reason": "The content contains a phone number",
  "filteredContent": "Contact me at **************"
}

If no violations are found, return:
{
  "isViolation": false,
  "flags": [],
  "reason": "Content passed all moderation checks"`;

  // Add empty filtered content for non-violations if requested
  if (filterConfig.generateFilteredContent) {
    prompt += `,
  "filteredContent": ""`;
  }

  prompt += `
}
`;

  return prompt;
};

/**
 * Parse AI response to extract moderation result - optimized for speed
 * @param aiResponse Raw AI response
 * @returns Parsed moderation result with optional filtered content
 */
const parseAiResponse = (
  aiResponse: string
): {
  isViolation: boolean;
  flags: string[];
  reason: string;
  filteredContent?: string;
} => {
  try {
    // Try to extract JSON from the response using more efficient extraction
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      console.log(
        `[AI Parsing] Found JSON in response: "${jsonMatch[0].substring(
          0,
          100
        )}..."`
      );
      const jsonData = JSON.parse(jsonMatch[0]);

      // Log the parsed data
      console.log(`[AI Parsing] Successfully parsed JSON response`);
      console.log(`[AI Parsing] isViolation: ${jsonData.isViolation}`);
      console.log(
        `[AI Parsing] flags: ${JSON.stringify(jsonData.flags || [])}`
      );
      console.log(
        `[AI Parsing] reason: "${
          jsonData.reason?.substring(0, 100) || "N/A"
        }..."`
      );
      if (jsonData.filteredContent) {
        console.log(
          `[AI Parsing] filteredContent: "${
            jsonData.filteredContent?.substring(0, 100) || "N/A"
          }..."`
        );
      }

      // Ensure reason doesn't contain sensitive information (shorten it if needed)
      const safeReason = ensureSafeReason(jsonData.reason || "");

      return {
        isViolation: Boolean(jsonData.isViolation),
        flags: Array.isArray(jsonData.flags) ? jsonData.flags : [],
        reason: safeReason,
        filteredContent: jsonData.filteredContent || undefined,
      };
    } else {
      console.log(`[AI Parsing] Failed to find valid JSON in response`);
    }

    // If no valid JSON found, use simplified extraction method
    console.log(`[AI Parsing] Using fallback parsing method`);
    const containsViolation = aiResponse.toLowerCase().includes("violation");

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
      aiResponse.toLowerCase().includes(flag.toLowerCase())
    );

    return {
      isViolation: containsViolation,
      flags: extractedFlags.length > 0 ? extractedFlags : ["unknown"],
      reason: containsViolation
        ? "Content contains sensitive information"
        : "Content passed all moderation checks",
    };
  } catch (error) {
    console.error(`[AI Parsing] Error parsing AI response:`, error);

    // Default response on error - don't block
    return {
      isViolation: false,
      flags: ["error"],
      reason: "Failed to parse AI response",
    };
  }
};

/**
 * Ensure the reason doesn't contain sensitive information
 * @param reason Original reason from AI
 * @returns Safe reason without sensitive data
 */
const ensureSafeReason = (reason: string): string => {
  // If reason is too long, it might contain sensitive data - truncate it
  if (reason.length > 100) {
    // Extract just the beginning part that likely describes the issue
    const briefReason = reason.substring(0, 50).split(".")[0];
    return `${briefReason}...`;
  }

  // Check for common patterns that might indicate sensitive data
  const containsPhone = /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|\+\d{1,3}\s?\d{5,}/.test(
    reason
  );
  const containsEmail = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/.test(
    reason
  );

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
};
