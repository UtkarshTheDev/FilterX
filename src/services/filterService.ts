import { scanTextWithRegex, generateFilteredMessage } from "./regexService";
import { analyzeTextContent } from "./akashChatService";
import { analyzeImageContent, optimizeImage } from "./moonDreamService";
import {
  generateCacheKey,
  generateImageHash,
  getCachedResponse,
  setCachedResponse,
} from "../utils/cache";
import { trackFilterRequest } from "./statsService";

// Default configuration
const DEFAULT_CONFIG = {
  allowAbuse: false,
  allowPhone: false,
  allowEmail: false,
  allowPhysicalInformation: false,
  allowSocialInformation: false,
  returnFilteredMessage: false,
};

// Interface for filter request
export interface FilterRequest {
  text: string;
  image?: string;
  config?: Record<string, boolean>;
  oldMessages?: Array<any>;
}

// Interface for filter response
export interface FilterResponse {
  blocked: boolean;
  reason: string;
  flags: string[];
  filteredMessage?: string;
}

/**
 * Main filter function that combines regex, AI, and caching
 * @param request Filter request
 * @param userId User ID for tracking
 * @returns Filter response
 */
export const filterContent = async (
  request: FilterRequest,
  userId: string
): Promise<FilterResponse> => {
  // Start timing
  const startTime = Date.now();

  // Default response
  let response: FilterResponse = {
    blocked: false,
    reason: "Content passed all checks",
    flags: [],
  };

  // Validate input
  if (!request.text && !request.image) {
    response.blocked = true;
    response.reason = "No content provided (text or image required)";
    return response;
  }

  // Apply default configuration
  const config = {
    ...DEFAULT_CONFIG,
    ...(request.config || {}),
  };

  // Limit old messages to 15
  const oldMessages = Array.isArray(request.oldMessages)
    ? request.oldMessages.slice(-15)
    : [];

  // Generate a cache key
  const imageHash = request.image ? generateImageHash(request.image) : null;
  const cacheKey = generateCacheKey(
    request.text || "",
    config,
    oldMessages,
    imageHash || ""
  );

  // Check cache for previous result
  const cachedResponse = await getCachedResponse(cacheKey);
  let isCached = false;

  if (cachedResponse) {
    isCached = true;
    response = cachedResponse;

    // Track cached request
    await trackFilterRequest(
      userId,
      response.blocked,
      response.flags,
      Date.now() - startTime,
      true
    );

    return response;
  }

  // Start with regex filtering for text
  if (request.text) {
    const regexResult = scanTextWithRegex(request.text, config);

    if (regexResult.hasMatch) {
      response.blocked = true;
      response.flags = regexResult.flags;
      response.reason = `Detected: ${regexResult.flags.join(", ")}`;

      // Generate filtered message if requested
      if (config.returnFilteredMessage) {
        response.filteredMessage = generateFilteredMessage(
          request.text,
          regexResult.matches
        );
      }

      // Cache the result
      await setCachedResponse(cacheKey, response);

      // Track request
      await trackFilterRequest(
        userId,
        response.blocked,
        response.flags,
        Date.now() - startTime,
        false
      );

      return response;
    }

    // If regex doesn't find anything, proceed to AI analysis
    try {
      const aiResult = await analyzeTextContent(
        request.text,
        oldMessages,
        config
      );

      if (aiResult.isViolation) {
        response.blocked = true;
        response.flags = aiResult.flags;
        response.reason = aiResult.reason;

        // Generate filtered message if requested
        if (config.returnFilteredMessage) {
          // We don't have the exact matches from AI, so use a simple placeholder
          response.filteredMessage = request.text
            .split(" ")
            .map((word) =>
              aiResult.flags.some((flag) =>
                word.toLowerCase().includes(flag.toLowerCase())
              )
                ? "[FILTERED]"
                : word
            )
            .join(" ");
        }
      }
    } catch (error) {
      console.error("Error in AI text analysis:", error);
      // Don't block content on AI error if regex passed
    }
  }

  // Process image if provided
  if (request.image && !response.blocked) {
    try {
      // Optimize image before sending to API
      const optimizedImage = optimizeImage(request.image);

      // Analyze image content
      const imageResult = await analyzeImageContent(optimizedImage, config);

      if (imageResult.isViolation) {
        response.blocked = true;
        response.flags.push(...imageResult.flags);
        response.reason = imageResult.reason;
      }
    } catch (error) {
      console.error("Error in image analysis:", error);
      // Don't block on error if text passed
    }
  }

  // Cache the result
  await setCachedResponse(cacheKey, response);

  // Track request
  await trackFilterRequest(
    userId,
    response.blocked,
    response.flags,
    Date.now() - startTime,
    false
  );

  return response;
};

/**
 * Validate filter configuration
 * @param config Filter configuration
 * @returns Validated configuration
 */
export const validateFilterConfig = (
  config: Record<string, any> = {}
): Record<string, boolean> => {
  const validatedConfig: Record<string, boolean> = { ...DEFAULT_CONFIG };

  // Type checking and sanitization of boolean values
  Object.entries(DEFAULT_CONFIG).forEach(([key, defaultValue]) => {
    if (key in config) {
      validatedConfig[key] = Boolean(config[key]);
    } else {
      validatedConfig[key] = defaultValue;
    }
  });

  return validatedConfig;
};

/**
 * Validate old messages array
 * @param oldMessages Array of old messages
 * @returns Validated array
 */
export const validateOldMessages = (oldMessages: any): Array<any> => {
  if (!Array.isArray(oldMessages)) {
    return [];
  }

  // Limit to 15 messages
  return oldMessages.slice(-15);
};
