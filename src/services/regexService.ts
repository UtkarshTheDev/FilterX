import { cacheGet, cacheSet } from "../utils/redis";
import { config } from "../config";

// Default regex dictionary
const DEFAULT_REGEX_PATTERNS = {
  phone: {
    pattern:
      "\\b(?:\\+?\\d{1,3}[-.\\s]?)?(?:\\(\\d{3}\\)[-.\\s]?|\\d{3}[-.\\s]?)\\d{3}[-.\\s]?\\d{4}\\b|\\b\\d{10}\\b",
    description: "Phone numbers in various formats",
  },
  email: {
    pattern: "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b",
    description: "Email addresses",
  },
  abuse: {
    pattern:
      "\\b(idiot|jerk|stupid|dumb|moron|loser|ass|asshole|bitch|bastard|dick|cunt|retard|slut|whore|faggot)\\b",
    description: "Abusive language",
  },
  creditCard: {
    pattern: "\\b(?:\\d{4}[-\\s]?){3}\\d{4}\\b|\\b\\d{16}\\b",
    description: "Credit card numbers",
  },
  cvv: {
    pattern: "\\b[Cc][Vv][Vv]\\s*:?\\s*\\d{3,4}\\b",
    description: "CVV codes",
  },
  address: {
    pattern:
      "\\b\\d+\\s+[A-Za-z0-9\\s,.]+(?:street|st|avenue|ave|road|rd|highway|hwy|square|sq|trail|trl|drive|dr|court|ct|parkway|pkwy|circle|cir|boulevard|blvd)\\b",
    description: "Physical addresses",
  },
  zipcode: {
    pattern: "\\b\\d{5}(?:-\\d{4})?\\b",
    description: "ZIP codes",
  },
  socialMedia: {
    pattern:
      "\\b(?:@\\w+|(?:on\\s+)?(?:instagram|twitter|facebook|linkedin|youtube|tiktok|snapchat|pinterest|reddit|tumblr|discord|whatsapp|telegram|signal|twitch)(?:\\s+@)?[A-Za-z0-9._]+|\\w+\\.(?:com|net|org|io)(?:[/\\w-]+)?|(?:instagram|facebook|twitter|linkedin|youtube|tiktok)\\.com\\/[\\w.-]+|fb\\.(?:com|me)\\/[\\w.-]+|t\\.me\\/[\\w]+|https?:\\/\\/(?:www\\.)?(?:[A-Za-z0-9_-]+\\.)+[A-Za-z0-9_-]+(?:\\/[A-Za-z0-9_\\-./]+)?)\\b",
    description: "Social media handles and profile links across platforms",
  },
};

// Cached compiled regex patterns
const regexCache: Record<string, RegExp> = {};

/**
 * Precompile and cache regex patterns
 */
export const initRegexPatterns = async (): Promise<void> => {
  // Try to load patterns from Redis first
  const cachedPatterns = await cacheGet("regex:patterns");

  // If patterns exist in Redis, use those
  if (cachedPatterns) {
    try {
      const patterns = JSON.parse(cachedPatterns);

      // Compile and cache all patterns
      Object.entries(patterns).forEach(([name, data]: [string, any]) => {
        try {
          regexCache[name] = new RegExp(data.pattern, "i");
        } catch (error) {
          console.error(`Error compiling regex for ${name}:`, error);
          // Fallback to default if available
          if (
            DEFAULT_REGEX_PATTERNS[name as keyof typeof DEFAULT_REGEX_PATTERNS]
          ) {
            regexCache[name] = new RegExp(
              DEFAULT_REGEX_PATTERNS[
                name as keyof typeof DEFAULT_REGEX_PATTERNS
              ].pattern,
              "i"
            );
          }
        }
      });

      console.log("Regex patterns loaded from Redis");
    } catch (error) {
      console.error("Error parsing cached regex patterns:", error);
      compileFallbackPatterns();
    }
  } else {
    // Otherwise use the default patterns
    compileFallbackPatterns();

    // And store them in Redis for future use
    await cacheSet(
      "regex:patterns",
      JSON.stringify(DEFAULT_REGEX_PATTERNS),
      86400
    ); // 24 hours
  }
};

/**
 * Compile default patterns as fallback
 */
const compileFallbackPatterns = () => {
  Object.entries(DEFAULT_REGEX_PATTERNS).forEach(([name, data]) => {
    try {
      regexCache[name] = new RegExp(data.pattern, "i");
    } catch (error) {
      console.error(`Error compiling regex for ${name}:`, error);
    }
  });

  console.log("Default regex patterns loaded");
};

/**
 * Scan text with regex patterns and config
 * @param text Text to scan
 * @param config Configuration object with allowed flags
 * @returns Object with detected flags and matched patterns
 */
export const scanTextWithRegex = (
  text: string,
  filterConfig: Record<string, boolean>
): {
  flags: string[];
  matches: Record<string, string[]>;
  hasMatch: boolean;
} => {
  const flags: string[] = [];
  const matches: Record<string, string[]> = {};
  let hasMatch = false;

  // Scan for phone numbers, if not allowed
  if (!filterConfig.allowPhone && regexCache.phone?.test(text)) {
    flags.push("phone");
    matches.phone = findAllMatches(text, regexCache.phone);
    hasMatch = true;
  }

  // Scan for email addresses, if not allowed
  if (!filterConfig.allowEmail && regexCache.email?.test(text)) {
    flags.push("email");
    matches.email = findAllMatches(text, regexCache.email);
    hasMatch = true;
  }

  // Scan for abusive language, if not allowed
  if (!filterConfig.allowAbuse && regexCache.abuse?.test(text)) {
    flags.push("abuse");
    matches.abuse = findAllMatches(text, regexCache.abuse);
    hasMatch = true;
  }

  // Scan for physical information, if not allowed
  if (!filterConfig.allowPhysicalInformation) {
    // Check addresses
    if (regexCache.address?.test(text)) {
      flags.push("address");
      matches.address = findAllMatches(text, regexCache.address);
      hasMatch = true;
    }

    // Check ZIP codes
    if (regexCache.zipcode?.test(text)) {
      flags.push("zipcode");
      matches.zipcode = findAllMatches(text, regexCache.zipcode);
      hasMatch = true;
    }

    // Check credit card numbers
    if (regexCache.creditCard?.test(text)) {
      flags.push("creditCard");
      matches.creditCard = findAllMatches(text, regexCache.creditCard);
      hasMatch = true;
    }

    // Check CVV codes
    if (regexCache.cvv?.test(text)) {
      flags.push("cvv");
      matches.cvv = findAllMatches(text, regexCache.cvv);
      hasMatch = true;
    }
  }

  // Scan for social information, if not allowed
  if (!filterConfig.allowSocialInformation) {
    // Check social media handles and links with the consolidated pattern
    if (regexCache.socialMedia?.test(text)) {
      flags.push("socialMedia");
      matches.socialMedia = findAllMatches(text, regexCache.socialMedia);
      hasMatch = true;
    }

    // Include these again for social information if not already checked
    if (
      !filterConfig.allowPhone &&
      !flags.includes("phone") &&
      regexCache.phone?.test(text)
    ) {
      flags.push("phone");
      matches.phone = findAllMatches(text, regexCache.phone);
      hasMatch = true;
    }

    if (
      !filterConfig.allowEmail &&
      !flags.includes("email") &&
      regexCache.email?.test(text)
    ) {
      flags.push("email");
      matches.email = findAllMatches(text, regexCache.email);
      hasMatch = true;
    }
  }

  return { flags, matches, hasMatch };
};

/**
 * Find all matches for a regex pattern in text
 * @param text Text to scan
 * @param regex Regular expression
 * @returns Array of matched strings
 */
const findAllMatches = (text: string, regex: RegExp): string[] => {
  const matches: string[] = [];
  let match;

  // Create a copy of the regex to reset lastIndex
  const regexCopy = new RegExp(regex.source, regex.flags);

  while ((match = regexCopy.exec(text)) !== null) {
    matches.push(match[0]);
    // Avoid infinite loops with zero-width matches
    if (match.index === regexCopy.lastIndex) {
      regexCopy.lastIndex++;
    }
  }

  return matches;
};

/**
 * Generate a filtered version of text with sensitive content replaced
 * @param text Original text
 * @param matches Matches object with patterns and their matches
 * @param filterMarker Text to replace sensitive content with, or null to use asterisks
 * @returns Filtered text
 */
export const generateFilteredMessage = (
  text: string,
  matches: Record<string, string[]>,
  filterMarker: string | null = null
): string => {
  let filteredText = text;

  // Sort matches by length (descending) to avoid partial replacements
  const allMatches = Object.values(matches)
    .flat()
    .sort((a, b) => b.length - a.length);

  // Replace each match with the filter marker or asterisks
  allMatches.forEach((match) => {
    // Escape special regex characters
    const safeMatch = escapeRegExp(match);

    // If filterMarker is null, use asterisks matching the length of the content
    const replacement = filterMarker || "*".repeat(Math.min(match.length, 8));

    // Try to replace with word boundaries first
    const withBoundaries = new RegExp(`\\b${safeMatch}\\b`, "g");
    const beforeReplace = filteredText;
    filteredText = filteredText.replace(withBoundaries, replacement);

    // If no replacement was made or the match doesn't work with word boundaries
    // (like email@example.com), try without boundaries
    if (beforeReplace === filteredText || filteredText.includes(match)) {
      filteredText = filteredText.replace(
        new RegExp(safeMatch, "g"),
        replacement
      );
    }
  });

  return filteredText;
};

/**
 * Escape special regex characters in string
 * @param string String to escape
 * @returns Escaped string
 */
const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};
