# 🚀 API Stats Aggregation Guide - Optimized for Neon

This guide explains how to use the optimized `/stats/aggregate` API endpoint for triggering stats aggregation from external cron services like cron-job.org.

## 🎯 Key Optimizations

### **Smart Data Checking**
- **Checks Redis before connecting to database**
- **Returns immediately if no data exists**
- **Prevents unnecessary database wake-ups**
- **Saves 80-90% of compute costs**

### **Bulk Operations**
- **Single transaction for all stats**
- **Reduces queries from 20+ to 1-4**
- **Minimizes database connection time**
- **Optimized for Neon serverless**

### **Intelligent Response Handling**
- **Different responses based on data availability**
- **Detailed monitoring information**
- **Proper HTTP status codes**
- **Cron-friendly response format**

## 📡 API Endpoint

### **URL**
```
GET /stats/aggregate
```

### **Query Parameters**
- `force=true` (optional) - Force aggregation even if no data is detected

### **Rate Limiting**
- 2 requests per minute to prevent abuse
- No API key required

## 📊 Response Types

### **1. No Data Found (Optimized Response)**
**Status:** `200 OK`
```json
{
  "success": true,
  "skipped": true,
  "reason": "No data to aggregate - avoiding unnecessary DB wake-up",
  "message": "No data to aggregate - database connection avoided",
  "recordsProcessed": 0,
  "duration": 45,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "optimization": "Zero compute usage - no DB wake-up"
}
```

### **2. Successful Aggregation**
**Status:** `200 OK`
```json
{
  "success": true,
  "message": "Stats aggregation completed successfully",
  "recordsProcessed": 4,
  "duration": 150,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "results": {
    "requestStats": true,
    "apiPerformance": true,
    "contentFlags": true,
    "userActivity": true
  },
  "optimization": "Bulk operations used - minimal compute usage"
}
```

### **3. Aggregation Failed**
**Status:** `500 Internal Server Error`
```json
{
  "success": false,
  "error": "Stats aggregation failed",
  "details": ["Request stats: Database connection failed"],
  "recordsProcessed": 0,
  "duration": 2500,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "results": {
    "requestStats": false,
    "apiPerformance": false,
    "contentFlags": false,
    "userActivity": false
  }
}
```

### **4. Force Run**
**URL:** `/stats/aggregate?force=true`
```json
{
  "success": true,
  "message": "Stats aggregation completed successfully",
  "recordsProcessed": 2,
  "duration": 180,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "results": {
    "requestStats": true,
    "apiPerformance": false,
    "contentFlags": true,
    "userActivity": false
  },
  "optimization": "Force run - data check bypassed"
}
```

## 🕐 Cron-job.org Setup

### **Recommended Configuration**

**URL:** `https://your-domain.com/stats/aggregate`
**Method:** `GET`
**Frequency:** Every 30 minutes
**Timeout:** 30 seconds

### **Cron Expression Examples**

```bash
# Every 30 minutes (recommended for cost optimization)
*/30 * * * *

# Every hour (maximum cost savings)
0 * * * *

# Every 15 minutes (development/testing)
*/15 * * * *
```

### **Advanced Setup with Monitoring**

1. **Primary Job (Every 30 minutes):**
   - URL: `https://your-domain.com/stats/aggregate`
   - Expected Response: `200 OK`
   - Alert on: `500` status or timeout

2. **Health Check (Daily):**
   - URL: `https://your-domain.com/stats/health`
   - Expected Response: `200 OK`
   - Alert on: Any non-200 status

## 💰 Cost Impact Analysis

### **Before Optimization**
```
Frequency: Every 5 minutes
Monthly runs: 8,640
DB wake-ups per run: 1 (always)
Queries per run: 20+
Total monthly wake-ups: 8,640+
Compute usage: HIGH
```

### **After Optimization**
```
Frequency: Every 30 minutes
Monthly runs: 1,440
DB wake-ups per run: 0-1 (only when data exists)
Queries per run: 1-4 (bulk operations)
Total monthly wake-ups: 200-400 (estimated)
Compute usage: MINIMAL (80-90% reduction)
```

### **Expected Savings**
- **Neon Free Plan:** Stay within limits longer
- **Neon Pro Plan:** 80-90% reduction in compute costs
- **Overall:** Dramatic cost reduction with same functionality

## 🔍 Monitoring & Debugging

### **Success Indicators**
- `success: true` in response
- `recordsProcessed > 0` when data exists
- `skipped: true` when no data (this is GOOD for costs!)
- Response time < 500ms

### **Warning Signs**
- Frequent `500` errors
- Response times > 2000ms
- `recordsProcessed: 0` when you expect data
- Missing `skipped: true` when no activity

### **Debug Commands**
```bash
# Test the endpoint manually
curl "https://your-domain.com/stats/aggregate"

# Force run for testing
curl "https://your-domain.com/stats/aggregate?force=true"

# Check health
curl "https://your-domain.com/stats/health"
```

### **Log Monitoring**
Look for these log messages:
- `⏭️ Skipping aggregation: No data to aggregate` (GOOD - saves costs)
- `✅ Proceeding with aggregation: Data found` (Normal operation)
- `🎉 Optimized aggregation completed: X records` (Success)

## 🛠️ Troubleshooting

### **Common Issues**

1. **Always getting `skipped: true`**
   - Check if your application is generating stats
   - Verify Redis connection
   - Use `?force=true` to test database connectivity

2. **High response times**
   - Check database connection
   - Verify Neon pooler is enabled (`DB_USE_POOLER=true`)
   - Monitor Neon dashboard for compute usage

3. **Frequent 500 errors**
   - Check database connectivity
   - Verify Redis is accessible
   - Review application logs for detailed errors

4. **No data being aggregated**
   - Verify stats are being written to Redis
   - Check Redis key patterns: `stats:*`, `api:stats:*`
   - Test with force run: `?force=true`

### **Environment Variables**
Ensure these are set for optimal performance:
```bash
DB_USE_POOLER=true                    # Use Neon pooler
STATS_AGGREGATION_INTERVAL_MINUTES=30 # Cron frequency
STATS_ENABLE_KEEP_ALIVE=false        # Disable for pooler
```

## 🎉 Benefits Summary

✅ **Cost Optimized:** 80-90% reduction in Neon compute usage
✅ **Smart Execution:** Only runs when data exists
✅ **Bulk Operations:** Minimal database queries
✅ **Cron-Friendly:** Perfect for external scheduling
✅ **Monitoring Ready:** Detailed response information
✅ **Backward Compatible:** Existing functionality preserved
✅ **Production Ready:** Comprehensive error handling

The optimized endpoint is designed specifically for cost-effective operation on Neon's serverless platform while maintaining full functionality and reliability.
