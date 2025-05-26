# Provider Integration Guide

## Overview

SanityAI now supports multiple AI providers with flexible model tier configuration. This allows you to use different AI providers (Akash Chat, Google Gemini) for different model tiers, optimizing for performance, cost, and capabilities.

## Supported Providers

### 1. Akash Chat (Default)

- **Provider ID**: `akash`
- **Models**: Qwen3-235B-A22B-FP8, Meta-Llama-3-3-70B-Instruct, Meta-Llama-3-1-8B-Instruct-FP8
- **Strengths**: High performance, specialized models
- **Use Cases**: Complex content analysis, high-accuracy filtering

### 2. Google Gemini

- **Provider ID**: `gemini`
- **Models**: gemini-2.0-flash-exp, gemini-2.5-flash, gemini-1.5-pro
- **Strengths**: Fast response times, reasoning capabilities
- **Use Cases**: Quick filtering, cost-effective processing

## Configuration

### Environment Variables

```bash
# Akash Chat Configuration
AKASH_CHAT_API_KEY=sk-xxxxxxxx
AKASH_CHAT_BASE_URL=https://chatapi.akash.network/api/v1
AKASH_CHAT_TIMEOUT=5000

# Gemini Configuration
GEMINI_API_KEY=your-gemini-api-key
GEMINI_TIMEOUT=5000

# Model Tier Configuration with Provider Selection
MODEL_TIER_PRO_PROVIDER=akash
MODEL_TIER_PRO_MODEL=Qwen3-235B-A22B-FP8

MODEL_TIER_NORMAL_PROVIDER=akash
MODEL_TIER_NORMAL_MODEL=Meta-Llama-3-3-70B-Instruct

MODEL_TIER_FAST_PROVIDER=gemini
MODEL_TIER_FAST_MODEL=gemini-2.5-flash
```

### Configuration Examples

#### Example 1: Akash for Complex, Gemini for Fast

```bash
# Use Akash for complex analysis
MODEL_TIER_PRO_PROVIDER=akash
MODEL_TIER_PRO_MODEL=Qwen3-235B-A22B-FP8

MODEL_TIER_NORMAL_PROVIDER=akash
MODEL_TIER_NORMAL_MODEL=Meta-Llama-3-3-70B-Instruct

# Use Gemini for fast processing
MODEL_TIER_FAST_PROVIDER=gemini
MODEL_TIER_FAST_MODEL=gemini-2.5-flash
```

#### Example 2: All Gemini for Cost Optimization

```bash
MODEL_TIER_PRO_PROVIDER=gemini
MODEL_TIER_PRO_MODEL=gemini-1.5-pro

MODEL_TIER_NORMAL_PROVIDER=gemini
MODEL_TIER_NORMAL_MODEL=gemini-2.0-flash-exp

MODEL_TIER_FAST_PROVIDER=gemini
MODEL_TIER_FAST_MODEL=gemini-2.5-flash
```

#### Example 3: All Akash for Consistency

```bash
MODEL_TIER_PRO_PROVIDER=akash
MODEL_TIER_PRO_MODEL=Qwen3-235B-A22B-FP8

MODEL_TIER_NORMAL_PROVIDER=akash
MODEL_TIER_NORMAL_MODEL=Meta-Llama-3-3-70B-Instruct

MODEL_TIER_FAST_PROVIDER=akash
MODEL_TIER_FAST_MODEL=Meta-Llama-3-1-8B-Instruct-FP8
```

## API Usage

The API remains exactly the same. The provider selection is handled automatically based on your configuration.

### Single Request

```javascript
const response = await fetch("/v1/filter", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "your-api-key",
  },
  body: JSON.stringify({
    text: "Your content to filter",
    model: "fast", // Will use the provider configured for 'fast' tier
    config: {
      allowAbuse: false,
      allowPhone: false,
      allowEmail: false,
      returnFilteredMessage: true,
    },
  }),
});
```

### Batch Request

```javascript
const response = await fetch("/v1/filter/batch", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "your-api-key",
  },
  body: JSON.stringify({
    items: [
      {
        text: "Content 1",
        model: "pro", // Uses provider configured for 'pro' tier
        config: { allowAbuse: false },
      },
      {
        text: "Content 2",
        model: "fast", // Uses provider configured for 'fast' tier
        config: { allowPhone: false },
      },
    ],
  }),
});
```

## Features

### Identical System Prompts

Both providers use exactly the same system prompts and filtering logic, ensuring consistent results regardless of which provider is used.

### Reasoning Model Support

The Gemini integration automatically handles reasoning models that use `<think></think>` brackets, extracting only the final response for processing.

### Provider-Aware Caching

Cache keys include provider information, ensuring separate cache entries for different providers while maintaining performance.

### Automatic Fallback

If a provider fails, the system gracefully handles errors and provides safe fallback responses.

### Performance Tracking

All providers are tracked separately for performance monitoring and optimization.

## Testing

### Test Provider Integration

```bash
npm run test:providers
```

This will test:

- Different providers for different tiers
- Mixed provider batch requests
- Error handling and fallbacks
- Performance comparison

### Test Model Tiers (Legacy)

```bash
npm run test:model-tiers
```

## Migration Guide

### From Single Provider to Multi-Provider

1. **Add Gemini Configuration** (if using Gemini):

   ```bash
   GEMINI_API_KEY=your-gemini-api-key
   ```

2. **Configure Model Tiers**:

   ```bash
   MODEL_TIER_PRO_PROVIDER=akash
   MODEL_TIER_PRO_MODEL=Qwen3-235B-A22B-FP8

   MODEL_TIER_NORMAL_PROVIDER=akash
   MODEL_TIER_NORMAL_MODEL=Meta-Llama-3-3-70B-Instruct

   MODEL_TIER_FAST_PROVIDER=gemini
   MODEL_TIER_FAST_MODEL=gemini-2.5-flash
   ```

3. **No Code Changes Required**: Your existing API calls will work unchanged.

### Backward Compatibility

- All existing API endpoints work unchanged
- Default configuration maintains current behavior
- Legacy environment variables are still supported
- Gradual migration is supported

## Best Practices

### Provider Selection Strategy

1. **Pro Tier**: Use Akash for complex analysis requiring high accuracy
2. **Normal Tier**: Use Akash for balanced performance and accuracy
3. **Fast Tier**: Use Gemini for quick processing and cost optimization

### Performance Optimization

1. **Cache Warming**: Pre-warm caches for frequently used content
2. **Tier Selection**: Choose appropriate tiers based on content complexity
3. **Batch Processing**: Use batch endpoints for multiple items
4. **Provider Health**: Monitor provider availability and performance

### Cost Optimization

1. **Gemini for Volume**: Use Gemini for high-volume, simple filtering
2. **Akash for Precision**: Use Akash for complex or critical content
3. **Tier Mapping**: Map business requirements to appropriate tiers

## Troubleshooting

### Common Issues

1. **Provider Not Configured**: Ensure API keys are set correctly
2. **Model Not Available**: Check model names match provider capabilities
3. **Timeout Issues**: Adjust timeout values for your use case
4. **Cache Issues**: Clear cache if switching providers frequently

### Debug Mode

Enable debug logging to see provider selection:

```bash
NODE_ENV=development npm run dev
```

Look for log entries like:

```
[AI Factory] Selected provider: gemini, model: gemini-2.5-flash for tier: fast
[Gemini Analysis] Starting analysis for text: "..."
```

## Support

For issues or questions about provider integration:

1. Check the logs for provider selection and errors
2. Verify API keys and configuration
3. Test with the provider integration script
4. Review performance metrics for optimization opportunities
