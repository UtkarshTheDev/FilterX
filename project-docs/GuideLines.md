# Guidelines for SanityAI Development

## 1. API Design Best Practices

### RESTful Design

- Use standard HTTP methods: **POST** for `/filter` (content moderation), **GET** for `/admin/stats` (admin metrics), **GET** for `/v1/apikey` (API key management).
- Structure endpoints logically: use `/v1/filter` for versioning and `/admin/stats` for restricted access.
- Return consistent JSON responses with clear fields: `blocked`, `reason`, `flags`, `filteredMessage`.
- Use meaningful status codes: 200 (success), 400 (bad input), 401 (unauthorized), 429 (rate limit exceeded).

### Clear Input/Output

- Define a strict request schema:
  - `text` (string)
  - `image` (base64 string, optional)
  - `config` (object with options such as `allowAbuse`, `allowPhone`, `allowEmail`, `returnFilteredMessage`)
  - `oldMessages` (array of previous messages, optional, max 15 items)
- Ensure responses are predictable: always include `blocked`, `reason`, `flags` and conditionally include `filteredMessage`.
- Provide human-readable error messages (e.g., "Invalid API key" instead of cryptic codes).

### Versioning

- Start with `/v1/` to support future changes without breaking existing integrations.
- Document the deprecation policy for each version.

### Documentation

- Create comprehensive documentation including:
  - Quickstart guide (how to make a `/filter` request)
  - API reference (endpoints, schemas, errors)
  - Examples (e.g., chat app integration with filtered messages)
  - FAQ (e.g., "How does filteredMessage work?")
  - Guidance on using previous messages for context
- Use OpenAPI/Swagger for interactive API documentation.
- Include SDKs (JavaScript, Python) for easier integration.

### Error Handling

- Standardize errors: e.g., `{ "error": "Invalid input", "details": "Text field missing" }`.
- Handle edge cases such as missing fields, oversized images, and invalid configs.
- Avoid exposing internal details (e.g., database errors) in responses.
- Validate `oldMessages` array size and return proper error if exceeding limit (15 items).

### Configurability

- Allow developers to customize moderation via the config options (e.g., `allowAbuse`, `returnFilteredMessage`).
- Support extended flags such as **allowPhysicalInformation** and **allowSocialInformation**, as well as any custom flags needed.
- Support future extensibility (e.g., adding new flags like `allowProfanity`).

### API Key Management

- Implement IP-based API key generation at `/v1/apikey`.
- Ensure one API key per IP address to simplify user management.
- Apply rate limiting to API key requests to prevent abuse.
- Return existing API key if the IP already has one assigned.

## 2. Scalability Practices

### Stateless Architecture

- Design the API to be stateless: no session data stored on the server.
- Store persistent data (API keys) in PostgreSQL (Neon) and transient data (stats, caches) in Redis (Upstash).
- This architecture allows for future horizontal scaling if Render's free tier is upgraded.

### Database Scalability

- Use Neon's serverless PostgreSQL, which auto-scales queries within free limits (e.g., 3 GB storage, 500 compute hours).
- Optimize database access: index `api_keys.key` and `api_keys.ip` for fast lookups and use connection pooling to reduce overhead.
- Minimize database hits by caching frequent queries (e.g., API key validation) in Redis.

### Redis Efficiency

- Leverage Upstash's free tier (512 MB, 10,000 commands/day) for stats and caching.
- Use batch commands (e.g., Redis MULTI) to reduce round-trips during stats logging.
- Set TTLs (e.g., 30 days) for stats to manage memory within free limits.
- Implement efficient caching with appropriate TTLs for moderation responses.

### Load Distribution

- Optimize Node.js/Bun's async event loop within Render's single-instance free tier to manage concurrency.
- For future upgrades, consider Render's auto-scaling or a load balancer (e.g., Cloudflare free tier) to distribute traffic.
- Queue AI calls (Akash Chat API/MoonDream) if they become a bottleneck and process them asynchronously to avoid blocking.

### Rate Limiting

- Enforce per-user rate limits (e.g., **30 requests per minute per API key**) using Redis to track counts.
- Scale limits dynamically for enterprise users if needed (e.g., 10,000 per hour).
- Return 429 errors with a `Retry-After` header to inform clients when to retry.
- Apply rate limiting to the `/v1/apikey` endpoint to prevent abuse.

### Monitoring and Alerts

- Use Render's built-in logs to monitor request volume and errors.
- Check Upstash's dashboard for Redis usage (commands, memory usage).
- Set manual alerts (e.g., email notifications on high error rates) since advanced monitoring might not be available on the free tier.
- Plan for Prometheus/Grafana if upgrading to a paid tier for real-time metrics.

### Content Delivery

- Cache static assets (e.g., API docs) via Cloudflare's free tier (if added later) to reduce load on Render.
- Cache AI and regex results in Redis to avoid redundant processing for identical inputs.
- Implement a robust hashing algorithm for cache keys that accounts for all relevant input variables.

## 3. Best Coding Practices

### Modular Structure

- Organize code into modules:
  - `routes/` for API endpoints
  - `services/` for regex, AI, and stats logic
  - `models/` for database schemas
  - `middleware/` for authentication and rate limiting
  - `utils/` for helper functions like caching and hashing
- Separate concerns: keep regex logic, AI calls, and stats logging in distinct services.
- Create a dedicated service for API key management.

### Consistent Style

- Use a linter (e.g., ESLint) with a style guide (e.g., Airbnb JavaScript Style Guide).
- Enforce naming conventions: camelCase for variables, PascalCase for classes.
- Write clear comments for complex logic (e.g., filtered message generation, caching strategies).

### Error Handling

- Centralize error handling in middleware to catch and format errors consistently.
- Log errors (to Render logs, not Redis) for debugging without exposing details to clients.
- Handle edge cases (e.g., Akash Chat API downtime) with appropriate fallbacks (e.g., regex-only mode).
- Implement graceful degradation when services are unavailable.

### Testing

- Write unit tests for regex patterns, filtered message logic, caching, and stats calculations (using Jest).
- Create integration tests for end-to-end flows (e.g., input → regex → AI → output).
- Test IP-based API key generation and retrieval thoroughly.
- Perform load tests (e.g., with Artillery) to simulate realistic API usage within Render's limits.
- Use CI/CD (e.g., GitHub Actions) to run tests on every commit.

### Version Control

- Use Git with clear commit messages (e.g., "Add filteredMessage feature to /filter").
- Follow a branching strategy: main for production, develop for integration, and feature branches for new work.
- Tag releases (e.g., v1.0.0) for proper versioning.

### Dependency Management

- Keep dependencies minimal to reduce the attack surface and bundle size.
- Regularly update packages using `npm update` or `bun update` and audit for vulnerabilities.
- Pin package versions in `package.json` to avoid breaking changes.

### Logging

- Log requests and errors (using tools like morgan) to Render's logs, excluding sensitive data (e.g., API keys).
- Use structured logging (e.g., JSON format) for easier parsing if adding monitoring later.
- Rotate logs to stay within Render's free-tier storage limits.

## 4. Best Logic Practices

### Regex Filtering

- Maintain a dynamic dictionary of patterns for different categories:
  - Phone numbers (e.g., `\b\d{10}\b`)
  - Abusive language (e.g., `\b(idiot|jerk)\b`)
  - Email addresses (e.g., `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b`)
  - Physical information (addresses, credit card numbers, CVV codes)
  - Social information (Instagram IDs, other social handles)
- Compile regex patterns once at startup to avoid repeated overhead.
- Test patterns for accuracy and performance to prevent slow matches (e.g., catastrophic backtracking).
- Allow extensibility to add new patterns without changing code.

### Filtered Message Generation

- Process text sequentially: first match phone numbers, emails, then abusive words.
- Perform a single pass to replace matches with placeholders like "[FILTERED]" or "\*\*\*\*" based on flags.
- Cache filtered results in Redis for identical inputs to reduce processing.
- Validate output to ensure the filtered text is safe while preserving sentence structure.
- Support customization of the filtered text marker in future versions.

### Message History Processing

- Accept up to 15 previous messages in the `oldMessages` array.
- Validate array length and return a 400 error if exceeding the limit.
- Process message history to detect sequential attempts to share restricted content.
- Pass relevant context to the AI for improved moderation decisions.
- Optimize processing to avoid performance degradation with large message histories.

### Response Caching

- Create a deterministic hash function for request content to use as cache keys.
- Include all relevant variables in the hash (text, config options, image hash if present).
- Store responses in Redis with appropriate TTLs.
- Check cache before processing new requests to improve performance.
- Update statistics even when returning cached responses.
- Implement cache invalidation strategies for updates to moderation rules.

### AI Integration

- Call Akash Chat API only if the regex check passes to minimize API usage.
- Format message history appropriately for context-aware analysis.
- Integrate MoonDream 2B for image moderation, checking for the same content types as text.
- Handle AI failures gracefully (e.g., timeouts, rate limits) with appropriate fallbacks.
- Parse AI responses consistently, mapping flags (e.g., `abuse: true`) and reason fields.
- Optimize payloads by sending only necessary data (e.g., trimmed text, resized images).

### Stats Tracking

- Increment Redis counters atomically for requests, successes, blocks, and flagged items.
- Track cache hit rates separately to measure efficiency.
- Aggregate statistics (e.g., success rates) on-demand in `/admin/stats` to reduce Redis writes.
- Store time-series data (e.g., daily requests) with TTLs to manage Upstash limits.
- Validate that aggregate stats (sum of successes and blocks) equal total requests.

### Configurability

- Validate config fields (e.g., `allowAbuse`, `returnFilteredMessage`) against a strict schema at request start.
- Check `oldMessages` array length and format.
- Provide sensible defaults (e.g., `allowAbuse: false`).
- Log invalid configurations as errors without blocking the request.

### API Key Management

- Generate random, secure API keys using a cryptographically secure method.
- Associate each API key with the requester's IP address in the database.
- Look up existing API keys by IP address before creating new ones.
- Implement appropriate caching for API key lookups to reduce database load.
- Apply rate limiting to prevent abuse of the key generation endpoint.

### Extensibility

- Design logic to support new flags (e.g., `allowProfanity`) by updating the regex dictionary and corresponding flag logic.
- Allow for multi-language moderation by extending regex/AI support.
- Plan for new AI models (e.g., replacing Akash Chat API) with minimal code changes.

## 5. API Security Practices

### Authentication

- Require API keys for all requests, verified against PostgreSQL (Neon) using Drizzle ORM.
- Store keys hashed (e.g., with bcrypt) to prevent exposure in the event of a compromise.
- Allow key revocation and rotation via a `/keys/revoke` endpoint.
- Use a separate admin token for `/admin/stats`, stored securely in Render's environment variables.
- Secure the IP-based API key generation system against spoofing attacks.

### Rate Limiting

- Enforce per-user rate limits (e.g., **30 requests per minute per API key**) using Redis counters.
- Exempt admin requests from rate limits or apply a higher threshold (e.g., 10,000 requests per hour).
- Return 429 status codes with a `Retry-After` header to inform clients when to retry.
- Apply appropriate rate limits to the `/v1/apikey` endpoint to prevent abuse.

### HTTPS

- Enforce HTTPS via Render's free SSL certificate for all requests.
- Redirect HTTP to HTTPS to ensure encryption.
- Use strong TLS ciphers and disable outdated protocols (e.g., TLS 1.0).

### Input Validation

- Validate request bodies against a strict schema (e.g., `text` must be a string, `config` an object).
- Ensure `oldMessages` is an array with maximum 15 items.
- Sanitize inputs to prevent injection attacks (SQL, XSS) using libraries such as express-validator.
- Limit image sizes (e.g., 10 MB) to prevent denial-of-service (DoS) attacks.
- Reject malformed JSON with a 400 error code.

### CORS

- Restrict CORS to trusted origins (e.g., specific developer domains) to prevent unauthorized access.
- Avoid using wildcard (`*`) in production CORS policies.
- Include CORS headers only for authenticated requests.

### Secure Headers

- Use middleware (e.g., Helmet) to set headers such as:
  - `X-Content-Type-Options: nosniff` (prevent MIME sniffing)
  - `X-Frame-Options: DENY` (prevent clickjacking)
  - `Content-Security-Policy` to restrict external scripts
- Remove server version headers to limit information leakage.

### SQL Injection Prevention

- Use Drizzle ORM's parameterized queries for all PostgreSQL access.
- Avoid dynamic SQL concatenation.
- Test queries against injection vulnerabilities regularly during security audits.

### Data Privacy

- Do not store user-submitted content (text, images) beyond the processing stage.
- Log only metadata (e.g., request timestamp, flags) for stats without including sensitive data.
- Ensure GDPR/CCPA compliance by not retaining personally identifiable information (PII).

### DoS Protection

- Limit request sizes (e.g., 10 MB for images) to prevent resource exhaustion.
- Implement rate limiting to mitigate brute-force attacks.
- Monitor Render logs for unusual traffic spikes.
- Implement proper cache management to prevent cache poisoning attacks.

### Dependency Security

- Regularly scan dependencies for vulnerabilities (using appropriate tools for Bun/Node.js).
- Update packages promptly while testing for breaking changes.
- Remove unused or bloated dependencies to minimize the attack surface.

### Logging Security

- Exclude sensitive information (e.g., API keys, user content) from logs.
- Store logs in Render's ephemeral storage and rotate them to stay within limits.
- Audit logs periodically to detect any unauthorized access attempts.

## 6. Performance Optimization Practices

### Caching

- Cache regex patterns in memory at startup and persist critical patterns in Redis.
- Cache AI responses for identical inputs in Redis with appropriate TTLs.
- Cache API key validations in Redis (e.g., for 10 minutes) to reduce PostgreSQL queries.
- Implement an efficient hashing mechanism for determining cache keys.
- Update stats accurately even when serving cached responses.

### Asynchronous Processing

- Use Bun/Node.js's async/await for non-blocking operations (regex checks, AI calls, database queries).
- Parallelize tasks (e.g., regex check and image resizing) where possible.
- Queue AI calls if API latency is high, responding immediately with a webhook later.
- Process message history efficiently without blocking the main execution path.

### Compression

- Compress JSON responses (e.g., using gzip) to reduce bandwidth usage.
- Resize images before sending them to MoonDream 2B to minimize payload sizes.
- Evaluate the compression impact to ensure CPU overhead remains acceptable.

### Database Optimization

- Use connection pooling with Neon to reuse PostgreSQL connections.
- Index the `ip` field in the `api_keys` table for fast IP-based lookups.
- Batch stats writes to Redis to reduce the number of round-trips.
- Index `api_keys.key` and use targeted queries (e.g., `SELECT key, isActive`) for efficiency.

### AI Efficiency

- Minimize API calls by first blocking obvious violations using regex.
- Send only necessary data (e.g., trimmed text, downscaled images) to the AI.
- Handle AI rate limits with retries and exponential backoff.
- Optimize message history formatting for AI analysis.

### Request Optimization

- Limit request parsing to the essential fields (e.g., `text`, `image`, `config`, `oldMessages`).
- Use streaming for large image uploads to avoid excessive memory usage.
- Return minimal response payloads (e.g., omit `filteredMessage` if not requested).

### Monitoring Performance

- Track latency values in Redis (e.g., average, P95) via `/admin/stats`.
- Monitor cache hit rates to evaluate caching effectiveness.
- Log slow requests (e.g., those taking >500ms) in Render logs for further analysis.
- Continuously optimize identified bottlenecks, such as slow regex patterns, based on stats.

## 7. Additional Market-Ready Considerations

### Developer Experience

- Provide SDKs (JavaScript, Python) to simplify API integration.
- Create clear documentation for the IP-based API key system.
- Offer examples of how to use message history context effectively.
- Include code samples for common use cases (e.g., a chat app with filtered messages).

### Compliance

- Ensure GDPR/CCPA compliance by not storing user content beyond processing.
- Document privacy practices publicly (e.g., on a privacy policy page).
- Support enterprise users with audit logs stored in PostgreSQL if needed.

### Monetization Readiness

- Plan for a freemium model (e.g., free tier with 30 requests per minute, plus a paid tier with higher limits and premium support).
- Track usage statistics to identify high-value users for potential upselling.
- Offer a `/billing` endpoint for future subscription management.

### Community Engagement

- Create a GitHub repository for bug reports and feature requests.
- Share updates on social media (e.g., "SanityAI now supports filtered messages!").
- Engage developers with tutorials (e.g., "Build a Safe Chat App with SanityAI").

### Continuous Improvement

- Collect feedback via a `/feedback` endpoint or GitHub issues.
- Prioritize new features based on user demand (e.g., multi-language support).
- Release updates quarterly with annotated changelogs (e.g., "v1.1: Added filteredMessage").

## Conclusion

These guidelines ensure SanityAI is a market-ready, secure, scalable, and high-performance API. By adhering to RESTful design principles, implementing robust security measures (IP-based API keys, rate limiting, HTTPS), optimizing scalability within free-tier limits (Render, Neon, Upstash), and applying best practices in coding and logic, SanityAI is positioned as a trusted, professional solution for content moderation in modern applications.
