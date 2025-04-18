import { config } from "../config";
import { vl } from "moondream";

// Initialize the Moondream client
const model = new vl({ apiKey: config.moonDream.apiKey });

/**
 * Process image content through MoonDream API
 * @param imageBase64 Base64 encoded image
 * @param filterConfig Configuration for content filtering
 * @returns Analysis result with flags and reasoning
 */
export const analyzeImageContent = async (
  imageBase64: string,
  filterConfig: Record<string, boolean> = {}
): Promise<{
  isViolation: boolean;
  flags: string[];
  reason: string;
}> => {
  try {
    // Format the image for the API
    const imageData = formatImageForAPI(imageBase64);

    // Create question for content moderation based on config
    const question = createQuestionPrompt(filterConfig);

    // Make API request using the Moondream package
    const response = await model.query({
      image: imageData,
      question: question,
      stream: false,
    });

    // Parse the response to extract content moderation result
    return parseImageResponse(response.answer);
  } catch (error) {
    console.error("Error calling MoonDream API:", error);

    // Return a conservative response on error
    return {
      isViolation: true, // Block content on error to be safe
      flags: ["error"],
      reason: "Image analysis failed, blocking content as a precaution",
    };
  }
};

/**
 * Format image data for MoonDream API
 * @param imageBase64 Base64 encoded image
 * @returns Formatted image data with data URI prefix for API
 */
const formatImageForAPI = (imageBase64: string): string => {
  // If image already has a data URI prefix, use it as is
  if (imageBase64.startsWith("data:image/")) {
    return imageBase64;
  }

  // Add data URI prefix for JPEG (default format)
  return `data:image/jpeg;base64,${imageBase64}`;
};

/**
 * Resize/optimize image before sending to API
 * @param imageBase64 Original base64 image
 * @param maxSize Maximum size in bytes (10MB is API limit)
 * @returns Optimized base64 image
 */
export const optimizeImage = (
  imageBase64: string,
  maxSize: number = 10 * 1024 * 1024 // 10MB (MoonDream API limit)
): string => {
  // Check if image is already under max size
  const sizeInBytes = Math.ceil((imageBase64.length * 3) / 4);

  if (sizeInBytes <= maxSize) {
    return imageBase64;
  }

  // For now, just warn about large images
  console.warn(
    `Image size (${sizeInBytes} bytes) exceeds maximum size (${maxSize} bytes)`
  );

  // Truncate image if too large to avoid API errors
  if (sizeInBytes > maxSize) {
    const ratio = maxSize / sizeInBytes;
    const newLength = Math.floor(imageBase64.length * ratio);
    console.warn(`Truncating image to ${newLength} characters`);
    return imageBase64.substring(0, newLength);
  }

  return imageBase64;
};

/**
 * Create question prompt for MoonDream based on filter configuration
 * @param filterConfig Configuration for content filtering
 * @returns Question prompt for content moderation
 */
const createQuestionPrompt = (
  filterConfig: Record<string, boolean>
): string => {
  // Base prompt
  let prompt = `Analyze this image for content moderation. Is there any inappropriate content in this image?`;

  // Add specific checks based on config
  if (!filterConfig.allowAbuse) {
    prompt += ` Check for offensive, hateful, or abusive imagery.`;
  }

  if (!filterConfig.allowPhysicalInformation) {
    prompt += ` Check for physical addresses, location information, credit card numbers, government IDs, or documents.`;
  }

  if (!filterConfig.allowSocialInformation) {
    prompt += ` Check for social media profiles, handles, or usernames.`;
  }

  // Add response format instructions
  prompt += ` Respond in JSON format with isViolation (true/false), flags (array of specific issues), and reason (explanation). For flags, use: nsfw, violence, abuse, address, pii, creditCard, socialMedia, inappropriate.`;

  return prompt;
};

/**
 * Parse MoonDream response to extract moderation result
 * @param response Raw AI response
 * @returns Parsed moderation result
 */
const parseImageResponse = (
  response: string
): {
  isViolation: boolean;
  flags: string[];
  reason: string;
} => {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const jsonData = JSON.parse(jsonMatch[0]);

      return {
        isViolation: Boolean(jsonData.isViolation),
        flags: Array.isArray(jsonData.flags) ? jsonData.flags : [],
        reason: jsonData.reason || "No specific reason provided",
      };
    }

    // If no valid JSON found, create a default response based on keywords
    const isViolation =
      response.toLowerCase().includes("inappropriate") ||
      response.toLowerCase().includes("nsfw") ||
      response.toLowerCase().includes("explicit") ||
      response.toLowerCase().includes("offensive") ||
      response.toLowerCase().includes("adult");

    return {
      isViolation,
      flags: isViolation ? ["inappropriate"] : [],
      reason: isViolation
        ? "Image contains inappropriate content based on AI analysis"
        : "Image passed moderation checks",
    };
  } catch (error) {
    console.error("Error parsing MoonDream response:", error);

    // Default response on error
    return {
      isViolation: true, // Conservative approach on parsing error
      flags: ["error"],
      reason: "Failed to parse image analysis response, blocking as precaution",
    };
  }
};
