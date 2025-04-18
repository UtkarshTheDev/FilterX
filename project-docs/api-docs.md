# FilterX API Documentation

## Introduction

FilterX provides a content moderation API that helps you filter potentially harmful or sensitive content from text and images. The API combines regex pattern matching, AI-based content analysis, and a caching mechanism to deliver fast and accurate content moderation.

## Authentication

All API requests require an API key. You can obtain an API key by making a request to the `/v1/apikey` endpoint.

API keys should be included in the request using one of the following methods:

- Bearer token in the `Authorization` header: `Authorization: Bearer your-api-key`
- Query parameter: `?apiKey=your-api-key`

## Rate Limiting

API requests are limited to 30 requests per minute per API key. If you exceed this limit, you will receive a 429 Too Many Requests response with a `Retry-After` header indicating when you can try again.

## Endpoints

### POST /v1/filter

This endpoint filters text and/or images for potentially harmful or sensitive content.

#### Request

```http
POST /v1/filter
Authorization: Bearer your-api-key
Content-Type: application/json

{
  "text": "Your text content",
  "image": "base64-encoded-image", // Optional
  "config": {
    "allowAbuse": false,
    "allowPhone": false,
    "allowEmail": false,
    "allowPhysicalInformation": false,
    "allowSocialInformation": false,
    "returnFilteredMessage": false
  },
  "oldMessages": [] // Optional, max 15 previous messages
}
```

#### Request Parameters

| Parameter   | Type   | Required             | Description                                   |
| ----------- | ------ | -------------------- | --------------------------------------------- |
| text        | string | Required if no image | The text content to filter                    |
| image       | string | Required if no text  | Base64-encoded image to analyze               |
| config      | object | Optional             | Configuration options for the filter          |
| oldMessages | array  | Optional             | Previous messages to provide context (max 15) |

#### Configuration Options

| Option                   | Type    | Default | Description                                                              |
| ------------------------ | ------- | ------- | ------------------------------------------------------------------------ |
| allowAbuse               | boolean | false   | Allow abusive language and profanity                                     |
| allowPhone               | boolean | false   | Allow phone numbers                                                      |
| allowEmail               | boolean | false   | Allow email addresses                                                    |
| allowPhysicalInformation | boolean | false   | Allow physical location information                                      |
| allowSocialInformation   | boolean | false   | Allow social media identifiers                                           |
| returnFilteredMessage    | boolean | false   | Return a filtered version of the message with sensitive content replaced |

#### Response

```json
{
  "blocked": false,
  "reason": "Content passed all checks",
  "flags": [],
  "filteredMessage": "Your filtered message" // Only if returnFilteredMessage is true
}
```

#### Response Fields

| Field           | Type    | Description                                                                                  |
| --------------- | ------- | -------------------------------------------------------------------------------------------- |
| blocked         | boolean | Whether the content was blocked by the filter                                                |
| reason          | string  | Reason for blocking the content                                                              |
| flags           | array   | List of flags that were triggered                                                            |
| filteredMessage | string  | Original message with sensitive content filtered out (only if returnFilteredMessage is true) |

#### Example: Text filtering

Request:

```json
{
  "text": "Hello, my phone number is 555-123-4567 and my email is user@example.com.",
  "config": {
    "allowAbuse": false,
    "allowPhone": false,
    "allowEmail": false,
    "returnFilteredMessage": true
  }
}
```

Response:

```json
{
  "blocked": true,
  "reason": "Detected: phone_number, email_address",
  "flags": ["phone_number", "email_address"],
  "filteredMessage": "Hello, my phone number is [FILTERED] and my email is [FILTERED]."
}
```

#### Example: Image filtering

Request:

```json
{
  "image": "base64_encoded_image_data",
  "config": {
    "allowAbuse": false
  }
}
```

Response:

```json
{
  "blocked": true,
  "reason": "Image contains potentially harmful content",
  "flags": ["nsfw_content"]
}
```

#### Error Responses

| Status Code | Description                               |
| ----------- | ----------------------------------------- |
| 400         | Bad Request - Invalid request parameters  |
| 401         | Unauthorized - Invalid or missing API key |
| 429         | Too Many Requests - Rate limit exceeded   |
| 500         | Internal Server Error - Server error      |

## Best Practices

1. Always include an API key with your requests
2. Monitor your rate limits to avoid service disruptions
3. Implement proper error handling for blocked content
4. Use the configuration options to tailor the filter to your needs
5. Consider providing old messages for better context analysis
6. Cache results to avoid unnecessary API calls
7. Handle the filtered message appropriately in your UI

## Testing the API

For a comprehensive list of example API calls using both HTTPie and cURL, please refer to the [API Testing Guide](./api-testing.md). This guide includes examples for:

- Getting an API key
- Text filtering with various configurations
- Image filtering
- Testing with different configuration options
- Accessing stats endpoint
- Managing API keys
- Health check endpoint
- Error handling scenarios
- Query parameter authentication

The testing guide provides ready-to-use commands that you can directly copy and paste into your terminal to test all FilterX functionality.
