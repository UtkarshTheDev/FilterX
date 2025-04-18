# FilterX API Testing Guide

This document provides commands for testing all FilterX API endpoints using both HTTPie and cURL. These commands can be used to verify functionality and as a reference for integration.

## Getting an API Key

Before testing the content filtering endpoints, you need to obtain an API key.

### HTTPie

```bash
# Get an API key for your IP
http GET http://localhost:8000/v1/apikey
```

### cURL

```bash
# Get an API key for your IP
curl -X GET http://localhost:8000/v1/apikey
```

Response:

```json
{
  "key": "your-api-key",
  "userId": "user_12345abcde",
  "createdAt": "2023-03-01T12:00:00.000Z"
}
```

## Text Filtering

Test the content filtering endpoint with text content.

### HTTPie

```bash
# Basic text filtering
http POST http://localhost:8000/v1/filter \
  "Authorization: Bearer your-api-key" \
  text="This is a test message" \
  config:='{"allowAbuse": false, "allowPhone": false, "allowEmail": false}'

# Text filtering with sensitive content
http POST http://localhost:8000/v1/filter \
  "Authorization: Bearer your-api-key" \
  text="My phone number is 555-123-4567 and email is test@example.com" \
  config:='{"allowAbuse": false, "allowPhone": false, "allowEmail": false, "returnFilteredMessage": true}'

# With message history for context
http POST http://localhost:8000/v1/filter \
  "Authorization: Bearer your-api-key" \
  text="As I was saying earlier about that place" \
  oldMessages:='["My address is 123 Main St", "What were you saying about your address?"]' \
  config:='{"allowPhysicalInformation": false}'
```

### cURL

```bash
# Basic text filtering
curl -X POST http://localhost:8000/v1/filter \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text":"This is a test message", "config":{"allowAbuse": false, "allowPhone": false, "allowEmail": false}}'

# Text filtering with sensitive content
curl -X POST http://localhost:8000/v1/filter \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text":"My phone number is 555-123-4567 and email is test@example.com", "config":{"allowAbuse": false, "allowPhone": false, "allowEmail": false, "returnFilteredMessage": true}}'

# With message history for context
curl -X POST http://localhost:8000/v1/filter \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text":"As I was saying earlier about that place", "oldMessages":["My address is 123 Main St", "What were you saying about your address?"], "config":{"allowPhysicalInformation": false}}'
```

## Image Filtering

Test the content filtering endpoint with image content.

### HTTPie

```bash
# Image filtering (replace image.jpg with your actual image file)
http POST http://localhost:8000/v1/filter \
  "Authorization: Bearer your-api-key" \
  image="$(base64 -w 0 image.jpg)" \
  config:='{"allowAbuse": false}'

# Combined text and image filtering
http POST http://localhost:8000/v1/filter \
  "Authorization: Bearer your-api-key" \
  text="Check this image" \
  image="$(base64 -w 0 image.jpg)" \
  config:='{"allowAbuse": false, "returnFilteredMessage": true}'
```

### cURL

```bash
# Image filtering (replace image.jpg with your actual image file)
curl -X POST http://localhost:8000/v1/filter \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d "{\"image\":\"$(base64 -w 0 image.jpg)\", \"config\":{\"allowAbuse\": false}}"

# Combined text and image filtering
curl -X POST http://localhost:8000/v1/filter \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"Check this image\", \"image\":\"$(base64 -w 0 image.jpg)\", \"config\":{\"allowAbuse\": false, \"returnFilteredMessage\": true}}"
```

## Testing Different Configuration Options

These examples demonstrate different configurations for filtering.

### HTTPie

```bash
# Allow phone numbers but block emails
http POST http://localhost:8000/v1/filter \
  "Authorization: Bearer your-api-key" \
  text="Contact me at 555-123-4567 or user@example.com" \
  config:='{"allowPhone": true, "allowEmail": false, "returnFilteredMessage": true}'

# Allow social information but block physical information
http POST http://localhost:8000/v1/filter \
  "Authorization: Bearer your-api-key" \
  text="Follow me on @twitterhandle and my address is 123 Main St" \
  config:='{"allowSocialInformation": true, "allowPhysicalInformation": false, "returnFilteredMessage": true}'
```

### cURL

```bash
# Allow phone numbers but block emails
curl -X POST http://localhost:8000/v1/filter \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text":"Contact me at 555-123-4567 or user@example.com", "config":{"allowPhone": true, "allowEmail": false, "returnFilteredMessage": true}}'

# Allow social information but block physical information
curl -X POST http://localhost:8000/v1/filter \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text":"Follow me on @twitterhandle and my address is 123 Main St", "config":{"allowSocialInformation": true, "allowPhysicalInformation": false, "returnFilteredMessage": true}}'
```

## Stats Endpoint

Get public statistics about FilterX usage.

### HTTPie

```bash
# Get stats
http GET http://localhost:8000/admin/stats
```

### cURL

```bash
# Get stats
curl -X GET http://localhost:8000/admin/stats
```

Response:

```json
{
  "stats": {
    "totalRequests": 1523,
    "filteredRequests": 1230,
    "blockedRequests": 293,
    "cachedRequests": 427,
    "todayRequests": 142,
    "cacheHitRate": 28,
    "latency": {
      "average": 185,
      "p50": 120,
      "p95": 450,
      "p99": 750
    },
    "flags": {
      "phone": 89,
      "email": 65,
      "abuse": 43,
      "address": 32,
      "creditCard": 12,
      "socialMedia": 52
    }
  },
  "timestamp": "2023-03-01T12:00:00.000Z",
  "version": "1.0.0"
}
```

## Additional API Key Management

### HTTPie

```bash
# Revoke an API key
http POST http://localhost:8000/v1/apikey/revoke \
  key="the-api-key-to-revoke"
```

### cURL

```bash
# Revoke an API key
curl -X POST http://localhost:8000/v1/apikey/revoke \
  -H "Content-Type: application/json" \
  -d '{"key":"the-api-key-to-revoke"}'
```

Response:

```json
{
  "message": "API key revoked successfully"
}
```

## Health Check

Test the health check endpoint to verify the API is running properly.

### HTTPie

```bash
# Check API health
http GET http://localhost:8000/health
```

### cURL

```bash
# Check API health
curl -X GET http://localhost:8000/health
```

Response:

```json
{
  "status": "ok"
}
```

## Error Handling Examples

These examples demonstrate error responses.

### HTTPie

```bash
# Missing required content
http POST http://localhost:8000/v1/filter \
  "Authorization: Bearer your-api-key"

# Invalid API key
http POST http://localhost:8000/v1/filter \
  "Authorization: Bearer invalid-key" \
  text="Test message"

# Too many request (rate limit exceeded)
# Note: This is difficult to test without actually hitting the rate limit
```

### cURL

```bash
# Missing required content
curl -X POST http://localhost:8000/v1/filter \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{}'

# Invalid API key
curl -X POST http://localhost:8000/v1/filter \
  -H "Authorization: Bearer invalid-key" \
  -H "Content-Type: application/json" \
  -d '{"text":"Test message"}'
```

## Testing with Query Parameter Authentication

Instead of using the Authorization header, you can also use a query parameter for API key authentication.

### HTTPie

```bash
# Using query parameter for API key
http POST "http://localhost:8000/v1/filter?apiKey=your-api-key" \
  text="This is a test message"
```

### cURL

```bash
# Using query parameter for API key
curl -X POST "http://localhost:8000/v1/filter?apiKey=your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text":"This is a test message"}'
```
