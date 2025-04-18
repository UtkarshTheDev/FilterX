# 50-Step Implementation Plan for FilterX

This plan details the step-by-step approach to building FilterX. It now includes support for extended moderation flags (e.g., **allowPhysicalInformation**, **allowSocialInformation**) and updates the rate limit to **30 requests per minute per API key**. Each step is marked with a checkbox so the team can track progress.

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

- [x] **Plan directory layout:**
  - `routes/` for API endpoints
  - `services/` for core logic (regex filtering, AI integration, stats tracking)
  - `middleware/` for authentication, rate limiting, error handling
  - `models/` for database schemas
  - `tests/` for unit and integration tests
- [x] **Include configuration files** for environment variables and regex dictionary
- [x] **Ensure modularity** for maintainability and future extensibility

Done. Created a modular project structure with routes, services, middleware, models, and utilities. Set up configuration files including .env example with comprehensive environment variables.

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

## Phase 1 Summary

Phase 1 is partially complete. We've successfully defined project requirements, designed API specifications, chosen our tech stack, and created the project structure. The remaining steps involve setting up the Render account, Neon PostgreSQL database, and Upstash Redis instance with actual credentials and verifying connectivity.

## Phase 2: Core Development (Steps 9–24)

### 9. Set Up Express.js Application

- [x] **Initialize the Express.js app** with middleware (e.g., JSON parsing, logging)
- [x] **Configure routes** for `/v1/filter`, `/admin/stats`, and `/v1/apikey`
- [x] **Add error handling middleware** for standardized JSON responses
- [x] **Test endpoints locally** with a mock endpoint

Done. Implemented the Express.js application with properly configured middleware for error handling, JSON parsing, and security. Created the routes including the filter route handler that processes content moderation requests and applies rate limiting, API key authentication, and validation.

### 10. Implement API Key Management

- [x] **Create endpoint for API key generation** based on IP address
- [x] **Implement IP-based API key lookup** to ensure one key per user IP
- [x] **Store API keys in PostgreSQL** with IP address association
- [x] **Apply rate limiting** to API key requests
- [x] **Test API key generation and verification**

Done. Implemented the API key service to generate and validate API keys based on IP addresses. Set up caching to improve performance and created endpoints for API key management.

### 11. Implement Regex Filtering

- [x] **Create a regex engine** to detect phone numbers, emails, and abusive words
- [x] **Add patterns for physical information** (addresses, credit card numbers, CVV)
- [x] **Add patterns for social information** (Instagram IDs, other social handles)
- [x] **Store patterns in a dynamic dictionary** (JSON file + Redis cache)
- [x] **Extend support to include flags:**
  - Standard (e.g., allowAbuse) and extended (e.g., **allowPhysicalInformation**, **allowSocialInformation**)
- [x] **Optimize regex patterns** for performance (avoid catastrophic backtracking)
- [x] **Enable dictionary updates** without restarting the app

Done. Created a comprehensive regex filtering system with patterns for phone numbers, emails, abusive language, personal information, and social media handles. Implemented a consolidated social media pattern that covers multiple platforms.

### 12. Develop Filtered Message Logic

- [x] **Build logic to generate a filtered message** when `returnFilteredMessage` is true
- [x] **Replace flagged content** (e.g., abusive words, phone numbers) with "[FILTERED]"
- [x] **Ensure sentence structure is preserved** in the filtered output
- [x] **Cache identical filtered results** in Redis
- [x] **Add support for customizing the filtered text marker**

Done. Implemented filtered message generation with support for preserving sentence structure and replacing sensitive content with a customizable marker.

### 13. Implement Response Caching

- [x] **Create a hash function** for content to serve as cache key
- [x] **Cache filtered responses in Redis** with appropriate TTL
- [x] **Check cache before processing** new requests
- [x] **Update stats even for cached responses**
- [x] **Implement cache invalidation** strategies

Done. Developed a caching system using Redis to improve performance, including hash generation for content and image data, and appropriate TTL settings.

### 14. Integrate Akash Chat API

- [x] **Connect to Akash Chat API** for deep text analysis
- [x] **Route content to AI processing** only if regex filtering passes
- [x] **Implement message history context** (up to 15 previous messages)
- [x] **Map AI responses** to flags (including the extended ones) and generate clear reasons
- [x] **Handle AI failures** (timeouts, rate limits) using fallback strategies (e.g., conservative blocking)

Done. Integrated Akash Chat API for text analysis with full support for message history context and robustly handling API failures.

### 15. Integrate MoonDream 2B for Images

- [x] **Process base64-encoded images** from the `/filter` request
- [x] **Connect to MoonDream 2B API** for image analysis
- [x] **Resize images** to optimize payload before sending to MoonDream
- [x] **Flag NSFW or identifiable content** based on AI analysis
- [x] **Reject oversized images** (>10 MB) with a 400 error

Done. Integrated MoonDream 2B for image analysis with image optimization and appropriate error handling.

### 16. Build Configurable Behavior

- [x] **Validate config fields** (e.g., `allowAbuse`, `allowPhone`, `allowEmail`, `returnFilteredMessage`) using a defined schema
- [x] **Apply rules in regex and AI logic,** incorporating both standard and extended flags
- [x] **Set sensible default configurations** (e.g., `allowAbuse: false`)
- [x] **Log any invalid configuration** for debugging

Done. Implemented configurable behavior with validation of configuration options and sensible defaults for all filter settings.

### 17. Develop Explainable AI

- [x] **Generate human-readable reason messages** (e.g., "Phone number and abusive language detected")
- [x] **Combine regex and AI findings** to produce a comprehensive explanation
- [x] **Ensure explanation consistency** across different content types
- [x] **Include contextual awareness** from previous messages in reasoning

Done. Developed explanation capabilities that provide clear reasons for content blocking with consistent messaging.

### 18. Set Up PostgreSQL with Drizzle ORM

- [x] **Configure Drizzle ORM** to connect to the Neon PostgreSQL instance
- [x] **Create database schema** with appropriate tables and indexes
- [x] **Test table creation** and run basic queries
- [x] **Implement data access functions** for API key management

Done. Set up PostgreSQL database with Drizzle ORM, created schemas for API keys and usage stats, and implemented data access functions.

### 19. Implement API Key Authentication

- [x] **Build middleware to validate API keys** against the PostgreSQL database
- [x] **Hash API keys** before storing them for enhanced security
- [x] **Return a 401 error** for invalid or inactive API keys
- [x] **Attach the corresponding userId** to the request for stats tracking

Done. Implemented robust API key authentication middleware that validates keys and attaches user information to requests.

### 20. Implement Rate Limiting

- [x] **Set up per-user rate limits** at **30 requests per minute per API key** using Redis counters
- [x] **Implement a sliding window algorithm** for burst handling
- [x] **Return a 429 error** with a `Retry-After` header when limits are exceeded
- [x] **Exempt admin requests** or apply a higher rate if needed

Done. Implemented rate limiting with Redis for both global and API-specific rate limits using a sliding window algorithm.

### 21. Set Up Stats Tracking

- [x] **Log each request to Redis**: total count, per-user count, successes, blocked requests, flags triggered, latency, and daily trends
- [x] **Use atomic increments** for statistical accuracy
- [x] **Set TTLs (e.g., 30 days) for stats keys** to manage memory usage in Upstash
- [x] **Ensure consistency** (e.g., success + blocked = total requests)
- [x] **Track cache hit rates** separately

Done. Created a stats tracking system that records detailed metrics about filter usage while ensuring statistical accuracy.

### 22. Build Admin Stats Endpoint

- [x] **Create the `/admin/stats` endpoint** to return aggregated metrics:
  - Total requests, success rate, blocked requests, flag details, latency stats, and daily trends
- [x] **Secure the endpoint** with an admin token stored in environment variables
- [x] **Aggregate stats on-demand** for minimal Redis load
- [x] **Test the endpoint's output** for accuracy

Done. Built an admin stats endpoint that provides comprehensive statistics about system usage and performance.

### 23. Implement Error Handling

- [x] **Centralize all error handling** in middleware to provide consistent JSON responses
- [x] **Handle common edge cases:** missing fields, oversized images, AI failures
- [x] **Log errors** to Render's logs without revealing sensitive details
- [x] **Implement graceful degradation** for service disruptions

Done. Created a comprehensive error handling system with custom AppError class and centralized error handling middleware.

### 24. Optimize Performance

- [ ] **Enable response compression** (e.g., gzip) to reduce bandwidth usage
- [ ] **Parallelize independent operations** like regex filtering and AI calls
- [ ] **Resize images prior to sending** them to AI for faster processing
- [ ] **Monitor latency** via `/admin/stats` and tune optimizations as needed
- [ ] **Optimize cache usage** for high-traffic patterns

---

## Phase 2 Summary

Phase 2 is nearly complete. We've successfully implemented the Express.js application, API key management, regex filtering, response caching, AI integration for both text and images, configurable behavior, error handling, and stats tracking. The only remaining task is optimizing performance, which can be done after the initial deployment.

## Phase 3: Additional Features and Enhancements (Steps 25–32)

### 25. Add Input Validation

- [x] **Validate request bodies** match expected schemas (e.g., `text` must be a string, `config` an object)
- [x] **Ensure oldMessages array does not exceed 15 items**
- [x] **Sanitize all inputs** to prevent XSS, SQL injection, and other attacks
- [x] **Reject malformed requests** with clear 400 errors
- [x] **Test validation** with various edge cases

Done. Implemented input validation using express-validator and custom validation logic for all endpoints.

### 26. Implement Secure Headers

- [x] **Add HTTP security headers** such as:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
- [x] **Set a strict Content-Security-Policy** to mitigate XSS risks
- [x] **Remove server version headers** to limit information leakage
- [x] **Verify header implementation** with security scanning tools

Done. Added security headers using the helmet middleware to enhance application security.

### 27. Enable CORS

- [x] **Restrict CORS** to trusted origins (developer domains)
- [x] **Avoid using wildcards** (\*) in production CORS policies
- [x] **Include CORS headers only** for authenticated requests
- [x] **Test cross-origin requests** for proper configuration

Done. Implemented CORS with configurable origins and appropriate security restrictions.

### 28. Add Logging

- [x] **Implement structured logging** (e.g., using morgan) to record requests and errors in JSON format
- [x] **Exclude sensitive data** (like API keys) from logs
- [x] **Rotate logs** to comply with Render's free-tier storage limits
- [x] **Review logs regularly** for debugging and performance analysis

Done. Implemented structured logging using Morgan middleware with appropriate log formatting and sensitive data exclusion.

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

- [x] **Create documentation** for:
  - API endpoints and their usage
  - Config options and flags
  - Examples of integration with AI chat applications
  - Best practices for using the API
- [x] **Document how to use previous messages** for context-aware moderation
- [x] **Prepare specification for a developer portal**
- [x] **Include dashboard requirements** for future frontend development

Done. Created comprehensive API documentation with examples for all endpoints, configuration options, and integration patterns in project-docs/api-docs.md.

---

## Phase 3 Summary

Phase 3 is partially complete. We've implemented input validation, secure headers, CORS configuration, logging, and built developer documentation. The remaining steps include multi-language moderation, extensibility planning, and creating developer SDKs, which can be addressed as the project evolves further.

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

This detailed plan serves as a roadmap for building, deploying, and maintaining FilterX with the latest requirements and best practices. Each task is marked with a checkbox to track progress throughout the project lifecycle.
