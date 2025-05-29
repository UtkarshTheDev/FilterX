# SanityAI Stats API Guide

## Overview

The SanityAI Stats API provides comprehensive statistics about your content filtering system. The API uses a **database-first approach** for better performance, reliability, and data consistency.

## Main Endpoint

### GET `/stats`

**The primary endpoint for getting comprehensive statistics.**

#### Basic Usage

```bash
# Get all-time statistics (no time limitation)
GET /stats

# Get today's statistics
GET /stats?timeRange=today

# Get yesterday's statistics
GET /stats?timeRange=yesterday

# Get last 7 days statistics
GET /stats?timeRange=7d

# Get last 30 days statistics
GET /stats?timeRange=30d
```

#### Parameters

| Parameter   | Type   | Required | Description               | Default               |
| ----------- | ------ | -------- | ------------------------- | --------------------- |
| `timeRange` | string | No       | Time range for statistics | `all` (no limitation) |

**Valid timeRange values:**

- `today` - Today's statistics only
- `yesterday` - Yesterday's statistics only
- `7d` - Last 7 days statistics
- `30d` - Last 30 days statistics
- _(empty)_ - All-time statistics (no date limitation)

#### Response Format

```json
{
  "success": true,
  "timeRange": "today",
  "startDate": "2025-01-15",
  "endDate": "2025-01-15",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "dataSource": "database",
  "version": "1.0.0",
  "stats": {
    "requests": {
      "totalRequests": 1250,
      "filteredRequests": 1100,
      "blockedRequests": 150,
      "cachedRequests": 800,
      "cacheHitRate": 64,
      "avgResponseTime": 245,
      "p95ResponseTime": 450,
      "minResponseTime": 120,
      "daysWithData": 1
    },
    "api": {
      "text": {
        "calls": 950,
        "errors": 12,
        "errorRate": 1,
        "avgResponseTime": 180,
        "maxResponseTime": 350,
        "hoursWithData": 8
      },
      "image": {
        "calls": 300,
        "errors": 5,
        "errorRate": 2,
        "avgResponseTime": 420,
        "maxResponseTime": 800,
        "hoursWithData": 6
      }
    },
    "flags": {
      "flags": {
        "inappropriate": {
          "count": 45,
          "daysActive": 1
        },
        "spam": {
          "count": 23,
          "daysActive": 1
        },
        "violence": {
          "count": 12,
          "daysActive": 1
        }
      },
      "totalFlags": 80,
      "uniqueFlags": 3
    },
    "users": {
      "totalUsers": 125,
      "totalRequests": 1250,
      "totalBlocked": 150,
      "blockRate": 12,
      "avgRequestsPerUser": 10,
      "maxRequestsPerUser": 45
    }
  }
}
```

## Time-Series Data Endpoint

### GET `/stats/timeseries`

**Get time-series data for charts and analytics.**

#### Usage

```bash
# Get daily time-series data for last 7 days
GET /stats/timeseries?startDate=2025-01-01&endDate=2025-01-07&granularity=daily

# Get hourly time-series data for today
GET /stats/timeseries?startDate=2025-01-15&endDate=2025-01-15&granularity=hourly
```

#### Parameters

| Parameter     | Type   | Required | Description             | Default    |
| ------------- | ------ | -------- | ----------------------- | ---------- |
| `startDate`   | string | No       | Start date (YYYY-MM-DD) | 7 days ago |
| `endDate`     | string | No       | End date (YYYY-MM-DD)   | Today      |
| `granularity` | string | No       | Data granularity        | `daily`    |

**Valid granularity values:**

- `daily` - Daily aggregated data
- `hourly` - Hourly aggregated data

#### Response Format

```json
{
  "success": true,
  "startDate": "2025-01-01",
  "endDate": "2025-01-07",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "granularity": "daily",
  "data": [
    {
      "date": "2025-01-01",
      "totalRequests": 1200,
      "filteredRequests": 1050,
      "blockedRequests": 150,
      "cachedRequests": 750,
      "avgResponseTime": 230,
      "p95ResponseTime": 420
    },
    {
      "date": "2025-01-02",
      "totalRequests": 1350,
      "filteredRequests": 1180,
      "blockedRequests": 170,
      "cachedRequests": 850,
      "avgResponseTime": 245,
      "p95ResponseTime": 450
    }
  ]
}
```

## User-Specific Stats

### GET `/stats/user/:userId`

**Get statistics for a specific user.**

#### Usage

```bash
# Get user stats for last 30 days
GET /stats/user/user123

# Get user stats for custom date range
GET /stats/user/user123?startDate=2025-01-01&endDate=2025-01-15
```

#### Parameters

| Parameter   | Type   | Required | Description             | Default     |
| ----------- | ------ | -------- | ----------------------- | ----------- |
| `userId`    | string | Yes      | User ID (in URL path)   | -           |
| `startDate` | string | No       | Start date (YYYY-MM-DD) | 30 days ago |
| `endDate`   | string | No       | End date (YYYY-MM-DD)   | Today       |

## Legacy Endpoints

### GET `/stats/summary`

**Legacy endpoint - use `/stats` instead.**

### GET `/stats/historical`

**Get historical statistics from database.**

### GET `/stats/combined`

**Get combined recent and historical statistics.**

## Common Use Cases

### 1. Dashboard Overview

```bash
# Get today's comprehensive stats for dashboard
curl "https://your-api.com/stats?timeRange=today"
```

### 2. Weekly Report

```bash
# Get last 7 days stats for weekly report
curl "https://your-api.com/stats?timeRange=7d"
```

### 3. All-Time Statistics

```bash
# Get all-time stats (no date limitation)
curl "https://your-api.com/stats"
```

### 4. Chart Data

```bash
# Get daily data for last month for charts
curl "https://your-api.com/stats/timeseries?startDate=2025-01-01&endDate=2025-01-31&granularity=daily"
```

### 5. User Analysis

```bash
# Get specific user's activity
curl "https://your-api.com/stats/user/user123?startDate=2025-01-01&endDate=2025-01-31"
```

## Response Fields Explained

### Request Statistics

- **totalRequests**: Total number of filter requests
- **filteredRequests**: Requests that passed filtering (allowed)
- **blockedRequests**: Requests that were blocked
- **cachedRequests**: Requests served from cache
- **cacheHitRate**: Percentage of requests served from cache
- **avgResponseTime**: Average response time in milliseconds
- **p95ResponseTime**: 95th percentile response time
- **daysWithData**: Number of days with recorded data

### API Performance

- **calls**: Total API calls made
- **errors**: Number of failed API calls
- **errorRate**: Percentage of failed calls
- **avgResponseTime**: Average API response time
- **hoursWithData**: Number of hours with recorded data

### Content Flags

- **flags**: Object containing flag names and their counts
- **totalFlags**: Total number of content flags raised
- **uniqueFlags**: Number of unique flag types

### User Activity

- **totalUsers**: Number of active users
- **totalRequests**: Total requests from all users
- **blockRate**: Percentage of requests that were blocked
- **avgRequestsPerUser**: Average requests per user
- **maxRequestsPerUser**: Maximum requests from a single user

## Error Handling

### Common Error Responses

```json
{
  "error": "Invalid time range. Use 'today', 'yesterday', '7d', or '30d'. Leave empty for all-time stats.",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

```json
{
  "error": "Invalid date format. Use YYYY-MM-DD format.",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

```json
{
  "error": "Failed to fetch database statistics",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

## Best Practices

1. **Use the main `/stats` endpoint** for most use cases
2. **Leave timeRange empty** to get all-time statistics
3. **Use specific timeRange values** for focused analysis
4. **Use `/stats/timeseries`** for chart and graph data
5. **Cache responses** appropriately based on your needs
6. **Handle errors gracefully** in your applications
7. **Monitor API response times** for performance optimization

## Rate Limiting

The Stats API follows the same rate limiting rules as other API endpoints. Please refer to the main API documentation for rate limiting details.

## Support

For questions or issues with the Stats API, please:

1. Check this documentation first
2. Review the error messages for specific guidance
3. Contact the development team if needed

The Stats API provides reliable, comprehensive statistics to help you monitor and optimize your content filtering system.
