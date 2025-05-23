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

// Pre-compiled regex patterns for maximum performance
export const PATTERNS = {
  // Phone patterns
  PHONE: {
    // International and domestic formats
    STANDARD:
      /\b(?:\+?(\d{1,3}))?[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/,
    // Spelled out numbers
    SPELLED:
      /\b(zero|one|two|three|four|five|six|seven|eight|nine)(\s+(zero|one|two|three|four|five|six|seven|eight|nine)){5,}\b/i,
  },
  // Email patterns
  EMAIL: {
    // Standard format
    STANDARD: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
    // Obfuscated format
    OBFUSCATED: /\b\S+\s+(?:at|[@])\s+\S+\s+(?:dot|[.])\s+\S+\b/i,
  },
  // Physical information
  PHYSICAL: {
    // Address with various street suffixes
    ADDRESS:
      /\d+\s+[A-Za-z\s]+(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|boulevard|apt|apartment|unit|#)\b/i,
    // Credit card patterns
    CREDIT_CARD: {
      // Standard 16-digit cards
      STANDARD: /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/,
      // American Express format
      AMEX: /\d{4}[-\s]?\d{6}[-\s]?\d{5}/,
    },
  },
  // Social media
  SOCIAL: {
    // Username handles
    HANDLE: /@\w+/i,
    // Domain patterns
    DOMAINS:
      /(?:instagram|twitter|x|facebook|tiktok|snapchat|linkedin|discord|youtube|pinterest|reddit|tumblr)\.com/i,
  },
  // Offensive language
  OFFENSIVE: {
    // Common offensive terms - expanded but still optimized for performance
    TERMS:
      /\b(shit|fuck|bitch|ass(?:hole)?|idiot|stupid|dick|bastard|cunt|damn|hell|piss|jerk|douche|moron)\b/i,
  },
  // Obfuscation detection
  OBFUSCATION: {
    // Excessive spacing between characters
    SPACED: /\b\w(\s+\w){4,}\b/,
  },
};

// Intent phrase collections - expanded for better detection
const INTENT_PHRASES = {
  // Phone sharing intent
  PHONE: [
    "call me",
    "my number",
    "phone",
    "text me",
    "reach me at",
    "my cell",
    "contact me on",
    "dial",
    "ring me",
    "my mobile",
    "my phone number is",
    "you can reach me",
    "get in touch",
    "my contact",
    "my line",
  ],
  // Email sharing intent
  EMAIL: [
    "my email",
    "email me",
    "contact me",
    "send me mail",
    "drop me a line",
    "shoot me an email",
    "write to me at",
    "send me a message",
    "my mail",
    "reach me by email",
  ],
  // Physical location sharing intent
  PHYSICAL: [
    "i live at",
    "my address",
    "come to",
    "visit me at",
    "located at",
    "my place is",
    "my house is at",
    "my location",
    "my home",
    "come over",
    "i'm located",
    "i stay at",
    "deliver to",
    "ship to",
    "i reside at",
  ],
  // Social media sharing intent
  SOCIAL: [
    "follow me",
    "my profile",
    "username",
    "add me on",
    "find me on",
    "my account",
    "friend me",
    "connect with me",
    "dm me",
    "message me on",
    "my handle",
    "check out my",
    "my page",
    "my channel",
  ],
  // Offensive intent
  OFFENSIVE: [
    "hate you",
    "shut up",
    "kill yourself",
    "go away",
    "screw you",
    "get lost",
    "f you",
    "f off",
    "drop dead",
    "go to hell",
    "you suck",
    "loser",
    "die",
    "stupid bot",
  ],
};

// Expanded critical terms for direct string matching (fastest detection)
const CRITICAL_TERMS = [
  // Financial information
  "account number",
  "routing number",
  "cvv",
  "bank account",
  "credit card",
  "debit card",
  "pin",
  "security code",
  "wire transfer",
  "bank details",
  "card number",
  "expiration date",

  // Personal identification
  "ssn",
  "social security",
  "passport",
  "license number",
  "id number",
  "birth certificate",
  "drivers license",
  "identification",

  // Security
  "password",
  "credentials",
  "login",
  "hack",
  "exploit",
  "secret question",
  "security question",
  "password reset",

  // Additional high-risk terms
  "private key",
  "bitcoin",
  "wallet address",
  "seed phrase",
];

// Common benign phrases that can safely skip AI review
const BENIGN_PHRASES = [
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
  "what time is it",
  "what day is it",
  "thanks",
  "thank you",
  "what can you do",
  "how can you help",
  "who are you",
  "what are you",
  "help me with",
  "can you explain",
  "please tell me about",
];

/**
 * Enhanced pre-screen text to determine if AI analysis is needed
 * Uses optimized patterns and intent detection to catch sensitive information
 * while maintaining high performance
 *
 * @param text Text to pre-screen
 * @param filterConfig Configuration for content filtering
 * @returns Object with result and detected flags
 */
export const isAIReviewNeeded = (
  text: string,
  filterConfig: Record<string, boolean> = {}
): { needsReview: boolean; flags: string[]; reason?: string } => {
  // Track flags and reasons
  const flags: string[] = [];
  let detectionReason: string | undefined;

  // Normalize and default the filter config
  // Treat undefined as false (disallowed), but explicit true as allowed
  const normalizedConfig = {
    allowAbuse: filterConfig.allowAbuse === true,
    allowPhone: filterConfig.allowPhone === true,
    allowEmail: filterConfig.allowEmail === true,
    allowPhysicalInformation: filterConfig.allowPhysicalInformation === true,
    allowSocialInformation: filterConfig.allowSocialInformation === true,
  };

  // STEP 1: Quick rejection checks - fastest operations first

  // If text is empty, no review needed
  if (!text || text.trim().length === 0) {
    setImmediate(() =>
      console.log(`[AI Pre-screen] Empty text, skipping AI review`)
    );
    return { needsReview: false, flags: [] };
  }

  // If text is very short (less than 3 words), likely no sensitive content
  const wordCount = text.trim().split(/\s+/).length;
  if (wordCount < 3) {
    setImmediate(() =>
      console.log(
        `[AI Pre-screen] Text too short (${wordCount} words), skipping AI review`
      )
    );
    return { needsReview: false, flags: [] };
  }

  // Normalize text for consistent matching
  const normalizedText = text.toLowerCase();

  // For short messages, check against common benign phrases - but only skip if no sensitive patterns
  if (normalizedText.length < 50) {
    let containsBenignPhrase = false;
    for (const phrase of BENIGN_PHRASES) {
      if (normalizedText.includes(phrase)) {
        containsBenignPhrase = true;
        break;
      }
    }

    // If it contains a benign phrase, still check for sensitive patterns before skipping
    if (containsBenignPhrase) {
      // Check for phone number patterns if phone numbers aren't allowed
      if (!normalizedConfig.allowPhone) {
        // Standard phone pattern check
        if (PATTERNS.PHONE.STANDARD.test(text)) {
          setImmediate(() =>
            console.log(
              `[AI Pre-screen] Detected phone number pattern despite benign phrase, AI review needed`
            )
          );
          flags.push("phone_number");
          detectionReason = "Contains a phone number";
          return { needsReview: true, flags, reason: detectionReason };
        }

        // Spelled out numbers check
        if (PATTERNS.PHONE.SPELLED.test(text)) {
          setImmediate(() =>
            console.log(
              `[AI Pre-screen] Detected spelled-out phone number despite benign phrase, AI review needed`
            )
          );
          flags.push("phone_number");
          detectionReason = "Contains a spelled-out phone number";
          return { needsReview: true, flags, reason: detectionReason };
        }
      }

      // Check for email patterns if emails aren't allowed
      if (
        !normalizedConfig.allowEmail &&
        (PATTERNS.EMAIL.STANDARD.test(text) ||
          PATTERNS.EMAIL.OBFUSCATED.test(text))
      ) {
        setImmediate(() =>
          console.log(
            `[AI Pre-screen] Detected email pattern despite benign phrase, AI review needed`
          )
        );
        flags.push("email_address");
        detectionReason = "Contains an email address";
        return { needsReview: true, flags, reason: detectionReason };
      }

      // Check for social media patterns if social info isn't allowed
      if (
        !normalizedConfig.allowSocialInformation &&
        (PATTERNS.SOCIAL.HANDLE.test(text) ||
          PATTERNS.SOCIAL.DOMAINS.test(text))
      ) {
        setImmediate(() =>
          console.log(
            `[AI Pre-screen] Detected social media pattern despite benign phrase, AI review needed`
          )
        );
        flags.push("social_media_handle");
        detectionReason = "Contains a social media handle";
        return { needsReview: true, flags, reason: detectionReason };
      }

      // If we got here, there's a benign phrase and no sensitive patterns, so we can skip AI review
      setImmediate(() =>
        console.log(
          `[AI Pre-screen] Confirmed benign phrase with no sensitive patterns, skipping AI review`
        )
      );
      return { needsReview: false, flags: [] };
    }
  }

  // STEP 2: Fast global checks - string matching for critical terms

  // Check for critical terms - direct string matching (very fast)
  for (const term of CRITICAL_TERMS) {
    if (normalizedText.includes(term)) {
      setImmediate(() =>
        console.log(
          `[AI Pre-screen] Detected critical term: ${term}, AI review needed`
        )
      );
      flags.push("critical_term");
      detectionReason = `Contains critical term: ${term}`;
      return { needsReview: true, flags, reason: detectionReason };
    }
  }

  // STEP 3: Obfuscation detection - catch evasion attempts

  // Check for suspicious spacing/obfuscation patterns
  if (PATTERNS.OBFUSCATION.SPACED.test(text)) {
    setImmediate(() =>
      console.log(
        `[AI Pre-screen] Detected potential obfuscation pattern, AI review needed`
      )
    );
    flags.push("obfuscation");
    detectionReason =
      "Contains suspicious text formatting that may hide sensitive information";
    return { needsReview: true, flags, reason: detectionReason };
  }

  // STEP 4: Configuration-based checks - ONLY run checks for disallowed content types

  // PHONE NUMBER DETECTION - Only check if not allowed
  if (!normalizedConfig.allowPhone) {
    // Check for standard phone patterns
    if (PATTERNS.PHONE.STANDARD.test(text)) {
      setImmediate(() =>
        console.log(
          `[AI Pre-screen] Detected phone number pattern, AI review needed`
        )
      );
      flags.push("phone_number");
      detectionReason = "Contains a phone number";
      return { needsReview: true, flags, reason: detectionReason };
    }

    // Check for spelled-out numbers
    if (PATTERNS.PHONE.SPELLED.test(text)) {
      setImmediate(() =>
        console.log(
          `[AI Pre-screen] Detected spelled-out phone number, AI review needed`
        )
      );
      flags.push("phone_number");
      detectionReason = "Contains a spelled-out phone number";
      return { needsReview: true, flags, reason: detectionReason };
    }

    // Check for phone sharing intent phrases
    for (const phrase of INTENT_PHRASES.PHONE) {
      if (normalizedText.includes(phrase)) {
        setImmediate(() =>
          console.log(
            `[AI Pre-screen] Detected phone sharing intent: "${phrase}", AI review needed`
          )
        );
        flags.push("phone_number_intent");
        detectionReason = `Contains text indicating an attempt to share phone contact: "${phrase}"`;
        return { needsReview: true, flags, reason: detectionReason };
      }
    }
  } else {
    setImmediate(() =>
      console.log(`[AI Pre-screen] Skipping phone number check (allowed)`)
    );
  }

  // EMAIL DETECTION - Only check if not allowed
  if (!normalizedConfig.allowEmail) {
    // Check for standard email patterns
    if (PATTERNS.EMAIL.STANDARD.test(text)) {
      setImmediate(() =>
        console.log(`[AI Pre-screen] Detected email pattern, AI review needed`)
      );
      flags.push("email_address");
      detectionReason = "Contains an email address";
      return { needsReview: true, flags, reason: detectionReason };
    }

    // Check for obfuscated email patterns (e.g., user at domain dot com)
    if (PATTERNS.EMAIL.OBFUSCATED.test(text)) {
      setImmediate(() =>
        console.log(
          `[AI Pre-screen] Detected obfuscated email pattern, AI review needed`
        )
      );
      flags.push("email_address");
      detectionReason = "Contains an obfuscated email address";
      return { needsReview: true, flags, reason: detectionReason };
    }

    // Check for email sharing intent phrases
    for (const phrase of INTENT_PHRASES.EMAIL) {
      if (normalizedText.includes(phrase)) {
        setImmediate(() =>
          console.log(
            `[AI Pre-screen] Detected email sharing intent: "${phrase}", AI review needed`
          )
        );
        flags.push("email_intent");
        detectionReason = `Contains text indicating an attempt to share email: "${phrase}"`;
        return { needsReview: true, flags, reason: detectionReason };
      }
    }
  } else {
    setImmediate(() =>
      console.log(`[AI Pre-screen] Skipping email check (allowed)`)
    );
  }

  // OFFENSIVE LANGUAGE DETECTION - Only check if not allowed
  if (!normalizedConfig.allowAbuse) {
    // Check for offensive terms
    if (PATTERNS.OFFENSIVE.TERMS.test(text)) {
      setImmediate(() =>
        console.log(
          `[AI Pre-screen] Detected offensive language, AI review needed`
        )
      );
      flags.push("abusive_language");
      detectionReason = "Contains offensive language";
      return { needsReview: true, flags, reason: detectionReason };
    }

    // Check for offensive intent phrases
    for (const phrase of INTENT_PHRASES.OFFENSIVE) {
      if (normalizedText.includes(phrase)) {
        setImmediate(() =>
          console.log(
            `[AI Pre-screen] Detected offensive intent: "${phrase}", AI review needed`
          )
        );
        flags.push("abusive_intent");
        detectionReason = `Contains text indicating offensive intent: "${phrase}"`;
        return { needsReview: true, flags, reason: detectionReason };
      }
    }
  } else {
    setImmediate(() =>
      console.log(`[AI Pre-screen] Skipping offensive language check (allowed)`)
    );
  }

  // PHYSICAL INFORMATION DETECTION - Only check if not allowed
  if (!normalizedConfig.allowPhysicalInformation) {
    // Check for address patterns
    if (PATTERNS.PHYSICAL.ADDRESS.test(text)) {
      setImmediate(() =>
        console.log(
          `[AI Pre-screen] Detected address pattern, AI review needed`
        )
      );
      flags.push("physical_address");
      detectionReason = "Contains a physical address";
      return { needsReview: true, flags, reason: detectionReason };
    }

    // Check for credit card patterns
    if (
      PATTERNS.PHYSICAL.CREDIT_CARD.STANDARD.test(text) ||
      PATTERNS.PHYSICAL.CREDIT_CARD.AMEX.test(text)
    ) {
      setImmediate(() =>
        console.log(
          `[AI Pre-screen] Detected credit card pattern, AI review needed`
        )
      );
      flags.push("credit_card");
      detectionReason = "Contains a credit card number";
      return { needsReview: true, flags, reason: detectionReason };
    }

    // Check for physical location sharing intent
    for (const phrase of INTENT_PHRASES.PHYSICAL) {
      if (normalizedText.includes(phrase)) {
        setImmediate(() =>
          console.log(
            `[AI Pre-screen] Detected physical location sharing intent: "${phrase}", AI review needed`
          )
        );
        flags.push("physical_location_intent");
        detectionReason = `Contains text indicating an attempt to share physical location: "${phrase}"`;
        return { needsReview: true, flags, reason: detectionReason };
      }
    }
  } else {
    setImmediate(() =>
      console.log(
        `[AI Pre-screen] Skipping physical information check (allowed)`
      )
    );
  }

  // SOCIAL INFORMATION DETECTION - Only check if not allowed
  if (!normalizedConfig.allowSocialInformation) {
    // Check for social media handle patterns
    if (PATTERNS.SOCIAL.HANDLE.test(text)) {
      setImmediate(() =>
        console.log(
          `[AI Pre-screen] Detected social media handle, AI review needed`
        )
      );
      flags.push("social_media_handle");
      detectionReason = "Contains a social media handle";
      return { needsReview: true, flags, reason: detectionReason };
    }

    // Check for social media domain patterns
    if (PATTERNS.SOCIAL.DOMAINS.test(text)) {
      setImmediate(() =>
        console.log(
          `[AI Pre-screen] Detected social media platform, AI review needed`
        )
      );
      flags.push("social_media_link");
      detectionReason = "Contains a social media link or platform reference";
      return { needsReview: true, flags, reason: detectionReason };
    }

    // Check for social sharing intent
    for (const phrase of INTENT_PHRASES.SOCIAL) {
      if (normalizedText.includes(phrase)) {
        setImmediate(() =>
          console.log(
            `[AI Pre-screen] Detected social media sharing intent: "${phrase}", AI review needed`
          )
        );
        flags.push("social_media_intent");
        detectionReason = `Contains text indicating an attempt to share social media contact: "${phrase}"`;
        return { needsReview: true, flags, reason: detectionReason };
      }
    }
  } else {
    setImmediate(() =>
      console.log(`[AI Pre-screen] Skipping social information check (allowed)`)
    );
  }

  // No sensitive patterns detected
  setImmediate(() =>
    console.log(
      `[AI Pre-screen] No sensitive patterns detected, skipping AI review`
    )
  );
  return { needsReview: false, flags: [] };
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
  const prescreeningResult = isAIReviewNeeded(text, filterConfig);

  if (!prescreeningResult.needsReview) {
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

    // Track API call performance IMMEDIATELY (not in background) to ensure stats are recorded
    try {
      await trackApiResponseTime("text", apiCallDuration, false, false);
      console.log(
        `[AI Analysis] API stats tracked successfully: ${apiCallDuration}ms`
      );
    } catch (error) {
      console.error("[AI Analysis] Error tracking API performance:", error);
    }

    // Track additional stats in background (non-essential)
    setImmediate(async () => {
      try {
        await statsIncrement("ai:api:total_time", apiCallDuration);
        await statsIncrement("ai:api:call_count");
      } catch (error) {
        console.error("[AI Analysis] Error tracking additional stats:", error);
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

    // Track API errors IMMEDIATELY (not in background) to ensure stats are recorded
    try {
      const errorDuration = 0; // We don't know the exact error duration
      await trackApiResponseTime("text", errorDuration, true, false);
      console.log(`[AI Analysis] API error stats tracked successfully`);
    } catch (statsError) {
      console.error(
        "[AI Analysis] Error tracking API error stats:",
        statsError
      );
    }

    // Track additional error stats in background (non-essential)
    setImmediate(async () => {
      try {
        await statsIncrement("ai:api:errors");
      } catch (error) {
        console.error(
          "[AI Analysis] Error tracking additional error stats:",
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
  // Normalize and default the filter config
  // Treat undefined as false (disallowed), but explicit true as allowed
  const normalizedConfig = {
    allowAbuse: filterConfig.allowAbuse === true,
    allowPhone: filterConfig.allowPhone === true,
    allowEmail: filterConfig.allowEmail === true,
    allowPhysicalInformation: filterConfig.allowPhysicalInformation === true,
    allowSocialInformation: filterConfig.allowSocialInformation === true,
    generateFilteredContent: filterConfig.generateFilteredContent === true,
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
    normalizedConfig.generateFilteredContent ? ',\n  "filteredContent": ""' : ""
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

  if (normalizedConfig.generateFilteredContent) {
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

  if (normalizedConfig.generateFilteredContent) {
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

  prompt += `

EXAMPLE RESPONSES:
1. User: "Call me at +1-555-123-4567 or user@example.com"`;

  if (!normalizedConfig.allowPhone && !normalizedConfig.allowEmail) {
    prompt += `
{
  "isViolation": true,
  "flags": ["phone", "email"],
  "reason": "Contains a phone number and an email address"${
    normalizedConfig.generateFilteredContent
      ? ',\n  "filteredContent": "Call me at ************** or ******************"'
      : ""
  }
}`;
  } else if (!normalizedConfig.allowPhone && normalizedConfig.allowEmail) {
    prompt += `
{
  "isViolation": true,
  "flags": ["phone"],
  "reason": "Contains a phone number"${
    normalizedConfig.generateFilteredContent
      ? ',\n  "filteredContent": "Call me at ************** or user@example.com"'
      : ""
  }
}`;
  } else if (normalizedConfig.allowPhone && !normalizedConfig.allowEmail) {
    prompt += `
{
  "isViolation": true,
  "flags": ["email"],
  "reason": "Contains an email address"${
    normalizedConfig.generateFilteredContent
      ? ',\n  "filteredContent": "Call me at +1-555-123-4567 or ******************"'
      : ""
  }
}`;
  } else {
    prompt += `
{
  "isViolation": false,
  "flags": [],
  "reason": "Content passed all moderation checks"${
    normalizedConfig.generateFilteredContent ? ',\n  "filteredContent": ""' : ""
  }
}`;
  }

  prompt += `

2. User: "Five friends, not five five five"
{
  "isViolation": false,
  "flags": [],
  "reason": "Content passed all moderation checks"${
    normalizedConfig.generateFilteredContent ? ',\n  "filteredContent": ""' : ""
  }
}

3. User: "My TikTok is funuser, 123 Main St"`;

  if (
    !normalizedConfig.allowSocialInformation &&
    !normalizedConfig.allowPhysicalInformation
  ) {
    prompt += `
{
  "isViolation": true,
  "flags": ["socialMedia", "address"],
  "reason": "Contains a social media handle and an address"${
    normalizedConfig.generateFilteredContent
      ? ',\n  "filteredContent": "My TikTok is *******, **************"'
      : ""
  }
}`;
  } else if (
    !normalizedConfig.allowSocialInformation &&
    normalizedConfig.allowPhysicalInformation
  ) {
    prompt += `
{
  "isViolation": true,
  "flags": ["socialMedia"],
  "reason": "Contains a social media handle"${
    normalizedConfig.generateFilteredContent
      ? ',\n  "filteredContent": "My TikTok is *******, 123 Main St"'
      : ""
  }
}`;
  } else if (
    normalizedConfig.allowSocialInformation &&
    !normalizedConfig.allowPhysicalInformation
  ) {
    prompt += `
{
  "isViolation": true,
  "flags": ["address"],
  "reason": "Contains an address"${
    normalizedConfig.generateFilteredContent
      ? ',\n  "filteredContent": "My TikTok is funuser, **************"'
      : ""
  }
}`;
  } else {
    prompt += `
{
  "isViolation": false,
  "flags": [],
  "reason": "Content passed all moderation checks"${
    normalizedConfig.generateFilteredContent ? ',\n  "filteredContent": ""' : ""
  }
}`;
  }

  prompt += `

If no violations:
{
  "isViolation": false,
  "flags": [],
  "reason": "Content passed all moderation checks"${
    normalizedConfig.generateFilteredContent ? ',\n  "filteredContent": ""' : ""
  }
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
