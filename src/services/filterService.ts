import { isAIReviewNeeded, PATTERNS } from "./akashChatService";
import { analyzeTextContentWithProvider } from "./aiProviderFactory";
import { analyzeImageContent, optimizeImage } from "./moonDreamService";
import {
  generateCacheKey,
  generateImageHash,
  getCachedResponse,
  setCachedResponse,
} from "../utils/cache";
import { trackFilterRequest, trackApiResponseTime } from "./statsService";
import { statsIncrement } from "../utils/redis";

// Default configuration - ALL FLAGS DEFAULT TO FALSE FOR SECURITY
// This ensures that if no config is provided or if specific flags are missing,
// the system defaults to the most restrictive/secure mode
const DEFAULT_CONFIG = {
  allowAbuse: false, // Block abusive language by default
  allowPhone: false, // Block phone numbers by default
  allowEmail: false, // Block email addresses by default
  allowPhysicalInformation: false, // Block physical addresses by default
  allowSocialInformation: false, // Block social media handles by default
  returnFilteredMessage: false, // Don't return filtered content by default
  analyzeImages: false, // Don't analyze images by default
};

// Interface for filter configuration
export interface FilterConfig {
  allowAbuse?: boolean;
  allowPhone?: boolean;
  allowEmail?: boolean;
  allowPhysicalInformation?: boolean;
  allowSocialInformation?: boolean;
  returnFilteredMessage?: boolean;
  analyzeImages?: boolean;
}

// Valid model tiers
export type ModelTier = "pro" | "normal" | "fast";

// Interface for filter request
export interface FilterRequest {
  text: string;
  image?: string;
  config?: FilterConfig | Record<string, any>;
  oldMessages?: Array<any>;
  model?: ModelTier;
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

  // Debug logging in background to not block response
  setImmediate(() => {
    console.log(
      `[Filter] Request text (preview): "${
        request.text?.substring(0, 30) || ""
      }${request.text?.length > 30 ? "..." : ""}"${
        request.image ? " with image" : ""
      }`
    );
  });

  // Default response
  let response: FilterResponse = {
    blocked: false,
    reason: "Content passed all checks",
    flags: [],
  };

  // Validate input - this is essential and must run before response
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

  // Validate and set model tier
  const modelTier = validateModelTier(request.model);

  // Log configuration and model tier in background
  setImmediate(() => {
    console.log(`[Filter] Using configuration:`, JSON.stringify(config));
    console.log(`[Filter] Using model tier: ${modelTier}`);
  });

  // Limit old messages to 15 - must happen before processing
  const oldMessages = Array.isArray(request.oldMessages)
    ? request.oldMessages.slice(-15)
    : [];

  // Log old messages in background
  setImmediate(() => {
    console.log(
      `[Filter] Processing with ${oldMessages.length} previous messages for context`
    );
  });

  // Generate a cache key - essential for cache checking
  const imageHash = request.image ? generateImageHash(request.image) : null;
  const cacheKey = generateCacheKey(
    request.text || "",
    config,
    oldMessages,
    imageHash || "",
    modelTier
  );

  let isCached = false;

  try {
    // Check cache for previous result - optimized for speed and essential
    const cachedResponse = await getCachedResponse(cacheKey);

    if (cachedResponse) {
      isCached = true;
      response = cachedResponse;

      // Log cache hit in background
      setImmediate(() => {
        console.log(
          `[Filter] Cache hit! Using cached response with ${response.flags.length} flags`
        );
      });

      // Cache hit - stats will be tracked at the end of the function

      return response;
    }

    // Log cache miss in background
    setImmediate(() => {
      console.log(`[Filter] Cache miss, proceeding with content analysis`);
    });

    // We're no longer tracking cache misses separately

    // Process text content
    if (request.text) {
      // First check if AI review is actually needed using the pre-screening method
      // This check is essential and must run before response
      const prescreeningResult = isAIReviewNeeded(request.text, config);

      if (!prescreeningResult.needsReview) {
        // Log pre-screening result in background
        setImmediate(() => {
          console.log(
            `[Filter] Pre-screening determined no AI review needed - content is safe`
          );
        });

        // Since pre-screening found nothing concerning, we can skip AI analysis entirely
        response.blocked = false;
        response.flags = [];
        response.reason = "Content passed pre-screening checks";

        // If filtered message was requested, just return the original text
        if (config.returnFilteredMessage) {
          response.filteredMessage = request.text;
          console.log(
            `[Filter] Adding original text as filtered message (no filtering needed)`
          );
        }

        // We're no longer tracking prescreening stats
        setImmediate(() => {
          console.log("[Filter] Pre-screening allowed content");
        });
      } else {
        // If pre-screening detected sensitive content but config allows it,
        // we can avoid AI analysis and just return the flags from pre-screening
        if (
          (prescreeningResult.flags.includes("phone_number") &&
            config.allowPhone) ||
          (prescreeningResult.flags.includes("email_address") &&
            config.allowEmail) ||
          (prescreeningResult.flags.includes("abusive_language") &&
            config.allowAbuse) ||
          (prescreeningResult.flags.includes("physical_address") &&
            config.allowPhysicalInformation) ||
          (prescreeningResult.flags.includes("social_media_handle") &&
            config.allowSocialInformation)
        ) {
          // Content contains sensitive info but it's allowed by config
          response.blocked = false;
          response.flags = prescreeningResult.flags;
          response.reason = "Content contains allowed sensitive information";

          // If filtered message was requested, just return the original text
          if (config.returnFilteredMessage) {
            response.filteredMessage = request.text;
          }

          // Log and track the allowed content
          setImmediate(() => {
            console.log(
              `[Filter] Pre-screening found sensitive content (${prescreeningResult.flags.join(
                ", "
              )}) but it's allowed by config`
            );
          });

          // We're no longer tracking prescreening stats
          setImmediate(() => {
            console.log("[Filter] Pre-screening allowed sensitive content");
          });
        } else {
          // If pre-screening detected disallowed content, we can block immediately
          // without needing to call the AI service
          if (
            prescreeningResult.flags.length > 0 &&
            prescreeningResult.reason
          ) {
            // Log detection in background
            setImmediate(() => {
              console.log(
                `[Filter] Pre-screening detected disallowed content: ${prescreeningResult.flags.join(
                  ", "
                )}, blocking immediately`
              );
            });

            // Block the content based on pre-screening
            response.blocked = true;
            response.flags = prescreeningResult.flags;
            response.reason = prescreeningResult.reason;

            // If filtered message was requested, create a simple filtered version
            if (config.returnFilteredMessage) {
              // For phone numbers, replace with asterisks
              if (prescreeningResult.flags.includes("phone_number")) {
                // Find phone number pattern
                const phoneMatch = request.text.match(PATTERNS.PHONE.STANDARD);
                if (phoneMatch && phoneMatch[0]) {
                  const asterisks = "*".repeat(phoneMatch[0].length);
                  response.filteredMessage = request.text.replace(
                    phoneMatch[0],
                    asterisks
                  );
                } else {
                  response.filteredMessage = request.text;
                }
              } else {
                // For other types, just use original text
                response.filteredMessage = request.text;
              }
            }

            // We're no longer tracking prescreening stats
            setImmediate(() => {
              console.log("[Filter] Pre-screening blocked content");
            });
          } else {
            // Log pre-screening result in background
            setImmediate(() => {
              console.log(
                `[Filter] Pre-screening detected sensitive content (${prescreeningResult.flags.join(
                  ", "
                )}), proceeding with AI analysis`
              );
            });

            // We're no longer tracking AI call stats
            setImmediate(() => {
              console.log("[Filter] Proceeding with AI analysis");
            });

            const aiStartTime = Date.now();

            try {
              // AI analysis is essential and must run before response
              const aiResult = await analyzeTextContentWithProvider(
                request.text,
                oldMessages,
                config,
                modelTier
              );

              // Track AI processing time in background
              setImmediate(() => {
                const aiProcessingTime = Date.now() - aiStartTime;
                console.log(
                  `[Filter] AI analysis completed in ${aiProcessingTime}ms`
                );
              });

              if (aiResult.isViolation) {
                // Log violation in background
                setImmediate(() => {
                  console.log(
                    `[Filter] AI detected violation with flags: [${aiResult.flags.join(
                      ", "
                    )}]`
                  );
                });

                response.blocked = true;
                response.flags = aiResult.flags;
                response.reason = aiResult.reason;

                // Use filtered message if available and requested
                if (config.returnFilteredMessage && aiResult.filteredContent) {
                  // Log filtered message generation in background
                  setImmediate(() => {
                    console.log(`[Filter] Using AI-generated filtered message`);
                  });

                  response.filteredMessage = aiResult.filteredContent;
                }

                // Track AI result for monitoring - in background after response
                setImmediate(async () => {
                  try {
                    await statsIncrement("filter:ai:blocked");
                  } catch (error) {
                    console.error(
                      "[Filter] Error tracking AI blocked stats:",
                      error
                    );
                  }
                });
              } else {
                // Log no violations in background
                setImmediate(() => {
                  console.log(`[Filter] AI analysis found no violations`);
                });

                // Track AI result for monitoring - in background after response
                setImmediate(async () => {
                  try {
                    await statsIncrement("filter:ai:allowed");
                  } catch (error) {
                    console.error(
                      "[Filter] Error tracking AI allowed stats:",
                      error
                    );
                  }
                });
              }
            } catch (error) {
              // Log error in background
              setImmediate(() => {
                console.error("[Filter] Error in AI text analysis:", error);
              });

              // Don't block content on AI error
              response.reason =
                "Content passed checks (AI service unavailable)";

              // Track AI errors for monitoring - in background after response
              setImmediate(async () => {
                try {
                  await statsIncrement("filter:ai:errors");
                } catch (error) {
                  console.error("[Filter] Error tracking AI errors:", error);
                }
              });
            }
          }
        }
      }
    }

    // Process image if provided and text wasn't blocked
    if (request.image && !response.blocked) {
      // Log image processing in background
      setImmediate(() => {
        console.log(`[Filter] Processing image content`);
      });

      // Track image analysis for monitoring - in background
      setImmediate(async () => {
        try {
          await statsIncrement("filter:image:called");
        } catch (error) {
          console.error("[Filter] Error tracking image call stats:", error);
        }
      });

      try {
        // Optimize image and analyze - essential operations
        const optimizedImage = await optimizeImage(request.image);

        // Log image optimization in background
        setImmediate(() => {
          console.log(`[Filter] Image optimized successfully`);
        });

        // Analyze the optimized image - essential operation
        const imageResult = await analyzeImageContent(optimizedImage);

        // Log image analysis result in background
        setImmediate(() => {
          console.log(
            `[Filter] Image analysis complete with result:`,
            JSON.stringify({
              isViolation: imageResult.isViolation,
              flags: imageResult.flags,
              reason: imageResult.reason,
            })
          );
        });

        if (imageResult.isViolation) {
          // Log image violation in background
          setImmediate(() => {
            console.log(`[Filter] Image flagged as inappropriate`);
          });

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

          // Log image flags in background
          setImmediate(() => {
            console.log(
              `[Filter] Added image flags: [${response.flags
                .filter((f) => f.startsWith("image_"))
                .join(", ")}]`
            );
          });

          // Track image result for monitoring - in background after response
          setImmediate(async () => {
            try {
              await statsIncrement("filter:image:blocked");
            } catch (error) {
              console.error(
                "[Filter] Error tracking image blocked stats:",
                error
              );
            }
          });
        } else {
          // Track image result for monitoring - in background after response
          setImmediate(async () => {
            try {
              await statsIncrement("filter:image:allowed");
            } catch (error) {
              console.error(
                "[Filter] Error tracking image allowed stats:",
                error
              );
            }
          });
        }
      } catch (error) {
        // Log error in background
        setImmediate(() => {
          console.error("[Filter] Error in image analysis:", error);
        });

        // Don't block content on image analysis error
        // Track image errors for monitoring - in background after response
        setImmediate(async () => {
          try {
            await statsIncrement("filter:image:errors");
          } catch (error) {
            console.error("[Filter] Error tracking image error stats:", error);
          }
        });
      }
    }
  } catch (error) {
    // Log error in background
    setImmediate(() => {
      console.error("[Filter] Unexpected error in filter processing:", error);
    });

    // Return a safe response on unexpected error
    response = {
      blocked: false,
      reason: "Content allowed due to processing error",
      flags: ["error"],
    };
  }

  // Calculate processing time
  const processingTime = Date.now() - startTime;
  console.log(
    `[Filter] Content filtering complete in ${processingTime}ms - ${
      response.blocked ? "BLOCKED" : "ALLOWED"
    }`
  );

  // Track API performance for ALL filter requests (regardless of AI usage)
  try {
    // Track text API performance if text was processed
    if (request.text) {
      await trackApiResponseTime("text", processingTime, false, isCached);
      console.log(
        `[Filter] Text API stats tracked: ${processingTime}ms, cached: ${isCached}`
      );
    }

    // Track image API performance if image was processed
    if (request.image) {
      await trackApiResponseTime("image", processingTime, false, isCached);
      console.log(
        `[Filter] Image API stats tracked: ${processingTime}ms, cached: ${isCached}`
      );
    }
  } catch (error) {
    console.error("[Filter] Error tracking API performance stats:", error);
  }

  // Track request IMMEDIATELY (not in background) to ensure stats are recorded
  try {
    await trackFilterRequest(
      userId,
      response.blocked,
      response.flags,
      processingTime,
      isCached
    );
    console.log(
      `[Filter] Stats tracked successfully for user ${userId}, cached: ${isCached}`
    );
  } catch (error) {
    console.error("[Filter] Error tracking request stats:", error);
  }

  // Run non-essential operations in the background after sending response
  setImmediate(async () => {
    try {
      // Cache the result if not already cached
      if (!isCached) {
        await setCachedResponse(cacheKey, response);
        console.log(
          `[Filter] Cached final result for key: ${cacheKey.substring(
            0,
            10
          )}...`
        );
      }

      console.log(`[Filter] Background processing complete`);
    } catch (error) {
      console.error("[Filter] Error in background processing:", error);
    }
  });

  return response;
};

/**
 * Validate model tier parameter
 * @param model Model tier string
 * @returns Validated model tier or 'normal' as default
 */
export const validateModelTier = (model: any): ModelTier => {
  // If model is not provided or invalid, default to 'normal'
  if (!model || typeof model !== "string") {
    return "normal";
  }

  // Check if the model is one of the valid tiers
  const validTiers: ModelTier[] = ["pro", "normal", "fast"];
  if (validTiers.includes(model as ModelTier)) {
    return model as ModelTier;
  }

  // If invalid tier provided, log warning and default to 'normal'
  console.log(`[Model] Invalid model tier '${model}', defaulting to 'normal'`);
  return "normal";
};

/**
 * Validate filter configuration - ensures all flags default to false if not provided
 * @param config Filter configuration (can be undefined, null, or partial)
 * @returns Validated configuration with all flags properly set
 */
export const validateFilterConfig = (
  config: Record<string, any> | undefined | null = {}
): Record<string, boolean> => {
  // Start with all defaults (all false)
  const validatedConfig: Record<string, boolean> = { ...DEFAULT_CONFIG };

  // If config is null, undefined, or not an object, return defaults
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    console.log(
      "[Config] Invalid or missing config, using all defaults (all flags = false)"
    );
    return validatedConfig;
  }

  // Type checking and sanitization of boolean values
  // Only override defaults if explicitly provided and truthy
  Object.entries(DEFAULT_CONFIG).forEach(([key, defaultValue]) => {
    if (key in config) {
      // Convert to boolean, but be strict about what counts as "true"
      // Only explicit true, "true", 1, or "1" should enable a flag
      const value = config[key];
      if (value === true || value === "true" || value === 1 || value === "1") {
        validatedConfig[key] = true;
      } else {
        // Everything else (false, "false", 0, "0", null, undefined, etc.) = false
        validatedConfig[key] = false;
      }
    } else {
      // Key not provided, use default (which is false for all flags)
      validatedConfig[key] = defaultValue;
    }
  });

  // Log configuration for debugging (in background)
  setImmediate(() => {
    const enabledFlags = Object.entries(validatedConfig)
      .filter(([_, value]) => value === true)
      .map(([key, _]) => key);

    if (enabledFlags.length > 0) {
      console.log(`[Config] Enabled flags: ${enabledFlags.join(", ")}`);
    } else {
      console.log("[Config] All flags disabled (default secure mode)");
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
