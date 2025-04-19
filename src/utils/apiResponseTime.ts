import { trackApiResponseTime as statsTrackApiResponseTime } from "../services/statsService";

/**
 * Track API call response time
 * This is a wrapper around the statsService function for convenience
 *
 * @param apiType Type of API ('text' or 'image')
 * @param responseTimeMs Response time in milliseconds
 * @param isError Whether the call resulted in an error
 * @param isCacheHit Whether the result was from cache
 */
export const trackApiResponseTime = async (
  apiType: "text" | "image",
  responseTimeMs: number,
  isError: boolean = false,
  isCacheHit: boolean = false
): Promise<void> => {
  try {
    // Call the actual implementation in statsService
    await statsTrackApiResponseTime(
      apiType,
      responseTimeMs,
      isError,
      isCacheHit
    );
  } catch (error) {
    console.error(`Error tracking API response time:`, error);
  }
};
