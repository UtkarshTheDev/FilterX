# FilterX: A Smart, Safe Content Moderation Solution

## Overview

FilterX is an AI-powered content moderation API designed to help digital platforms—such as chat applications, forums, social networks, and online communities—maintain a safe, respectful, and privacy-compliant environment. Utilizing a combination of fast, rule-based regex filtering with advanced AI analysis, FilterX efficiently detects, moderates, and filters harmful or sensitive content in real time.

## What is FilterX?

FilterX serves as a robust content moderation tool that:

- **Scans Content Quickly:** Uses customizable regex filters to detect abusive language, personal details, and other sensitive content.
- **Provides Deep Analysis:** Leverages Akash Chat API and MoonDream 2B models to understand context and nuance, ensuring accurate moderation even in subtle cases.
- **Generates Filtered Messages:** Offers an option to return a redacted version of content, preserving user interaction by replacing sensitive parts with placeholders (e.g., "[FILTERED]").
- **Maintains Context:** Supports analyzing previous messages (up to 15) to better understand conversation context and detect potential violations across messages.
- **Intelligent Caching:** Caches responses for identical content to improve performance while maintaining accurate statistics.

## Who Is It For?

FilterX is built for:

- **Developers** creating applications with user-generated content.
- **Platform Owners** needing to maintain safe and compliant online spaces.
- **Businesses** in sectors such as EdTech, gaming, and community-driven industries.
- **Startups** seeking a cost-effective, scalable moderation solution deployed on free-tier services.

## What Problem Does It Solve?

User-generated content can drive engagement but also introduce risks such as:

- Abusive or offensive language.
- Personal and sensitive information (e.g., phone numbers, emails, physical addresses, social media identifiers).
- Inappropriate images or content that breaks platform rules.
- Sequential attempts to share prohibited content across multiple messages.

Manual moderation is slow and expensive. FilterX solves these challenges by combining the speed of regex filtering with the contextual depth of AI analysis, ensuring harmful content is swiftly managed without sacrificing user experience.

## How Does It Work?

1. **Input:** A developer sends a request to the FilterX API with:
   - The text (for example, a chat message).
   - Optional images.
   - A configuration outlining allowed content and filtering rules.
   - Previous messages (optional, up to 15) for contextual analysis.
2. **Regex Check:** The API initially scans text using regex patterns to detect sensitive content such as:
   - Abusive language.
   - Personal details like phone numbers and emails.
   - **Physical Information:** Addresses, credit card numbers, CVV codes, and other physical details.
   - **Social Information:** Social media handles (e.g., Instagram IDs), emails, and phone numbers.
3. **Caching:** If the exact content has been processed before, the cached result is returned (while still updating statistics).
4. **Moderation:** Depending on the configuration:
   - If sensitive data is detected and is not allowed, the content is flagged or blocked.
   - If `returnFilteredMessage` is true, the API creates a sanitized version with placeholders.
5. **AI Analysis:** If necessary, the text (and images) are further analyzed using:
   - Akash Chat API for text, with context from previous messages if provided.
   - MoonDream 2B for images.
6. **Output:** The API returns a JSON response indicating:
   - Whether the content is blocked.
   - The reason for blocking (detailing which flags were triggered).
   - The relevant flags (e.g., abuse, phone, physical or social information).
   - A filtered message, if requested.

## Extended Moderation Flags

In addition to standard filtering options, FilterX now provides enhanced flag support to protect even more sensitive information:

- **allowPhysicalInformation:** Controls filtering of physical details such as addresses, credit card numbers, CVV codes, and other personal physical identifiers.
- **allowSocialInformation:** Manages filtering of social data, including emails, phone numbers, Instagram IDs, and other social media handles.
- **Additional Flags:** The modular design enables adding further custom flags to block any sensitive content that should not be shared online.

## Technical Details (for Developers)

- **API Structure:** RESTful endpoints hosted on Render (free tier).
- **Backend:** Built with Node.js/Express.js with Bun runtime for fast, asynchronous processing.
- **Database:** Uses PostgreSQL (via Neon) for secure API key storage and user management.
- **Caching & Stats:** Real-time statistics, usage data, and response caching managed by Redis (via Upstash).
- **ORM:** Drizzle ORM for type-safe, efficient PostgreSQL queries.
- **Security:** Implements robust API key authentication (IP-based for one key per user), rate limiting (30 requests per minute per key), HTTPS, input validation, and secure headers.
- **AI Integration:** Connects to Akash Chat API for text moderation with context awareness and MoonDream 2B for image scanning.
- **API Key Management:** Automatic API key generation and management based on user IP addresses to ensure one key per user.

## Key Features

- **Contextual Moderation:** Process up to 15 previous messages to detect attempts to circumvent filtering by spreading content across multiple messages.
- **Intelligent Caching:** Cache identical content responses to improve performance while still maintaining accurate usage statistics.
- **One API Key Per IP:** Simplified API key management that automatically assigns and retrieves keys based on user IP addresses.
- **Custom Filtering:** Highly configurable rule set that allows developers to enable or disable specific types of content filtering.
- **Performance Optimized:** Designed to handle high volumes of requests efficiently through parallel processing and intelligent caching.

## Benefits for Stakeholders

- **Users:** Benefit from a safe, respectful environment free from harmful or sensitive content.
- **Developers:** Enjoy straightforward API integration with clear, customizable moderation settings and automatic API key management.
- **Platform Owners:** Maintain trust and compliance while safeguarding community interactions.
- **Admins:** Gain valuable insights from real-time analytics on content flagging and moderation performance.

## Conclusion

FilterX is more than just a moderation tool—it is a comprehensive solution that ensures online spaces remain clean, engaging, and compliant with privacy standards. With fast regex-based filtering, deep AI analysis, extended flags including **allowPhysicalInformation** and **allowSocialInformation**, intelligent caching, and context-aware moderation, FilterX offers flexible, real-time content moderation suited for modern digital platforms.
