import { isAIReviewNeeded, PATTERNS } from "./akashChatService";
import { analyzeTextContentWithProvider } from "./aiProviderFactory";
import { analyzeImageContent, optimizeImage } from "./moonDreamService";
import {
  generateCacheKey,
  generateImageHash,
  getCachedResponse,
  setCachedResponse,
} from "../utils/cache";
import {
  trackFilterRequest,
  trackApiResponseTime,
  trackAllStatsUnified,
} from "./statsService";
import { statsIncrement } from "../utils/redis";
import {
  performanceMonitor,
  generateRequestId,
  measureResponseSize,
} from "../utils/performanceMonitor";
import logger from "../utils/logger";

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
  // PERFORMANCE OPTIMIZATION: Start performance monitoring
  const requestId = generateRequestId();
  performanceMonitor.startRequest(requestId, userId);

  // Start timing
  const startTime = Date.now();
  console.log(
    `[Filter] Starting content filter for user: ${userId} (${requestId})`
  );

  // Minimal debug logging in background
  setImmediate(() => {
    logger.debug(
      `Filter request: ${request.text ? "text" : ""}${
        request.image ? "+image" : ""
      }`
    );
  });

  // Default response
  let response: FilterResponse = {
    blocked: false,
    reason: "Content passed all checks",
    flags: [],
  };

  // Track if AI was used for performance monitoring
  let aiUsed = false;

  // Validate input - this is essential and must run before response
  if (!request.text && !request.image) {
    logger.warn(`Filter request rejected: No content provided`);
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

  // Log model tier in background (remove config dump)
  setImmediate(() => {
    logger.debug(`Filter using model: ${modelTier}`);
  });

  // Limit old messages to 15 - must happen before processing
  const oldMessages = Array.isArray(request.oldMessages)
    ? request.oldMessages.slice(-15)
    : [];

  // Remove verbose old messages logging

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
          // CRITICAL FIX: Enhanced pre-screening logic with confidence scoring
          const hasViolations = prescreeningResult.flags.length > 0;
          const isHighConfidence =
            (prescreeningResult.confidence || 1.0) >= 0.8;
          const shouldBlockImmediately =
            prescreeningResult.shouldBlock ||
            (hasViolations && isHighConfidence && prescreeningResult.reason);

          if (shouldBlockImmediately && !config.returnFilteredMessage) {
            // Pre-screening is confident - block immediately without AI
            setImmediate(() => {
              console.log(
                `[Filter] Pre-screening detected disallowed content: ${prescreeningResult.flags.join(
                  ", "
                )}, blocking immediately (confidence: ${
                  prescreeningResult.confidence || 1.0
                })`
              );
            });

            response.blocked = true;
            response.flags = prescreeningResult.flags;
            response.reason = prescreeningResult.reason;

            setImmediate(() => {
              console.log("[Filter] Pre-screening blocked content");
            });
          } else if (hasViolations && config.returnFilteredMessage) {
            // Pre-screening found violations but user wants filtered message
            // For simple patterns like email/phone, we can filter without AI
            if (
              prescreeningResult.flags.includes("phone_number") ||
              prescreeningResult.flags.includes("email_address")
            ) {
              setImmediate(() => {
                console.log(
                  `[Filter] Pre-screening detected simple pattern, filtering without AI`
                );
              });

              response.blocked = true;
              response.flags = prescreeningResult.flags;
              response.reason = prescreeningResult.reason;

              // Create simple filtered version
              if (prescreeningResult.flags.includes("phone_number")) {
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
              } else if (prescreeningResult.flags.includes("email_address")) {
                const emailMatch = request.text.match(PATTERNS.EMAIL.STANDARD);
                if (emailMatch && emailMatch[0]) {
                  const asterisks = "*".repeat(emailMatch[0].length);
                  response.filteredMessage = request.text.replace(
                    emailMatch[0],
                    asterisks
                  );
                } else {
                  response.filteredMessage = request.text;
                }
              } else {
                response.filteredMessage =
                  "[Content filtered due to policy violation]";
              }

              setImmediate(() => {
                console.log(
                  "[Filter] Pre-screening blocked content with simple filtering"
                );
              });
            } else {
              // Complex violations need AI for proper filtering
              setImmediate(() => {
                console.log(
                  `[Filter] Pre-screening detected complex violations, calling AI for proper filtering`
                );
              });

              const aiStartTime = Date.now();
              aiUsed = true;

              try {
                const aiResult = await analyzeTextContentWithProvider(
                  request.text,
                  oldMessages,
                  config,
                  modelTier
                );

                setImmediate(() => {
                  const aiProcessingTime = Date.now() - aiStartTime;
                  console.log(
                    `[Filter] AI filtering completed in ${aiProcessingTime}ms`
                  );
                });

                response.blocked = aiResult.isViolation;
                response.flags = [
                  ...new Set([...prescreeningResult.flags, ...aiResult.flags]),
                ];
                response.reason = aiResult.reason || prescreeningResult.reason;

                if (aiResult.filteredContent) {
                  response.filteredMessage = aiResult.filteredContent;
                } else {
                  response.filteredMessage =
                    "[Content filtered due to policy violation]";
                }
              } catch (aiError) {
                console.error("[Filter] AI filtering failed:", aiError);
                response.blocked = true;
                response.flags = prescreeningResult.flags;
                response.reason = prescreeningResult.reason;
                response.filteredMessage =
                  "[Content filtered due to policy violation]";
              }
            }
          } else if (hasViolations && !isHighConfidence) {
            // Pre-screening found violations but low confidence - call AI for accuracy
            setImmediate(() => {
              console.log(
                `[Filter] Pre-screening uncertain (confidence: ${
                  prescreeningResult.confidence || 1.0
                }), calling AI for accuracy`
              );
            });

            const aiStartTime = Date.now();
            aiUsed = true;

            try {
              const aiResult = await analyzeTextContentWithProvider(
                request.text,
                oldMessages,
                config,
                modelTier
              );

              setImmediate(() => {
                const aiProcessingTime = Date.now() - aiStartTime;
                console.log(
                  `[Filter] AI analysis completed in ${aiProcessingTime}ms`
                );
              });

              response.blocked = aiResult.isViolation;
              response.flags = [
                ...new Set([...prescreeningResult.flags, ...aiResult.flags]),
              ];
              response.reason = aiResult.reason || prescreeningResult.reason;

              if (config.returnFilteredMessage && aiResult.filteredContent) {
                response.filteredMessage = aiResult.filteredContent;
              }
            } catch (aiError) {
              console.error("[Filter] AI analysis failed:", aiError);
              response.blocked = true;
              response.flags = prescreeningResult.flags;
              response.reason = prescreeningResult.reason;
              if (config.returnFilteredMessage) {
                response.filteredMessage =
                  "[Content filtered due to policy violation]";
              }
            }
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
            aiUsed = true; // Mark that AI is being used

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
      // Remove verbose image processing logging

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

  // PERFORMANCE OPTIMIZATION: Mark core processing complete
  performanceMonitor.markCoreComplete(requestId, isCached, aiUsed);

  // PHASE 2 OPTIMIZATION: Unified Background Stats Pipeline
  // Batch ALL Redis operations into a single pipeline for maximum efficiency
  setImmediate(async () => {
    try {
      await trackAllStatsUnified(
        userId,
        response.blocked,
        response.flags,
        processingTime,
        isCached,
        request.text ? "text" : null,
        request.image ? "image" : null
      );

      logger.debug(`Stats tracking completed for user ${userId}`);
    } catch (error) {
      logger.error("Error in unified stats tracking (non-blocking)", error);
      // CRITICAL: Background errors should NEVER affect the API response
      // The trackAllStatsUnified function now has its own fallback handling
    }
  });

  // PHASE 2 OPTIMIZATION: Parallel Background Operations
  // Run cache operations in parallel with stats for maximum efficiency
  setImmediate(async () => {
    try {
      const backgroundTasks = [];

      // Task: Cache writing (if needed) - run in parallel with stats
      if (!isCached) {
        backgroundTasks.push(
          setCachedResponse(cacheKey, response)
            .then(() => {
              console.log(
                `[Filter] [PHASE2] Cached final result for key: ${cacheKey.substring(
                  0,
                  10
                )}...`
              );
            })
            .catch((error) => {
              console.error("[Filter] Error in cache processing:", error);
            })
        );
      }

      // Execute cache operations in parallel (stats already running in separate setImmediate)
      const startBackgroundTime = Date.now();
      await Promise.allSettled(backgroundTasks);
      const backgroundTime = Date.now() - startBackgroundTime;

      console.log(
        `[Filter] [PHASE2] Cache background processing completed in ${backgroundTime}ms`
      );

      // Complete performance monitoring
      const responseSize = measureResponseSize(response);
      performanceMonitor.completeRequest(requestId, responseSize);
    } catch (error) {
      console.error(
        "[Filter] Critical error in cache background processing:",
        error
      );
      // Background errors should not affect the API response
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
