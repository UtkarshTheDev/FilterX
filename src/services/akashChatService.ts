import axios from "axios";
import { config } from "../config";

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
 * Pre-screen content to determine if AI review is needed
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
    console.log(`[AI Pre-screen] Empty text, skipping AI review`);
    return false;
  }

  // If text is too short (less than 3 words), likely no sensitive content
  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount < 3) {
    console.log(
      `[AI Pre-screen] Text too short (${wordCount} words), skipping AI review`
    );
    return false;
  }

  // Check for trigger patterns based on configuration
  // These are very conservative checks that won't generate false negatives
  // They'll only skip AI review when it's extremely unlikely to have violations

  let needsReview = false;

  // First, check for the specific problematic pattern "do you know my no."
  if (
    text.toLowerCase().includes("do you know my no") ||
    text.toLowerCase().includes("know my number") ||
    text.toLowerCase().includes("know my no.")
  ) {
    // This is a reference to a number, not an actual number
    console.log(
      `[AI Pre-screen] Detected reference to 'my no.' without actual number, skipping AI review`
    );
    return false;
  }

  // Phone number check (only if phone numbers are not allowed)
  if (!filterConfig.allowPhone) {
    // Look for digit patterns that might indicate a phone number
    // This is intentionally loose - AI will do the precise check
    const containsDigitGroups = /\d{3,}/.test(text);
    if (containsDigitGroups) {
      console.log(
        `[AI Pre-screen] Possible phone number pattern detected, AI review needed`
      );
      needsReview = true;
    }
  }

  // Email check (only if emails are not allowed)
  if (!filterConfig.allowEmail && !needsReview) {
    // Look for simple @ pattern that might indicate an email
    const containsEmailPattern = /@/.test(text);
    if (containsEmailPattern) {
      console.log(
        `[AI Pre-screen] Possible email pattern detected, AI review needed`
      );
      needsReview = true;
    }
  }

  // Abuse language check (only if abuse is not allowed)
  if (!filterConfig.allowAbuse && !needsReview) {
    // Very simple check for common offensive terms
    // This is intentionally minimal - AI will do detailed analysis
    const commonOffensiveTerms = /\b(shit|fuck|bitch|ass|cunt|idiot|stupid)\b/i;
    if (commonOffensiveTerms.test(text)) {
      console.log(
        `[AI Pre-screen] Possible offensive language detected, AI review needed`
      );
      needsReview = true;
    }
  }

  // Physical information check
  if (!filterConfig.allowPhysicalInformation && !needsReview) {
    // Check for address-like patterns or credit card-like patterns
    const addressPattern =
      /\b\d+\s+[A-Za-z\s]+(?:street|st|avenue|ave|road|rd|drive|dr)\b/i;
    const creditCardPattern = /\b(?:\d[ -]*?){13,16}\b/;

    if (addressPattern.test(text) || creditCardPattern.test(text)) {
      console.log(
        `[AI Pre-screen] Possible physical information detected, AI review needed`
      );
      needsReview = true;
    }
  }

  // Social information check
  if (!filterConfig.allowSocialInformation && !needsReview) {
    // Check for social media handle-like patterns
    const socialMediaPattern =
      /\b(?:@\w+|(?:instagram|twitter|facebook|linkedin)\.com)\b/i;
    if (socialMediaPattern.test(text)) {
      console.log(
        `[AI Pre-screen] Possible social media information detected, AI review needed`
      );
      needsReview = true;
    }
  }

  // Check key phrases that might indicate sharing of contact information
  if (
    (!filterConfig.allowPhone ||
      !filterConfig.allowEmail ||
      !filterConfig.allowSocialInformation) &&
    !needsReview
  ) {
    // Make sure we DON'T match "do you know my no." pattern here
    const contactPhrases =
      /\b(?:contact me|reach me|call me at|my number is|text me at|my email is|my phone|my handle is|my username is)\b/i;

    if (
      contactPhrases.test(text) &&
      !text.toLowerCase().includes("do you know my no") &&
      !text.toLowerCase().includes("know my number") &&
      !text.toLowerCase().includes("know my no.")
    ) {
      console.log(
        `[AI Pre-screen] Contact-related phrases detected, AI review needed`
      );
      needsReview = true;
    }
  }

  // If none of the above triggered, we can skip AI review
  if (!needsReview) {
    console.log(
      `[AI Pre-screen] No sensitive patterns detected, skipping AI review`
    );
  }

  return needsReview;
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

    return result;
  } catch (error) {
    console.error("Error calling Akash Chat API:", error);

    // Return a safer response on error (don't block by default)
    return {
      isViolation: false,
      flags: ["error"],
      reason: "AI analysis failed, allowing content as a precaution",
    };
  }
};

/**
 * Format message history for the API - optimized for speed
 * @param oldMessages Previous messages
 * @param currentMessage Current message
 * @returns Formatted message history
 */
const formatMessageHistory = (
  oldMessages: Array<any> = [],
  currentMessage: string
): Array<{ role: string; content: string }> => {
  // Process old messages (up to 15 max)
  const limitedMessages = oldMessages.slice(-15);

  // More efficient formatting
  return [
    ...limitedMessages.map((msg, index) => ({
      role: index % 2 === 0 ? "Person1" : "Person2",
      content: typeof msg === "string" ? msg : msg.text || "",
    })),
    // Add current message
    {
      role: "user",
      content: currentMessage,
    },
  ];
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
