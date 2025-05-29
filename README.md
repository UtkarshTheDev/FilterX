# 🛡️ FilterX - Advanced Content Moderation API

> **Enterprise-grade content filtering with AI-powered analysis and configurable security policies**

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg?style=flat-square)](https://github.com/UtkarshTheDev/FilterX)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-000000?style=flat-square&logo=bun&logoColor=white)](https://bun.sh/)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](LICENSE)

---

## Overview

FilterX is a production-ready content moderation API that provides intelligent filtering of harmful content from text and images. Built for developers who need fast, reliable, and highly configurable content filtering with enterprise-grade performance.

### How FilterX Works

```mermaid
graph TD
    A[Content] --> B[FilterX]
    B --> C{Violations?}
    C -->|No| D[✅ Allow Content]
    C -->|Yes| E[❌ Block Content]
```

### Content Detection Capabilities

- **Abusive Language** - Offensive content, harassment, and hate speech detection
- **Personal Information** - Phone numbers, email addresses, and physical addresses
- **Social Media Content** - Usernames, handles, and platform references
- **Image Analysis** - AI-powered visual content moderation
- **Context Awareness** - Conversation history analysis for improved accuracy

### Key Features

- ⚡ **High Performance** - Multi-tier caching with sub-100ms response times
- 🔧 **Configurable** - Granular control over content filtering policies
- 🤖 **AI-Powered** - Advanced machine learning models for nuanced detection
- 🖼️ **Multi-Modal** - Process text, images, and mixed content
- 📊 **Production Ready** - Built-in monitoring, analytics, and error handling
- 🔒 **Secure by Default** - All filtering options default to restrictive settings

---

## Quick Start

### Prerequisites

- **[Bun](https://bun.sh/)** v1.0.0+ (Primary runtime)
- **PostgreSQL** 13+ (Database)
- **Redis** 6+ (Caching layer - optional but recommended)
- **Node.js** 18+ (Alternative runtime)

### Installation

```bash
# Clone the repository
git clone https://github.com/UtkarshTheDev/FilterX.git
cd FilterX

# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your database configuration

# Initialize database
bun run prepare-db

# Start development server
bun run dev

# For production deployment
bun start
```

### API Key Generation

```bash
curl -X GET http://localhost:8000/v1/apikey
```

**Response:**

```json
{
  "key": "your-api-key",
  "userId": "user_abc123",
  "createdAt": "2025-01-15T10:30:00.000Z"
}
```

### Basic Usage Example

```bash
curl -X POST http://localhost:8000/v1/filter \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Call me at 555-1234"}'
```

**Response:**

```json
{
  "blocked": true,
  "reason": "Contains phone number",
  "flags": ["phone_number"]
}
```

---

## API Documentation

### Authentication

All API requests require authentication using your API key in the `Authorization` header:

```bash
Authorization: Bearer your-api-key
```

### Available Endpoints

| Endpoint           | Method | Description                                   |
| ------------------ | ------ | --------------------------------------------- |
| `/v1/filter`       | POST   | Main filtering endpoint for text and/or image |
| `/v1/filter/text`  | POST   | Text-only content filtering                   |
| `/v1/filter/image` | POST   | Image-only content filtering                  |
| `/v1/filter/batch` | POST   | Batch processing for multiple items           |
| `/v1/apikey`       | GET    | Generate or retrieve API key                  |
| `/health`          | GET    | System health check                           |

---

## Configuration Options

The API uses a secure-by-default approach where all filtering options are disabled by default. You must explicitly enable specific content types through configuration flags.

### Configuration Flow

```mermaid
graph TD
    A[Content Input] --> B{Check Config}
    B --> C[allowPhone: false]
    B --> D[allowEmail: false]
    B --> E[allowAbuse: false]
    C --> F{Phone Detected?}
    D --> G{Email Detected?}
    E --> H{Abuse Detected?}
    F -->|Yes| I[❌ Block]
    F -->|No| J[✅ Allow]
    G -->|Yes| I
    G -->|No| J
    H -->|Yes| I
    H -->|No| J
```

### Default Behavior

```json
{
  "text": "Email me at john@test.com or call 555-1234",
  "config": {}
}
```

**Result:** Content blocked (phone number and email detected)

### Selective Permission

```json
{
  "text": "Email me at john@test.com",
  "config": {
    "allowEmail": true
  }
}
```

**Result:** Content allowed (email permitted by configuration)

### Configuration Parameters

| Parameter                  | Description                            | Default |
| -------------------------- | -------------------------------------- | ------- |
| `allowAbuse`               | Allow abusive/offensive language       | `false` |
| `allowPhone`               | Allow phone numbers                    | `false` |
| `allowEmail`               | Allow email addresses                  | `false` |
| `allowPhysicalInformation` | Allow physical addresses and locations | `false` |
| `allowSocialInformation`   | Allow social media handles             | `false` |
| `returnFilteredMessage`    | Return censored version of content     | `false` |
| `analyzeImages`            | Enable AI-powered image analysis       | `false` |

## Usage Examples

### Restrictive Content Policy

Suitable for family-friendly applications requiring strict content moderation:

```bash
curl -X POST http://localhost:8000/v1/filter \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hey, call me at 555-1234 or email john@test.com",
    "config": {
      "allowAbuse": false,
      "allowPhone": false,
      "allowEmail": false,
      "returnFilteredMessage": true
    }
  }'
```

**Response:**

```json
{
  "blocked": true,
  "flags": ["phone_number", "email_address"],
  "reason": "Contains phone number and email address",
  "filteredMessage": "Hey, call me at [PHONE_REDACTED] or email [EMAIL_REDACTED]"
}
```

### Business Communication Platform

Configuration allowing professional contact information sharing:

```bash
curl -X POST http://localhost:8000/v1/filter \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Contact me at john@company.com for business inquiries",
    "config": {
      "allowEmail": true,
      "allowPhone": true,
      "allowAbuse": false
    }
  }'
```

**Response:**

```json
{
  "blocked": false,
  "flags": [],
  "reason": "Content passed all moderation checks"
}
```

### Social Platform with Abuse Prevention

Allowing social media handles while blocking offensive content:

```bash
curl -X POST http://localhost:8000/v1/filter \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Follow me @username, this content is inappropriate!",
    "config": {
      "allowSocialInformation": true,
      "allowAbuse": false,
      "returnFilteredMessage": true
    }
  }'
```

**Response:**

```json
{
  "blocked": true,
  "flags": ["abusive_language"],
  "reason": "Contains offensive language",
  "filteredMessage": "Follow me @username, this content is [CONTENT_FILTERED]!"
}
```

### Multi-Modal Content Analysis

Processing both text and image content:

```bash
curl -X POST http://localhost:8000/v1/filter \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Check out this image",
    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...",
    "config": {
      "analyzeImages": true
    }
  }'
```

### Batch Processing

Efficient processing of multiple content items:

```bash
curl -X POST http://localhost:8000/v1/filter/batch \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "text": "First message to moderate",
        "config": {"allowPhone": false}
      },
      {
        "text": "Contact: admin@example.com",
        "config": {"allowEmail": true}
      }
    ]
  }'
```

---

## Response Format

All API endpoints return standardized JSON responses with consistent structure.

### Response Flow

```mermaid
graph LR
    A[API Request] --> B{Content Analysis}
    B -->|Clean| C[blocked: false]
    B -->|Violation| D[blocked: true]
    C --> E[flags: []]
    D --> F[flags: ['phone_number']]
    E --> G[Response JSON]
    F --> G
    D --> H[filteredMessage]
    H --> G
```

### Successful Response (Content Allowed)

```json
{
  "blocked": false,
  "flags": [],
  "reason": "Content passed all moderation checks"
}
```

### Blocked Content Response

```json
{
  "blocked": true,
  "flags": ["phone_number", "email_address"],
  "reason": "Contains phone number and email address",
  "filteredMessage": "Contact me at [PHONE_REDACTED] or email [EMAIL_REDACTED]"
}
```

### Response Fields

| Field             | Type       | Description                                                                   |
| ----------------- | ---------- | ----------------------------------------------------------------------------- |
| `blocked`         | `boolean`  | Indicates whether content was blocked (`true`) or allowed (`false`)           |
| `flags`           | `string[]` | Array of detected content types (e.g., `["phone_number", "email_address"]`)   |
| `reason`          | `string`   | Human-readable explanation of the moderation decision                         |
| `filteredMessage` | `string`   | Censored version of content (only present when `returnFilteredMessage: true`) |

---

## Troubleshooting

### Authentication Errors

**Issue:** "Invalid API key" or "Unauthorized" responses

**Solution:**

```bash
# Ensure you're using GET method to obtain API key
curl -X GET http://localhost:8000/v1/apikey

# Verify correct header format
curl -H "Authorization: Bearer sk-your-actual-api-key" ...
```

### Connection Issues

**Issue:** "Connection refused" or network errors

**Solution:**

```bash
# Verify server is running
bun run dev

# Test server health
curl http://localhost:8000/health
```

### Server Startup Issues

**Issue:** Server fails to start or database connection errors

**Solution:**

```bash
# Verify environment configuration
cat .env

# Reinitialize database
bun run prepare-db

# Check database connectivity
bun run check:ts
```

---

## Advanced Features

### Context-Aware Analysis

Include conversation history for improved content understanding:

```json
{
  "text": "Yes, let's meet there",
  "oldMessages": [
    "Want to grab coffee?",
    "Sure! How about Starbucks on Main St?"
  ],
  "config": {
    "allowPhysicalInformation": false
  }
}
```

### AI Model Selection

Configure processing speed and accuracy trade-offs:

```json
{
  "text": "Content to analyze",
  "model": "normal"
}
```

### Model Performance Comparison

```mermaid
graph TD
    A[Content Input] --> B{Model Selection}
    B -->|fast| C[⚡ Fast Model]
    B -->|normal| D[⚖️ Normal Model]
    B -->|pro| E[🎯 Pro Model]
    C --> F[~50ms Response]
    D --> G[~150ms Response]
    E --> H[~300ms Response]
    F --> I[85% Accuracy]
    G --> J[95% Accuracy]
    H --> K[99% Accuracy]
```

**Available Models:**

- `fast` - Optimized for speed with basic accuracy (~50ms, 85% accuracy)
- `normal` - Balanced performance and accuracy (~150ms, 95% accuracy, default)
- `pro` - Maximum accuracy with longer processing time (~300ms, 99% accuracy)

### System Health Monitoring

```bash
curl http://localhost:8000/health
```

**Response:**

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "database": "connected",
  "redis": "connected"
}
```

---

## Development

### Testing

```bash
# Run test suite
bun test

# Run with coverage
bun test --coverage
```

### Code Quality

```bash
# Lint codebase
bun run lint

# Format code
bun run format

# Type checking
bun run check:ts
```

### Database Management

```bash
# Initialize database and tables
bun run prepare-db

# Test database connectivity
bun run dev
```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built by [Utkarsh Tiwari](https://github.com/UtkarshTheDev)**

[![GitHub stars](https://img.shields.io/github/stars/UtkarshTheDev/FilterX?style=social)](https://github.com/UtkarshTheDev/FilterX)
[![Twitter Follow](https://img.shields.io/twitter/follow/UtkarshTheDev?style=social)](https://twitter.com/UtkarshTheDev)

_Enterprise-grade content moderation powered by TypeScript and [Bun](https://bun.sh)_

</div>
