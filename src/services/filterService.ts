import { analyzeTextContent, isAIReviewNeeded } from "./akashChatService";
import { analyzeImageContent, optimizeImage } from "./moonDreamService";
import {
  generateCacheKey,
  generateImageHash,
  getCachedResponse,
  setCachedResponse,
} from "../utils/cache";
import { trackFilterRequest } from "./statsService";
import { statsIncrement } from "../utils/redis";

// Default configuration
const DEFAULT_CONFIG = {
  allowAbuse: false,
  allowPhone: false,
  allowEmail: false,
  allowPhysicalInformation: false,
  allowSocialInformation: false,
  returnFilteredMessage: false,
  generateFilteredContent: false,
  analyzeImages: false,
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
 * Main filter function that uses AI for content filtering
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
  console.log(`[Filter] Starting content filter for user: ${userId}`);
  console.log(
    `[Filter] Request text (preview): "${request.text?.substring(0, 30) || ""}${
      request.text?.length > 30 ? "..." : ""
    }"${request.image ? " with image" : ""}`
  );

  // Default response
  let response: FilterResponse = {
    blocked: false,
    reason: "Content passed all checks",
    flags: [],
  };

  // Validate input
  if (!request.text && !request.image) {
    console.log(`[Filter] Invalid request: No content provided`);
    response.blocked = true;
    response.reason = "No content provided (text or image required)";
    return response;
  }

  // Apply default configuration
  const config = {
    ...DEFAULT_CONFIG,
    ...(request.config || {}),
  };
  console.log(`[Filter] Using configuration:`, JSON.stringify(config));

  // Limit old messages to 15
  const oldMessages = Array.isArray(request.oldMessages)
    ? request.oldMessages.slice(-15)
    : [];
  console.log(
    `[Filter] Processing with ${oldMessages.length} previous messages for context`
  );

  // Generate a cache key
  const imageHash = request.image ? generateImageHash(request.image) : null;
  const cacheKey = generateCacheKey(
    request.text || "",
    config,
    oldMessages,
    imageHash || ""
  );
  console.log(`[Filter] Generated cache key: ${cacheKey.substring(0, 10)}...`);

  // Check cache for previous result - optimized for speed
  const cachedResponse = await getCachedResponse(cacheKey);
  let isCached = false;

  if (cachedResponse) {
    isCached = true;
    response = cachedResponse;
    console.log(
      `[Filter] Cache hit! Using cached response with ${response.flags.length} flags`
    );

    // Track cached request
    await trackFilterRequest(
      userId,
      response.blocked,
      response.flags,
      Date.now() - startTime,
      true
    );

    // Track cache hits for monitoring
    await statsIncrement("filter:cache:hits");

    return response;
  }
  console.log(`[Filter] Cache miss, proceeding with content analysis`);

  // Track cache misses for monitoring
  await statsIncrement("filter:cache:misses");

  // Process text content
  if (request.text) {
    // First check if AI review is actually needed using the pre-screening method
    if (!isAIReviewNeeded(request.text, config)) {
      console.log(
        `[Filter] Pre-screening determined no AI review needed - content is safe`
      );
      // Since pre-screening found nothing concerning, we can skip AI analysis entirely
      response.blocked = false;
      response.flags = [];
      response.reason = "Content passed pre-screening checks";

      // If filtered message was requested, just return the original text
      if (config.returnFilteredMessage) {
        response.filteredMessage = request.text;
      }

      // Track pre-screening success for monitoring
      await statsIncrement("filter:prescreening:handled");
      await statsIncrement("filter:prescreening:allowed");
    } else {
      // Pre-screening indicated potential concerns - proceed with AI analysis
      console.log(
        `[Filter] Pre-screening indicated potential concerns, proceeding with AI analysis`
      );

      // Track AI analysis for monitoring
      await statsIncrement("filter:ai:called");

      const aiStartTime = Date.now();

      try {
        const aiResult = await analyzeTextContent(request.text, oldMessages, {
          ...config,
          // Add flag for filtered content if requested
          generateFilteredContent: config.returnFilteredMessage,
        });

        // Track AI processing time
        const aiProcessingTime = Date.now() - aiStartTime;
        console.log(`[Filter] AI analysis completed in ${aiProcessingTime}ms`);

        if (aiResult.isViolation) {
          console.log(
            `[Filter] AI detected violation with flags: [${aiResult.flags.join(
              ", "
            )}]`
          );
          response.blocked = true;
          response.flags = aiResult.flags;
          response.reason = aiResult.reason;

          // Use filtered message if available and requested
          if (config.returnFilteredMessage && aiResult.filteredContent) {
            console.log(`[Filter] Using AI-generated filtered message`);
            response.filteredMessage = aiResult.filteredContent;
          }

          // Track AI result for monitoring
          await statsIncrement("filter:ai:blocked");
        } else {
          console.log(`[Filter] AI analysis found no violations`);
          // Track AI result for monitoring
          await statsIncrement("filter:ai:allowed");
        }
      } catch (error) {
        console.error("[Filter] Error in AI text analysis:", error);
        // Don't block content on AI error
        response.reason = "Content passed checks (AI service unavailable)";
        // Track AI errors for monitoring
        await statsIncrement("filter:ai:errors");
      }
    }
  }

  // Process image if provided and text wasn't blocked
  if (request.image && !response.blocked) {
    console.log(`[Filter] Processing image content`);

    // Track image analysis for monitoring
    await statsIncrement("filter:image:called");

    try {
      // Optimize image first for faster processing
      const optimizedImage = await optimizeImage(request.image);
      console.log(`[Filter] Image optimized successfully`);

      // Analyze the optimized image
      const imageResult = await analyzeImageContent(optimizedImage);
      console.log(
        `[Filter] Image analysis complete with result:`,
        JSON.stringify({
          isViolation: imageResult.isViolation,
          flags: imageResult.flags,
          reason: imageResult.reason,
        })
      );

      if (imageResult.isViolation) {
        console.log(`[Filter] Image flagged as inappropriate`);
        response.blocked = true;
        response.reason =
          imageResult.reason || "Image contains inappropriate content";

        // Add image-specific flags
        imageResult.flags.forEach((flag) => {
          const flagName = `image_${flag.toLowerCase().replace(/\s+/g, "_")}`;
          if (!response.flags.includes(flagName)) {
            response.flags.push(flagName);
          }
        });
        console.log(
          `[Filter] Added image flags: [${response.flags
            .filter((f) => f.startsWith("image_"))
            .join(", ")}]`
        );

        // Track image result for monitoring
        await statsIncrement("filter:image:blocked");
      } else {
        // Track image result for monitoring
        await statsIncrement("filter:image:allowed");
      }
    } catch (error) {
      console.error("[Filter] Error in image analysis:", error);
      // Don't block content on image analysis error
      // Track image errors for monitoring
      await statsIncrement("filter:image:errors");
    }
  }

  // Cache the result if not already cached
  if (!isCached) {
    await setCachedResponse(cacheKey, response);
    console.log(
      `[Filter] Cached final result for key: ${cacheKey.substring(0, 10)}...`
    );
  }

  // Track request
  await trackFilterRequest(
    userId,
    response.blocked,
    response.flags,
    Date.now() - startTime,
    false
  );

  // Add processing time to stats for monitoring
  const processingTime = Date.now() - startTime;
  console.log(
    `[Filter] Content filtering complete in ${processingTime}ms - ${
      response.blocked ? "BLOCKED" : "ALLOWED"
    }`
  );

  // Track performance metrics for monitoring service health
  if (processingTime < 100) {
    await statsIncrement("filter:performance:under100ms");
  } else if (processingTime < 500) {
    await statsIncrement("filter:performance:under500ms");
  } else if (processingTime < 1000) {
    await statsIncrement("filter:performance:under1000ms");
  } else {
    await statsIncrement("filter:performance:over1000ms");
  }

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
