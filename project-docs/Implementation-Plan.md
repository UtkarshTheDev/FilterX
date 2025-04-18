# 50-Step Implementation Plan for SanityAI

This plan details the step-by-step approach to building SanityAI. It now includes support for extended moderation flags (e.g., **allowPhysicalInformation**, **allowSocialInformation**) and updates the rate limit to **30 requests per minute per API key**. Each step is marked with a checkbox so the team can track progress.

---

## Phase 1: Planning and Setup (Steps 1–8)

### 1. Define Project Requirements

- [x] **Finalize features:**
  - AI moderation using Akash Chat API (text) and MoonDream 2B (images)
  - Regex filtering for detecting patterns (phone numbers, emails, abusive words)
  - Filtered message generation (filtered text with "FILTERED")
  - Image scanning for NSFW or identifiable content
  - Configurable rules with standard flags plus **extended flags** (e.g., `allowPhysicalInformation`, `allowSocialInformation`)
  - Stats tracking and admin stats access
  - Support for message history context (up to 15 previous messages)
- [x] **Specify inputs and outputs:**
  - **Inputs:** `text` (string), `image` (base64 string, optional), `config` (object with options), `oldMessages` (array of previous messages, optional, max 15)
  - **Outputs:** JSON response including `blocked`, `reason`, `flags`, and optionally `filteredMessage`
- [x] **Document constraints:**
  - Use free-tier services (Render, Neon, Upstash)
  - Zero cost deployment
  - Express.js backend with Node.js/Bun
- [x] **Create a project brief** summarizing overall goals and scope

### 2. Design API Specification

- [x] **Create an OpenAPI/Swagger document** for core endpoints:
  - `/v1/filter` (POST)
  - `/admin/stats` (GET)
  - `/v1/apikey` (GET) - for obtaining an API key based on IP
- [x] **Define request schemas:**
  - Include config options such as `allowAbuse`, `allowPhone`, `allowEmail`, `returnFilteredMessage` plus extended flags
  - Add `oldMessages` field for context (array, max 15 items)
- [x] **Define response schemas:**
  - Must list `blocked`, `reason`, `flags`, and optionally `filteredMessage`
- [x] **Specify error codes:**
  - 400 (bad input), 401 (unauthorized), 429 (rate limit exceeded)
  - **Update rate limits** to 30 requests per minute per API key
- [x] **Include webhook support** for asynchronous notifications

### 3. Choose Tech Stack

- [x] **Confirm tools and services:**
  - **Backend:** Node.js/Express.js with Bun runtime
  - **Database:** PostgreSQL on Neon (using Drizzle ORM)
  - **Stats & Caching:** Redis on Upstash
  - **AI:** Akash Chat API for text, MoonDream 2B for images
  - **Deployment:** Render
- [x] **Select testing tools:** Jest for unit/integration tests; Artillery for load tests
- [x] **Choose security libraries** for rate limiting, input validation, etc.

### 4. Set Up Version Control

- [ ] **Initialize a Git repository** (e.g., on GitHub)
- [ ] **Configure branches:**
  - `main` for production
  - `develop` for integration
  - Feature branches for individual tasks
- [ ] **Establish commit message standards** (e.g., "feat: add filteredMessage") and set up a `.gitignore` for sensitive files (like `.env`)

### 5. Create Project Structure

- [ ] **Plan directory layout:**
  - `routes/` for API endpoints
  - `services/` for core logic (regex filtering, AI integration, stats tracking)
  - `middleware/` for authentication, rate limiting, error handling
  - `models/` for database schemas
  - `tests/` for unit and integration tests
- [ ] **Include configuration files** for environment variables and regex dictionary
- [ ] **Ensure modularity** for maintainability and future extensibility

### 6. Set Up Render Account

- [ ] **Create a free-tier Render account** (750 hours/month, single instance)
- [ ] **Configure a web service** for the Express.js app with auto-SSL
- [ ] **Set up environment variables** for sensitive data (Neon URL, Upstash URL, admin token)
- [ ] **Test connectivity** with a dummy "Hello World" API endpoint

### 7. Set Up Neon Database

- [ ] **Create a free-tier PostgreSQL database** on Neon (3 GB storage, 500 compute hours)
- [ ] **Obtain connection details** for integration with Drizzle ORM
- [ ] **Plan the tables schema:**
  - `api_keys` table: key, userId, createdAt, isActive, ip
  - Additional tables as needed
- [ ] **Test database connectivity** manually

### 8. Set Up Upstash Redis

- [ ] **Create a free-tier Redis instance** on Upstash (512 MB, 10,000 commands/day)
- [ ] **Obtain the connection URL** for stats tracking and caching
- [ ] **Plan Redis keys:**
  - e.g., `stats:requests:total`, `stats:requests:user:<user_id>`, `stats:flags`, `cache:responses:<hash>`
- [ ] **Verify connectivity** using test commands

---

## Phase 2: Core Development (Steps 9–24)

### 9. Set Up Express.js Application

- [ ] **Initialize the Express.js app** with middleware (e.g., JSON parsing, logging)
- [ ] **Configure routes** for `/v1/filter`, `/admin/stats`, and `/v1/apikey`
- [ ] **Add error handling middleware** for standardized JSON responses
- [ ] **Test endpoints locally** with a mock endpoint

### 10. Implement API Key Management

- [ ] **Create endpoint for API key generation** based on IP address
- [ ] **Implement IP-based API key lookup** to ensure one key per user IP
- [ ] **Store API keys in PostgreSQL** with IP address association
- [ ] **Apply rate limiting** to API key requests
- [ ] **Test API key generation and verification**

### 11. Implement Regex Filtering

- [ ] **Create a regex engine** to detect phone numbers, emails, and abusive words
- [ ] **Add patterns for physical information** (addresses, credit card numbers, CVV)
- [ ] **Add patterns for social information** (Instagram IDs, other social handles)
- [ ] **Store patterns in a dynamic dictionary** (JSON file + Redis cache)
- [ ] **Extend support to include flags:**
  - Standard (e.g., allowAbuse) and extended (e.g., **allowPhysicalInformation**, **allowSocialInformation**)
- [ ] **Optimize regex patterns** for performance (avoid catastrophic backtracking)
- [ ] **Enable dictionary updates** without restarting the app

### 12. Develop Filtered Message Logic

- [ ] **Build logic to generate a filtered message** when `returnFilteredMessage` is true
- [ ] **Replace flagged content** (e.g., abusive words, phone numbers) with "[FILTERED]"
- [ ] **Ensure sentence structure is preserved** in the filtered output
- [ ] **Cache identical filtered results** in Redis
- [ ] **Add support for customizing the filtered text marker**

### 13. Implement Response Caching

- [ ] **Create a hash function** for content to serve as cache key
- [ ] **Cache filtered responses in Redis** with appropriate TTL
- [ ] **Check cache before processing** new requests
- [ ] **Update stats even for cached responses**
- [ ] **Implement cache invalidation** strategies

### 14. Integrate Akash Chat API

- [ ] **Connect to Akash Chat API** for deep text analysis
- [ ] **Route content to AI processing** only if regex filtering passes
- [ ] **Implement message history context** (up to 15 previous messages)
- [ ] **Map AI responses** to flags (including the extended ones) and generate clear reasons
- [ ] **Handle AI failures** (timeouts, rate limits) using fallback strategies (e.g., conservative blocking)

### 15. Integrate MoonDream 2B for Images

- [ ] **Process base64-encoded images** from the `/filter` request
- [ ] **Connect to MoonDream 2B API** for image analysis
- [ ] **Resize images** to optimize payload before sending to MoonDream
- [ ] **Flag NSFW or identifiable content** based on AI analysis
- [ ] **Reject oversized images** (>10 MB) with a 400 error

### 16. Build Configurable Behavior

- [ ] **Validate config fields** (e.g., `allowAbuse`, `allowPhone`, `allowEmail`, `returnFilteredMessage`) using a defined schema
- [ ] **Apply rules in regex and AI logic,** incorporating both standard and extended flags
- [ ] **Set sensible default configurations** (e.g., `allowAbuse: false`)
- [ ] **Log any invalid configuration** for debugging

### 17. Develop Explainable AI

- [ ] **Generate human-readable reason messages** (e.g., "Phone number and abusive language detected")
- [ ] **Combine regex and AI findings** to produce a comprehensive explanation
- [ ] **Ensure explanation consistency** across different content types
- [ ] **Include contextual awareness** from previous messages in reasoning

### 18. Set Up PostgreSQL with Drizzle ORM

- [ ] **Configure Drizzle ORM** to connect to the Neon PostgreSQL instance
- [ ] **Create database schema** with appropriate tables and indexes
- [ ] **Test table creation** and run basic queries
- [ ] **Implement data access functions** for API key management

### 19. Implement API Key Authentication

- [ ] **Build middleware to validate API keys** against the PostgreSQL database
- [ ] **Hash API keys** before storing them for enhanced security
- [ ] **Return a 401 error** for invalid or inactive API keys
- [ ] **Attach the corresponding userId** to the request for stats tracking

### 20. Implement Rate Limiting

- [ ] **Set up per-user rate limits** at **30 requests per minute per API key** using Redis counters
- [ ] **Implement a sliding window algorithm** for burst handling
- [ ] **Return a 429 error** with a `Retry-After` header when limits are exceeded
- [ ] **Exempt admin requests** or apply a higher rate if needed

### 21. Set Up Stats Tracking

- [ ] **Log each request to Redis**: total count, per-user count, successes, blocked requests, flags triggered, latency, and daily trends
- [ ] **Use atomic increments** for statistical accuracy
- [ ] **Set TTLs (e.g., 30 days) for stats keys** to manage memory usage in Upstash
- [ ] **Ensure consistency** (e.g., success + blocked = total requests)
- [ ] **Track cache hit rates** separately

### 22. Build Admin Stats Endpoint

- [ ] **Create the `/admin/stats` endpoint** to return aggregated metrics:
  - Total requests, success rate, blocked requests, flag details, latency stats, and daily trends
- [ ] **Secure the endpoint** with an admin token stored in environment variables
- [ ] **Aggregate stats on-demand** for minimal Redis load
- [ ] **Test the endpoint's output** for accuracy

### 23. Implement Error Handling

- [ ] **Centralize all error handling** in middleware to provide consistent JSON responses
- [ ] **Handle common edge cases:** missing fields, oversized images, AI failures
- [ ] **Log errors** to Render's logs without revealing sensitive details
- [ ] **Implement graceful degradation** for service disruptions

### 24. Optimize Performance

- [ ] **Enable response compression** (e.g., gzip) to reduce bandwidth usage
- [ ] **Parallelize independent operations** like regex filtering and AI calls
- [ ] **Resize images prior to sending** them to AI for faster processing
- [ ] **Monitor latency** via `/admin/stats` and tune optimizations as needed
- [ ] **Optimize cache usage** for high-traffic patterns

---

## Phase 3: Additional Features and Enhancements (Steps 25–32)

### 25. Add Input Validation

- [ ] **Validate request bodies** match expected schemas (e.g., `text` must be a string, `config` an object)
- [ ] **Ensure oldMessages array does not exceed 15 items**
- [ ] **Sanitize all inputs** to prevent XSS, SQL injection, and other attacks
- [ ] **Reject malformed requests** with clear 400 errors
- [ ] **Test validation** with various edge cases

### 26. Implement Secure Headers

- [ ] **Add HTTP security headers** such as:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
- [ ] **Set a strict Content-Security-Policy** to mitigate XSS risks
- [ ] **Remove server version headers** to limit information leakage
- [ ] **Verify header implementation** with security scanning tools

### 27. Enable CORS

- [ ] **Restrict CORS** to trusted origins (developer domains)
- [ ] **Avoid using wildcards** (\*) in production CORS policies
- [ ] **Include CORS headers only** for authenticated requests
- [ ] **Test cross-origin requests** for proper configuration

### 28. Add Logging

- [ ] **Implement structured logging** (e.g., using morgan) to record requests and errors in JSON format
- [ ] **Exclude sensitive data** (like API keys) from logs
- [ ] **Rotate logs** to comply with Render's free-tier storage limits
- [ ] **Review logs regularly** for debugging and performance analysis

### 29. Support Multi-Language Moderation

- [ ] **Extend the regex dictionary** to include abusive words in multiple languages (e.g., Spanish, French)
- [ ] **Plan for AI models** that support multi-language processing
- [ ] **Test moderated output** for various languages to ensure accuracy
- [ ] **Consider a config option** to specify the language for moderation

### 30. Plan for Extensibility

- [ ] **Design system architecture** to easily incorporate new flags (e.g., `allowProfanity`)
- [ ] **Ensure the AI integration is modular** to support future model changes
- [ ] **Document procedures** for adding new patterns, rules, or flags
- [ ] **Test the addition** of a mock flag to confirm extensibility

### 31. Create Developer SDKs

- [ ] **Develop JavaScript and Python SDKs** for interacting with `/filter`, `/admin/stats`, and `/v1/apikey`
- [ ] **Include helper functions** for sending requests and handling responses
- [ ] **Package and publish the SDKs** on npm and PyPI complete with documentation
- [ ] **Validate SDK functionality** with a sample app

### 32. Build Developer Documentation

- [ ] **Create documentation** for:
  - API endpoints and their usage
  - Config options and flags
  - Examples of integration with AI chat applications
  - Best practices for using the API
- [ ] **Document how to use previous messages** for context-aware moderation
- [ ] **Prepare specification for a developer portal**
- [ ] **Include dashboard requirements** for future frontend development

---

## Phase 4: Testing and Optimization (Steps 33–40)

### 33. Write Unit Tests

- [ ] **Develop unit tests** for:
  - Regex filtering patterns
  - Filtered message generation logic
  - AI response parsing
  - Stats calculations
  - API key management
  - Caching logic
- [ ] **Cover edge cases** (empty text, invalid images, etc.)
- [ ] **Aim for >80% code coverage**
- [ ] **Integrate unit tests into the CI/CD pipeline**

### 34. Write Integration Tests

- [ ] **Create end-to-end tests** covering the flow from input → regex → AI → output
- [ ] **Test context-aware moderation** with previous messages
- [ ] **Verify JSON response schema and error handling**
- [ ] **Simulate AI API failures** to test fallback mechanisms
- [ ] **Automate integration tests** within CI/CD

### 35. Perform Load Testing

- [ ] **Simulate controlled load** (e.g., 1000 requests/hour) using tools like Artillery
- [ ] **Record response latency, error rates, and resource usage**
- [ ] **Test cache effectiveness** under load
- [ ] **Identify and resolve bottlenecks**
- [ ] **Document performance benchmarks**

### 36. Conduct Security Audit

- [ ] **Perform a security audit** focused on OWASP Top 10 vulnerabilities
- [ ] **Verify rate limiting, API key security, and input validation**
- [ ] **Test IP-based API key generation** for security issues
- [ ] **Use tools like OWASP ZAP or manual penetration testing**
- [ ] **Address all security issues** found before launch

### 37. Optimize Regex Performance

- [ ] **Profile regex patterns** to detect slowdowns or excessive backtracking
- [ ] **Test patterns on large inputs** to ensure stability and speed
- [ ] **Cache compiled regex patterns** to decrease runtime overhead
- [ ] **Validate performance improvements** through benchmarks

### 38. Optimize AI Calls

- [ ] **Minimize API calls** by handling obvious violations with regex filtering
- [ ] **Implement retries with exponential backoff** for AI calls experiencing timeouts
- [ ] **Cache AI responses** for identical inputs to reduce redundancy
- [ ] **Optimize message history context** for efficient processing
- [ ] **Continuously monitor AI response times** via stats

### 39. Optimize Database Queries

- [ ] **Ensure use of parameterized queries** in all database operations (Drizzle ORM)
- [ ] **Optimize API key lookups** with proper indexing and caching
- [ ] **Batch Redis stats writes** where possible
- [ ] **Test query performance** under concurrent loads

### 40. Finalize Performance Metrics

- [ ] **Set performance targets:**
  - Average latency: <200ms
  - P95 latency: <500ms
  - Cache hit rate: >50%
- [ ] **Monitor cache hit rates, Redis command usage, and Render CPU/memory usage**
- [ ] **Tune caching and compression settings** based on monitoring data
- [ ] **Document the final performance report**

---

## Phase 5: Deployment and Launch (Steps 41–46)

### 41. Configure CI/CD Pipeline

- [ ] **Set up GitHub Actions** to run tests, linting, and deploy on main branch pushes
- [ ] **Include rollback steps** in case of deployment failures
- [ ] **Test the CI/CD pipeline** with dummy commits
- [ ] **Ensure environment variables and secrets** are securely managed

### 42. Deploy to Render

- [ ] **Deploy the Express.js application** to Render's free-tier service
- [ ] **Configure auto-SSL and environment variables** (Neon URL, Upstash URL, admin token)
- [ ] **Verify deployment** by sending test requests to `/v1/filter` and `/v1/apikey`
- [ ] **Monitor initial logs** for any errors

### 43. Verify Integrations

- [ ] **Test connectivity:**
  - Verify Neon PostgreSQL connectivity and API key lookups
  - Confirm Upstash Redis caching and stats logging
  - Validate Akash Chat API and MoonDream responses
- [ ] **Ensure all components work cohesively**

### 44. Launch Public Beta

- [ ] **Announce the public beta** via social media and developer forums
- [ ] **Provide beta access** via the `/v1/apikey` endpoint
- [ ] **Establish a feedback mechanism** (e.g., GitHub issues, `/feedback` endpoint)
- [ ] **Monitor beta usage** using the `/admin/stats` endpoint

### 45. Publish Documentation

- [ ] **Deploy the developer documentation**
- [ ] **Share documentation links** on social media, forums, and in the repository README
- [ ] **Update documentation** based on beta feedback
- [ ] **Verify that all examples and guides** are correct and functional

### 46. Set Up Monitoring

- [ ] **Enable Render logging** for real-time error and latency tracking
- [ ] **Utilize Upstash's dashboard** to monitor Redis usage
- [ ] **Regularly review `/admin/stats`** for performance trends and anomalies
- [ ] **Document monitoring procedures** for ongoing operations

---

## Phase 6: Post-Launch Maintenance (Steps 47–50)

### 47. Address Beta Feedback

- [ ] **Collect feedback** from beta users
- [ ] **Prioritize bug fixes and feature requests**
- [ ] **Release patches** (e.g., version 1.0.1) with complete changelogs
- [ ] **Communicate updates** via social media and the Developer Portal

### 48. Maintain Dependencies

- [ ] **Update Node.js/Bun packages monthly**; run vulnerability scans
- [ ] **Test dependency upgrades** in a staging environment before production
- [ ] **Document dependency versions** in `package.json`
- [ ] **Monitor changes** in the AI API versions

### 49. Plan Feature Updates

- [ ] **Schedule quarterly releases** (e.g., v1.1 with multi-language support, custom regex rules)
- [ ] **Develop new features** based on user feedback and usage stats
- [ ] **Thoroughly test new features** before inclusion
- [ ] **Announce feature updates** to the community

### 50. Ensure Compliance and Scalability

- [ ] **Verify GDPR/CCPA compliance:**
  - Ensure no persistent storage of user-submitted content
- [ ] **Monitor free-tier limits** for Render, Neon, and Upstash
- [ ] **Plan and document strategies** for upgrading to paid tiers if usage increases
- [ ] **Review compliance and scalability strategies** periodically

---

This detailed plan serves as a roadmap for building, deploying, and maintaining SanityAI with the latest requirements and best practices. Each task is marked with a checkbox to track progress throughout the project lifecycle.
