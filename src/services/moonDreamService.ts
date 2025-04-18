import axios from "axios";
import { config } from "../config";

// Create axios client
const client = axios.create({
  baseURL: config.moonDream.baseUrl,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.moonDream.apiKey}`,
  },
  timeout: 30000, // 30 seconds for image processing
});

/**
 * Process image content through MoonDream 2B
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
    // Create prompt for image analysis
    const prompt = createImagePrompt(filterConfig);

    // Make API request
    const response = await client.post("/analyze", {
      image: imageBase64,
      prompt: prompt,
      max_tokens: 500,
    });

    // Parse the response
    const aiResponse = response.data?.result || "";
    return parseImageResponse(aiResponse);
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
 * Resize/optimize image before sending to API
 * @param imageBase64 Original base64 image
 * @param maxSize Maximum size in bytes
 * @returns Optimized base64 image
 */
export const optimizeImage = (
  imageBase64: string,
  maxSize: number = 1024 * 1024
): string => {
  // Simple size check for now - more sophisticated resize would require
  // image manipulation libraries which would add dependencies

  // Check if image is already under max size
  const sizeInBytes = Math.ceil((imageBase64.length * 3) / 4);

  if (sizeInBytes <= maxSize) {
    return imageBase64;
  }

  // For now, just warn about large images
  console.warn(
    `Image size (${sizeInBytes} bytes) exceeds optimal size (${maxSize} bytes)`
  );

  // In a production system, we would resize the image here
  return imageBase64;
};

/**
 * Create image analysis prompt based on filter configuration
 * @param filterConfig Configuration for content filtering
 * @returns System prompt
 */
const createImagePrompt = (filterConfig: Record<string, boolean>): string => {
  // Base prompt
  let prompt = `Analyze this image for content moderation.
  
Detect the following:
- Explicit, adult, or NSFW content
- Violent or graphic content`;

  // Add rules based on config
  if (!filterConfig.allowAbuse) {
    prompt += `
- Offensive, hateful, or abusive imagery`;
  }

  if (!filterConfig.allowPhone) {
    prompt += `
- Phone numbers`;
  }

  if (!filterConfig.allowEmail) {
    prompt += `
- Email addresses`;
  }

  if (!filterConfig.allowPhysicalInformation) {
    prompt += `
- Physical addresses, location information
- Credit card numbers, financial information
- Government IDs, documents`;
  }

  if (!filterConfig.allowSocialInformation) {
    prompt += `
- Social media handles or usernames
- Profile information`;
  }

  // Add format instruction
  prompt += `

Your response must be in this JSON format:
{
  "isViolation": true/false,
  "flags": ["flag1", "flag2", ...],
  "reason": "Detailed explanation of why the image violates rules"
}

Possible flags: "nsfw", "violence", "abuse", "phone", "email", "address", "pii", "creditCard", "socialMedia", "inappropriate".
If there are no violations, set isViolation to false with an empty flags array.
`;

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
