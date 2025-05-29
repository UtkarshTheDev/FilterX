import type { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { config } from "../config";
import logger from "../utils/logger";

/**
 * Controller for handling home/root endpoint operations
 */
export const homeController = {
  /**
   * GET / - Main home endpoint with modern HTML interface
   */
  getHome: asyncHandler(async (req: Request, res: Response) => {
    const startTime = performance.now();

    // Get basic server information
    const serverInfo = {
      name: "FilterX",
      description: "Advanced Content Moderation API",
      version: process.env.npm_package_version || "1.0.0",
      environment: config.nodeEnv,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };

    // Calculate processing time
    const processingTime = Math.round(performance.now() - startTime);

    // Generate modern HTML response
    const html = generateHomePageHTML(serverInfo, processingTime);

    // Log successful home page access
    logger.debug(`Home endpoint accessed - ${processingTime}ms`);

    // Set content type to HTML and send response
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(html);
  }),
};

/**
 * Generate the complete HTML for the home page
 */
function generateHomePageHTML(serverInfo: any, processingTime: number): string {
  const baseUrl = process.env.BASE_URL || "http://localhost:8000";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="FilterX - Advanced Content Moderation API for intelligent, fast, and configurable content filtering">
    <meta name="keywords" content="content moderation, API, filtering, AI, text analysis, image analysis">
    <meta name="author" content="Utkarsh Tiwari">
    <title>FilterX - Advanced Content Moderation API</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛡️</text></svg>">
    <!-- Lucide Icons CDN -->
    <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.js"></script>
    <style>
        ${getCSS()}
    </style>
</head>
<body>
    <!-- Header Section - Full Width -->
    <header class="hero">
        <div class="container">
            <div class="hero-content">
                <div class="logo">
                    <span class="shield">🛡️</span>
                    <h1>FilterX</h1>
                </div>
                <p class="tagline">Advanced Content Moderation API</p>
                <p class="description">Intelligent, fast, and configurable content filtering for modern applications</p>

                <div class="stats-bar">
                    <div class="stat">
                        <span class="stat-value">v${serverInfo.version}</span>
                        <span class="stat-label">Version</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${Math.floor(
                          serverInfo.uptime / 60
                        )}m</span>
                        <span class="stat-label">Uptime</span>
                    </div>
                    <div class="stat">
                        <span class="stat-value">${processingTime}ms</span>
                        <span class="stat-label">Response</span>
                    </div>
                </div>
            </div>
        </div>
    </header>

    <!-- Attribution Section - Full Width -->
    <section class="attribution">
        <div class="container">
            <div class="creator-info">
                <h2>Created by <span class="creator-name">Utkarsh</span></h2>
                <div class="social-links">
                    <a href="https://github.com/UtkarshTheDev" class="social-link github-link" target="_blank" rel="noopener">
                        <i data-lucide="github"></i>
                        GitHub Profile
                    </a>
                    <a href="https://github.com/UtkarshTheDev/FilterX" class="social-link repo-link" target="_blank" rel="noopener">
                        <i data-lucide="star"></i>
                        Star the Repository
                    </a>
                    <a href="https://x.com/UtkarshTheDev" class="social-link twitter-link" target="_blank" rel="noopener">
                        <i data-lucide="twitter"></i>
                        Follow on X
                    </a>
                </div>
            </div>
        </div>
    </section>

    <div class="container">

        <!-- Quick Start Section -->
        <section class="quick-start">
            <h2><i data-lucide="rocket" class="section-icon"></i> Quick Start Guide</h2>
            <div class="steps">
                <div class="step">
                    <div class="step-icon">
                        <i data-lucide="key"></i>
                    </div>
                    <div class="step-content">
                        <h3>Get Your API Key</h3>
                        <div class="code-block">
                            <button class="copy-btn" onclick="copyToClipboard('step1-code')">Copy</button>
                            <pre id="step1-code"><code>curl -X GET ${baseUrl}/v1/apikey</code></pre>
                        </div>
                    </div>
                </div>

                <div class="step">
                    <div class="step-icon">
                        <i data-lucide="zap"></i>
                    </div>
                    <div class="step-content">
                        <h3>Test Content Filtering</h3>
                        <div class="code-block">
                            <button class="copy-btn" onclick="copyToClipboard('step2-code')">Copy</button>
                            <pre id="step2-code"><code>curl -X POST ${baseUrl}/v1/filter \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Sample text to filter",
    "config": {
      "allowAbuse": false,
      "allowPhone": false,
      "allowEmail": false,
      "returnFilteredMessage": true
    }
  }'</code></pre>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- API Endpoints Bento Grid Section -->
        <section class="api-endpoints">
            <h2><i data-lucide="book-open" class="section-icon"></i> API Usage Examples</h2>
            <div class="bento-grid">
                <!-- Basic Filter Usage - Large Card (Left Column) -->
                <div class="bento-card bento-large bento-primary">
                    <div class="bento-header">
                        <div class="bento-icon">
                            <i data-lucide="shield-check"></i>
                        </div>
                        <div>
                            <h3>Basic Content Filtering</h3>
                            <p>Simple text analysis with custom configuration</p>
                        </div>
                    </div>
                    <div class="code-block">
                        <button class="copy-btn" onclick="copyToClipboard('basic-filter')">Copy</button>
                        <pre id="basic-filter"><code>curl -X POST ${baseUrl}/v1/filter \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Check this content for issues",
    "config": {
      "allowAbuse": false,
      "allowPhone": false,
      "allowEmail": false,
      "returnFilteredMessage": true
    }
  }'</code></pre>
                    </div>
                </div>

                <!-- Batch Processing - Medium Card (Right Column Top) -->
                <div class="bento-card bento-medium bento-secondary">
                    <div class="bento-header">
                        <div class="bento-icon">
                            <i data-lucide="layers"></i>
                        </div>
                        <div>
                            <h3>Batch Processing</h3>
                            <p>Process multiple texts efficiently</p>
                        </div>
                    </div>
                    <div class="code-block">
                        <button class="copy-btn" onclick="copyToClipboard('batch-filter')">Copy</button>
                        <pre id="batch-filter"><code>curl -X POST ${baseUrl}/v1/filter \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "texts": [
      "First message",
      "Second message",
      "Third message"
    ],
    "config": {
      "allowAbuse": false,
      "returnFilteredMessage": true
    }
  }'</code></pre>
                    </div>
                </div>

                <!-- Stats API - Small Card (Left Column Bottom) -->
                <div class="bento-card bento-small bento-stats">
                    <div class="bento-header">
                        <div class="bento-icon">
                            <i data-lucide="bar-chart-3"></i>
                        </div>
                        <div>
                            <h3>Statistics</h3>
                            <p>Get API usage statistics</p>
                        </div>
                    </div>
                    <div class="code-block">
                        <button class="copy-btn" onclick="copyToClipboard('stats-api')">Copy</button>
                        <pre id="stats-api"><code>curl -X GET ${baseUrl}/v1/stats \\
  -H "Authorization: Bearer sk-your-api-key"</code></pre>
                    </div>
                </div>

                <!-- Chat Analysis - Medium Card (Right Column Bottom) -->
                <div class="bento-card bento-medium bento-tertiary">
                    <div class="bento-header">
                        <div class="bento-icon">
                            <i data-lucide="message-square-text"></i>
                        </div>
                        <div>
                            <h3>Chat Analysis</h3>
                            <p>Context-aware conversation filtering</p>
                        </div>
                    </div>
                    <div class="code-block">
                        <button class="copy-btn" onclick="copyToClipboard('chat-filter')">Copy</button>
                        <pre id="chat-filter"><code>curl -X POST ${baseUrl}/v1/filter \\
  -H "Authorization: Bearer sk-your-api-key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "conversation": [
      {"role": "user", "content": "Hello!"},
      {"role": "assistant", "content": "Hi there!"},
      {"role": "user", "content": "Message to analyze"}
    ],
    "config": {
      "allowAbuse": false,
      "contextAware": true
    }
  }'</code></pre>
                    </div>
                </div>

                <!-- Health Check - Small Card (Left Column Bottom) -->
                <div class="bento-card bento-small bento-accent">
                    <div class="bento-header">
                        <div class="bento-icon">
                            <i data-lucide="heart-pulse"></i>
                        </div>
                        <div>
                            <h3>Health Check</h3>
                            <p>Monitor API status</p>
                        </div>
                    </div>
                    <div class="code-block">
                        <button class="copy-btn" onclick="copyToClipboard('health-check')">Copy</button>
                        <pre id="health-check"><code>curl -X GET ${baseUrl}/health</code></pre>
                    </div>
                </div>
            </div>
        </section>

        <!-- Configuration Section -->
        <section class="configuration">
            <h2><i data-lucide="settings" class="section-icon"></i> Configuration Options</h2>
            <p class="config-intro">🔒 <strong>Security First:</strong> All configuration flags default to <code>false</code> (most restrictive mode) for maximum security.</p>

            <div class="config-grid">
                <div class="config-card config-abuse">
                    <div class="config-header">
                        <div class="config-icon">
                            <i data-lucide="shield-alert"></i>
                        </div>
                        <h3>allowAbuse</h3>
                    </div>
                    <p>Controls detection of offensive language, harassment, hate speech, and threatening language.</p>
                    <span class="default">Default: false</span>
                </div>

                <div class="config-card config-phone">
                    <div class="config-header">
                        <div class="config-icon">
                            <i data-lucide="phone"></i>
                        </div>
                        <h3>allowPhone</h3>
                    </div>
                    <p>Detects phone numbers in various formats including international, obfuscated, and spelled out.</p>
                    <span class="default">Default: false</span>
                </div>

                <div class="config-card config-email">
                    <div class="config-header">
                        <div class="config-icon">
                            <i data-lucide="mail"></i>
                        </div>
                        <h3>allowEmail</h3>
                    </div>
                    <p>Detects email addresses including standard formats and obfuscated variations.</p>
                    <span class="default">Default: false</span>
                </div>

                <div class="config-card config-physical">
                    <div class="config-header">
                        <div class="config-icon">
                            <i data-lucide="map-pin"></i>
                        </div>
                        <h3>allowPhysicalInformation</h3>
                    </div>
                    <p>Detects street addresses, credit card numbers, physical locations, and postal codes.</p>
                    <span class="default">Default: false</span>
                </div>

                <div class="config-card config-social">
                    <div class="config-header">
                        <div class="config-icon">
                            <i data-lucide="users"></i>
                        </div>
                        <h3>allowSocialInformation</h3>
                    </div>
                    <p>Detects social media handles, platform references, and social media URLs.</p>
                    <span class="default">Default: false</span>
                </div>

                <div class="config-card config-filtered">
                    <div class="config-header">
                        <div class="config-icon">
                            <i data-lucide="filter"></i>
                        </div>
                        <h3>returnFilteredMessage</h3>
                    </div>
                    <p>When true, returns a censored version with sensitive parts replaced with [REDACTED] tags.</p>
                    <span class="default">Default: false</span>
                </div>
            </div>
        </section>

        <!-- Features Section -->
        <section class="features">
            <h2><i data-lucide="sparkles" class="section-icon"></i> Key Features</h2>
            <div class="features-grid">
                <div class="feature-card feature-ai">
                    <div class="feature-icon">
                        <i data-lucide="brain"></i>
                    </div>
                    <h3>Smart AI Detection</h3>
                    <p>AI-powered analysis with pattern matching for comprehensive coverage</p>
                </div>

                <div class="feature-card feature-speed">
                    <div class="feature-icon">
                        <i data-lucide="zap"></i>
                    </div>
                    <h3>Lightning Fast</h3>
                    <p>Multi-tier caching system delivers responses in milliseconds</p>
                </div>

                <div class="feature-card feature-config">
                    <div class="feature-icon">
                        <i data-lucide="settings"></i>
                    </div>
                    <h3>Highly Configurable</h3>
                    <p>Granular control over what content to allow or block</p>
                </div>

                <div class="feature-card feature-modal">
                    <div class="feature-icon">
                        <i data-lucide="image"></i>
                    </div>
                    <h3>Multi-Modal</h3>
                    <p>Process text, images, and mixed content seamlessly</p>
                </div>

                <div class="feature-card feature-context">
                    <div class="feature-icon">
                        <i data-lucide="network"></i>
                    </div>
                    <h3>Context-Aware</h3>
                    <p>Understands conversation context for better decisions</p>
                </div>

                <div class="feature-card feature-production">
                    <div class="feature-icon">
                        <i data-lucide="activity"></i>
                    </div>
                    <h3>Production Ready</h3>
                    <p>Built-in analytics, monitoring, and error handling</p>
                </div>
            </div>
        </section>

        <!-- Footer -->
        <footer class="footer">
            <div class="footer-content">
                <p>&copy; 2025 FilterX by <strong>Utkarsh</strong>. Built with ❤️ for developers.</p>
                <div class="footer-links">
                    <a href="https://github.com/UtkarshTheDev/FilterX" target="_blank" rel="noopener">Documentation</a>
                    <a href="https://github.com/UtkarshTheDev/FilterX/issues" target="_blank" rel="noopener">Support</a>
                    <a href="https://github.com/UtkarshTheDev" target="_blank" rel="noopener">Creator</a>
                </div>
            </div>
        </footer>
    </div>

    <script>
        function copyToClipboard(elementId) {
            const element = document.getElementById(elementId);
            const text = element.textContent;
            navigator.clipboard.writeText(text).then(() => {
                const button = element.parentElement.querySelector('.copy-btn');
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                button.style.background = '#10b981';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.background = '';
                }, 2000);
            });
        }

        // Add smooth scrolling for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                document.querySelector(this.getAttribute('href')).scrollIntoView({
                    behavior: 'smooth'
                });
            });
        });

        // Add fade-in animation on scroll
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, observerOptions);

        document.querySelectorAll('section').forEach(section => {
            section.style.opacity = '0';
            section.style.transform = 'translateY(20px)';
            section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
            observer.observe(section);
        });

        // Initialize Lucide icons
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    </script>
</body>
</html>`;
}

/**
 * Generate CSS styles for the home page
 */
function getCSS(): string {
  return `
    :root {
      --primary-bg: #0a0a0a;
      --secondary-bg: #1a1a1a;
      --card-bg: #2a2a2a;
      --border-color: #3a3a3a;
      --text-primary: #ffffff;
      --text-secondary: #b0b0b0;
      --text-muted: #808080;
      --accent-primary: #3b82f6;
      --accent-secondary: #10b981;
      --accent-tertiary: #8b5cf6;
      --accent-warning: #f59e0b;
      --accent-danger: #ef4444;
      --accent-twitter: #1da1f2;
      --accent-star: #fbbf24;
      --gradient-primary: linear-gradient(135deg, #1e293b 0%, #334155 100%);
      --gradient-secondary: linear-gradient(135deg, #10b981, #059669);
      --gradient-tertiary: linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%);
      --gradient-hero: radial-gradient(ellipse at top, #1e3a8a 0%, #1e1b4b 50%, #0a0a0a 100%);
      --gradient-text: linear-gradient(135deg, #ffffff 0%, #e2e8f0 50%, #cbd5e1 100%);
      --gradient-button: linear-gradient(135deg, #1e293b, #334155);
      --gradient-star: linear-gradient(135deg, #fbbf24, #f59e0b);
      --gradient-attribution: linear-gradient(135deg, #0f1419 0%, #1a202c 25%, #2d3748 50%, #1a202c 75%, #0f1419 100%);
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
      --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.6);
      --shadow-glow: 0 0 20px rgba(59, 130, 246, 0.3);
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: var(--primary-bg);
      color: var(--text-primary);
      line-height: 1.6;
      overflow-x: hidden;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 32px;
    }

    /* Remove width restrictions for full-width utilization */
    section .container {
      max-width: 1400px;
    }

    /* Hero Section - Full Screen */
    .hero {
      background: var(--gradient-hero);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      position: relative;
      overflow: hidden;
      padding: 120px 0 80px;
    }

    .hero::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="0.5"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)"/></svg>');
      opacity: 0.4;
    }

    .hero::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 800px;
      height: 800px;
      background: radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%);
      border-radius: 50%;
      animation: pulse 4s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.1; }
      50% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.2; }
    }

    .hero-content {
      position: relative;
      z-index: 1;
    }

    .logo {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 15px;
      margin-bottom: 20px;
    }

    .shield {
      font-size: 3rem;
      filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
    }

    .hero h1 {
      font-size: 5rem;
      font-weight: 900;
      margin: 0 0 20px 0;
      background: var(--gradient-text);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      text-shadow: 0 4px 20px rgba(59, 130, 246, 0.3);
      letter-spacing: -0.02em;
      line-height: 1.1;
    }

    .tagline {
      font-size: 1.8rem;
      font-weight: 600;
      margin-bottom: 15px;
      background: linear-gradient(135deg, #ffffff, #e2e8f0);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .description {
      font-size: 1.2rem;
      color: rgba(255, 255, 255, 0.85);
      margin-bottom: 50px;
      max-width: 700px;
      margin-left: auto;
      margin-right: auto;
      line-height: 1.6;
    }

    .stats-bar {
      display: flex;
      justify-content: center;
      gap: 40px;
      margin-top: 40px;
    }

    .stat {
      text-align: center;
    }

    .stat-value {
      display: block;
      font-size: 1.5rem;
      font-weight: 700;
      color: #ffffff;
    }

    .stat-label {
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.7);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Section Styles */
    section {
      padding: 80px 0;
      border-bottom: 1px solid var(--border-color);
    }

    section:last-of-type {
      border-bottom: none;
    }

    h2 {
      font-size: 2.8rem;
      font-weight: 800;
      margin-bottom: 40px;
      text-align: center;
      background: var(--gradient-text);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      letter-spacing: -0.01em;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
    }

    .section-icon {
      width: 40px !important;
      height: 40px !important;
      stroke-width: 2 !important;
      color: rgba(59, 130, 246, 0.9) !important;
      filter: drop-shadow(0 2px 4px rgba(59, 130, 246, 0.3));
      flex-shrink: 0;
    }

    h3 {
      font-size: 1.3rem;
      font-weight: 600;
      margin-bottom: 15px;
      color: var(--text-primary);
    }

    p {
      color: var(--text-secondary);
      margin-bottom: 15px;
    }

    /* Attribution Section */
    .attribution {
      background: linear-gradient(135deg, #000000 0%, #0a0a0a 25%, #1a1a1a 50%, #0a0a0a 75%, #000000 100%);
      text-align: center;
      position: relative;
      overflow: hidden;
    }

    .attribution::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background:
        radial-gradient(ellipse at 20% 30%, rgba(59, 130, 246, 0.15) 0%, transparent 60%),
        radial-gradient(ellipse at 80% 70%, rgba(139, 92, 246, 0.15) 0%, transparent 60%),
        radial-gradient(ellipse at 50% 50%, rgba(16, 185, 129, 0.1) 0%, transparent 50%),
        radial-gradient(ellipse at 30% 80%, rgba(245, 158, 11, 0.08) 0%, transparent 40%),
        radial-gradient(ellipse at 70% 20%, rgba(236, 72, 153, 0.08) 0%, transparent 40%);
      pointer-events: none;
    }

    .attribution::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background:
        linear-gradient(45deg, transparent 30%, rgba(59, 130, 246, 0.03) 50%, transparent 70%),
        linear-gradient(-45deg, transparent 30%, rgba(139, 92, 246, 0.03) 50%, transparent 70%);
      pointer-events: none;
    }

    .creator-info {
      position: relative;
      z-index: 1;
    }

    .creator-name {
      background: var(--gradient-text);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      font-weight: 800;
      font-size: 1.1em;
      letter-spacing: 0.1rem;
      text-shadow: 0 2px 10px rgba(59, 130, 246, 0.3);
    }

    .attribution h2 {
      letter-spacing: 0.05em;
    }

    .social-links {
      display: flex;
      justify-content: center;
      gap: 24px;
      margin-top: 40px;
      position: relative;
      z-index: 1;
    }

    .social-link {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 32px;
      background: var(--gradient-button);
      color: var(--text-primary);
      text-decoration: none;
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      font-weight: 600;
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(10px);
    }

    .social-link::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent);
      transition: left 0.6s ease;
    }

    .social-link:hover::before {
      left: 100%;
    }

    .social-link:hover {
      transform: translateY(-4px) scale(1.05);
      box-shadow:
        0 20px 40px rgba(0, 0, 0, 0.3),
        0 0 0 1px rgba(255, 255, 255, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.3);
    }

    .social-link i {
      width: 24px;
      height: 24px;
      stroke-width: 2;
      transition: all 0.3s ease;
    }

    .social-link:hover i {
      transform: scale(1.1) rotate(5deg);
    }

    .github-link {
      background: linear-gradient(135deg, #24292e 0%, #1a1e22 100%);
      border-color: rgba(255, 255, 255, 0.15);
    }

    .github-link:hover {
      background: linear-gradient(135deg, #2f363d 0%, #24292e 100%);
      box-shadow:
        0 20px 40px rgba(36, 41, 46, 0.4),
        0 0 0 1px rgba(255, 255, 255, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .repo-link {
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
      color: #1a1a1a !important;
      border-color: rgba(251, 191, 36, 0.3);
    }

    .repo-link:hover {
      background: linear-gradient(135deg, #fcd34d 0%, #fbbf24 100%);
      box-shadow:
        0 20px 40px rgba(251, 191, 36, 0.4),
        0 0 0 1px rgba(251, 191, 36, 0.5),
        inset 0 1px 0 rgba(255, 255, 255, 0.3);
      transform: translateY(-4px) scale(1.05);
    }

    .repo-link i {
      color: #1a1a1a !important;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
    }

    .repo-link:hover i {
      transform: scale(1.2) rotate(15deg);
      filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3));
    }

    .twitter-link {
      background: linear-gradient(135deg, #1da1f2 0%, #0d8bd9 100%);
      border-color: rgba(29, 161, 242, 0.3);
    }

    .twitter-link:hover {
      background: linear-gradient(135deg, #1e9bf0 0%, #1da1f2 100%);
      box-shadow:
        0 20px 40px rgba(29, 161, 242, 0.4),
        0 0 0 1px rgba(29, 161, 242, 0.5),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }

    /* Quick Start Section */
    .steps {
      display: grid;
      gap: 30px;
      max-width: 800px;
      margin: 0 auto;
    }

    .step {
      display: flex;
      gap: 20px;
      align-items: flex-start;
    }

    .step-icon {
      flex-shrink: 0;
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
      border: 2px solid rgba(255, 255, 255, 0.2);
    }

    .step-icon i {
      width: 28px;
      height: 28px;
      stroke-width: 2.5;
      color: white !important;
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
    }

    .step-icon:hover {
      transform: scale(1.1) rotate(5deg);
      box-shadow: 0 8px 20px rgba(59, 130, 246, 0.4);
      background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
    }

    .step-content {
      flex: 1;
    }

    /* Code Blocks */
    .code-block {
      position: relative;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      margin-top: 20px;
      overflow: hidden;
      backdrop-filter: blur(10px);
      flex-grow: 1;
      box-shadow:
        inset 0 2px 8px rgba(0, 0, 0, 0.4),
        0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .copy-btn {
      position: absolute;
      top: 16px;
      right: 16px;
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid rgba(59, 130, 246, 0.3);
      color: rgba(59, 130, 246, 0.9);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      backdrop-filter: blur(10px);
      z-index: 10;
    }

    .copy-btn:hover {
      background: rgba(59, 130, 246, 0.2);
      border-color: rgba(59, 130, 246, 0.5);
      color: rgba(59, 130, 246, 1);
      transform: translateY(-2px);
      box-shadow: 0 8px 16px rgba(59, 130, 246, 0.2);
    }

    .copy-btn:active {
      transform: translateY(0);
    }

    pre {
      margin: 0;
      padding: 24px;
      overflow-x: auto;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.85rem;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.9);
      white-space: pre-wrap;
      word-wrap: break-word;
      max-height: 300px;
      overflow-y: auto;
    }

    pre::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }

    pre::-webkit-scrollbar-track {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 3px;
    }

    pre::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
    }

    pre::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    code {
      color: rgba(255, 255, 255, 0.9);
      background: transparent;
      font-weight: 500;
    }

    /* Bento Grid Layout */
    .bento-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      grid-template-rows: repeat(4, minmax(180px, auto));
      gap: 24px;
      margin-top: 60px;
      max-width: 1400px;
      margin-left: auto;
      margin-right: auto;
      padding: 0 20px;
    }

    .bento-card {
      border: 1px solid var(--border-color);
      border-radius: 24px;
      padding: 32px;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(10px);
      display: flex;
      flex-direction: column;
      min-height: 180px;
    }

    /* Left Column Layout */
    .bento-large {
      grid-column: 1 / 3;
      grid-row: 1 / 3;
      min-height: 380px;
    }

    .bento-small:nth-of-type(3) {
      grid-column: 1 / 3;
      grid-row: 3 / 4;
      min-height: 180px;
    }

    .bento-small:nth-of-type(5) {
      grid-column: 1 / 3;
      grid-row: 4 / 5;
      min-height: 180px;
    }

    /* Right Column Layout */
    .bento-medium:nth-of-type(2) {
      grid-column: 3 / 5;
      grid-row: 1 / 3;
      min-height: 380px;
    }

    .bento-medium:nth-of-type(4) {
      grid-column: 3 / 5;
      grid-row: 3 / 5;
      min-height: 380px;
    }

    /* Bento Card Gradient Themes */
    .bento-primary {
      background: linear-gradient(135deg,
        rgba(59, 130, 246, 0.1) 0%,
        rgba(37, 99, 235, 0.05) 50%,
        rgba(30, 64, 175, 0.1) 100%);
      border-color: rgba(59, 130, 246, 0.2);
    }

    .bento-secondary {
      background: linear-gradient(135deg,
        rgba(16, 185, 129, 0.1) 0%,
        rgba(5, 150, 105, 0.05) 50%,
        rgba(4, 120, 87, 0.1) 100%);
      border-color: rgba(16, 185, 129, 0.2);
    }

    .bento-tertiary {
      background: linear-gradient(135deg,
        rgba(139, 92, 246, 0.1) 0%,
        rgba(124, 58, 237, 0.05) 50%,
        rgba(109, 40, 217, 0.1) 100%);
      border-color: rgba(139, 92, 246, 0.2);
    }

    .bento-accent {
      background: linear-gradient(135deg,
        rgba(245, 158, 11, 0.1) 0%,
        rgba(217, 119, 6, 0.05) 50%,
        rgba(180, 83, 9, 0.1) 100%);
      border-color: rgba(245, 158, 11, 0.2);
    }

    .bento-stats {
      background: linear-gradient(135deg,
        rgba(236, 72, 153, 0.1) 0%,
        rgba(219, 39, 119, 0.05) 50%,
        rgba(190, 24, 93, 0.1) 100%);
      border-color: rgba(236, 72, 153, 0.2);
    }

    .bento-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 20px;
      flex-shrink: 0;
    }

    .bento-icon {
      flex-shrink: 0;
      filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
      transition: transform 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .bento-icon i {
      width: 40px;
      height: 40px;
      stroke-width: 1.5;
      color: rgba(255, 255, 255, 0.9);
    }

    .bento-header h3 {
      font-size: 1.4rem;
      font-weight: 700;
      margin-bottom: 8px;
      color: var(--text-primary);
      line-height: 1.2;
    }

    .bento-header p {
      color: var(--text-secondary);
      font-size: 0.95rem;
      margin: 0;
      line-height: 1.4;
    }

    .bento-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg,
        rgba(59, 130, 246, 0.8) 0%,
        rgba(139, 92, 246, 0.8) 50%,
        rgba(16, 185, 129, 0.8) 100%);
      transform: scaleX(0);
      transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 24px 24px 0 0;
    }

    .bento-card::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: radial-gradient(circle at 50% 50%,
        rgba(255, 255, 255, 0.02) 0%,
        transparent 70%);
      opacity: 0;
      transition: opacity 0.4s ease;
      pointer-events: none;
      border-radius: 24px;
    }

    .bento-card:hover {
      transform: translateY(-8px) scale(1.02);
      box-shadow:
        0 20px 40px rgba(0, 0, 0, 0.4),
        0 0 0 1px rgba(255, 255, 255, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .bento-card:hover::before {
      transform: scaleX(1);
    }

    .bento-card:hover::after {
      opacity: 1;
    }

    .bento-card:hover .bento-icon {
      transform: scale(1.1) rotate(5deg);
    }

    /* Enhanced hover effects for different card types */
    .bento-primary:hover {
      border-color: rgba(59, 130, 246, 0.4);
      box-shadow:
        0 20px 40px rgba(59, 130, 246, 0.2),
        0 0 0 1px rgba(59, 130, 246, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .bento-secondary:hover {
      border-color: rgba(16, 185, 129, 0.4);
      box-shadow:
        0 20px 40px rgba(16, 185, 129, 0.2),
        0 0 0 1px rgba(16, 185, 129, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .bento-tertiary:hover {
      border-color: rgba(139, 92, 246, 0.4);
      box-shadow:
        0 20px 40px rgba(139, 92, 246, 0.2),
        0 0 0 1px rgba(139, 92, 246, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .bento-accent:hover {
      border-color: rgba(245, 158, 11, 0.4);
      box-shadow:
        0 20px 40px rgba(245, 158, 11, 0.2),
        0 0 0 1px rgba(245, 158, 11, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .bento-stats:hover {
      border-color: rgba(236, 72, 153, 0.4);
      box-shadow:
        0 20px 40px rgba(236, 72, 153, 0.2),
        0 0 0 1px rgba(236, 72, 153, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    /* Grid Layouts */
    .config-grid, .features-grid {
      display: grid;
      gap: 40px;
      margin-top: 60px;
      justify-items: center;
    }

    .config-grid {
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      max-width: 1200px;
      margin: 60px auto 0;
    }

    .features-grid {
      grid-template-columns: repeat(3, 1fr);
      max-width: 1200px;
      margin: 60px auto 0;
    }

    /* Handle odd number of items in features grid */
    .features-grid .feature-card:nth-last-child(1):nth-child(odd) {
      grid-column: 2;
    }

    .features-grid .feature-card:nth-last-child(2):nth-child(even) {
      grid-column: 1 / 3;
      justify-self: center;
    }

    /* Card Styles */
    .endpoint-card, .config-card, .feature-card {
      border: 1px solid var(--border-color);
      border-radius: 20px;
      padding: 32px;
      transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(10px);
      width: 100%;
      max-width: 400px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      min-height: 200px;
    }

    .endpoint-card {
      max-width: 480px;
      padding: 40px;
    }

    .config-card {
      max-width: 380px;
      text-align: left;
      align-items: flex-start;
    }

    .feature-card {
      max-width: 350px;
    }

    .endpoint-card::before, .config-card::before, .feature-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg,
        rgba(59, 130, 246, 0.8) 0%,
        rgba(139, 92, 246, 0.8) 50%,
        rgba(16, 185, 129, 0.8) 100%);
      transform: scaleX(0);
      transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      border-radius: 20px 20px 0 0;
    }

    .endpoint-card::after, .config-card::after, .feature-card::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: radial-gradient(circle at 50% 50%,
        rgba(255, 255, 255, 0.02) 0%,
        transparent 70%);
      opacity: 0;
      transition: opacity 0.4s ease;
      pointer-events: none;
      border-radius: 20px;
    }

    .endpoint-card:hover, .config-card:hover, .feature-card:hover {
      transform: translateY(-8px) scale(1.02);
      box-shadow:
        0 20px 40px rgba(0, 0, 0, 0.4),
        0 0 0 1px rgba(255, 255, 255, 0.1),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .endpoint-card:hover::before, .config-card:hover::before, .feature-card:hover::before {
      transform: scaleX(1);
    }

    .endpoint-card:hover::after, .config-card:hover::after, .feature-card:hover::after {
      opacity: 1;
    }

    .endpoint-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 15px;
    }

    .method {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .method.post {
      background: var(--accent-warning);
      color: white;
    }

    .method.get {
      background: var(--accent-secondary);
      color: white;
    }

    .path {
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 0.9rem;
      color: var(--text-primary);
      font-weight: 600;
    }

    .endpoint-description {
      color: var(--text-secondary);
      margin-bottom: 15px;
    }

    .config-intro {
      text-align: center;
      font-size: 1.1rem;
      margin-bottom: 30px;
      padding: 20px;
      background: var(--secondary-bg);
      border-radius: 8px;
      border-left: 4px solid var(--accent-warning);
    }

    .config-intro code {
      background: var(--card-bg);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9rem;
    }

    .default {
      position: absolute;
      top: 8px;
      right: 8px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      border: 1px solid rgba(239, 68, 68, 0.3);
      box-shadow:
        0 4px 12px rgba(239, 68, 68, 0.3),
        0 2px 4px rgba(0, 0, 0, 0.2);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      z-index: 10;
      backdrop-filter: blur(10px);
      transition: all 0.3s ease;
    }

    .default::before {
      content: '';
      width: 5px;
      height: 5px;
      background: rgba(255, 255, 255, 0.9);
      border-radius: 50%;
      flex-shrink: 0;
      box-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
    }

    .config-card:hover .default {
      transform: scale(1.05);
      box-shadow:
        0 6px 16px rgba(239, 68, 68, 0.4),
        0 3px 6px rgba(0, 0, 0, 0.3);
    }

    /* Config Card Header and Icon Styling */
    .config-header {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
      justify-content: flex-start;
      text-align: left;
    }

    .config-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.05) 100%);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
      transition: all 0.3s ease;
    }

    .config-icon i {
      width: 28px;
      height: 28px;
      stroke-width: 2.5;
      color: white !important;
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
    }

    .config-card:hover .config-icon {
      transform: scale(1.1) rotate(5deg);
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.25) 0%, rgba(255, 255, 255, 0.15) 100%);
      border-color: rgba(255, 255, 255, 0.3);
    }

    .config-header h3 {
      margin: 0;
      text-align: left;
    }

    /* Config Card Gradient Themes */
    .config-abuse {
      background: linear-gradient(135deg,
        rgba(239, 68, 68, 0.1) 0%,
        rgba(220, 38, 38, 0.05) 50%,
        rgba(185, 28, 28, 0.1) 100%);
      border-color: rgba(239, 68, 68, 0.2);
    }

    .config-abuse:hover {
      border-color: rgba(239, 68, 68, 0.4);
      box-shadow:
        0 20px 40px rgba(239, 68, 68, 0.2),
        0 0 0 1px rgba(239, 68, 68, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .config-phone {
      background: linear-gradient(135deg,
        rgba(59, 130, 246, 0.1) 0%,
        rgba(37, 99, 235, 0.05) 50%,
        rgba(30, 64, 175, 0.1) 100%);
      border-color: rgba(59, 130, 246, 0.2);
    }

    .config-phone:hover {
      border-color: rgba(59, 130, 246, 0.4);
      box-shadow:
        0 20px 40px rgba(59, 130, 246, 0.2),
        0 0 0 1px rgba(59, 130, 246, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .config-email {
      background: linear-gradient(135deg,
        rgba(16, 185, 129, 0.1) 0%,
        rgba(5, 150, 105, 0.05) 50%,
        rgba(4, 120, 87, 0.1) 100%);
      border-color: rgba(16, 185, 129, 0.2);
    }

    .config-email:hover {
      border-color: rgba(16, 185, 129, 0.4);
      box-shadow:
        0 20px 40px rgba(16, 185, 129, 0.2),
        0 0 0 1px rgba(16, 185, 129, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .config-physical {
      background: linear-gradient(135deg,
        rgba(245, 158, 11, 0.1) 0%,
        rgba(217, 119, 6, 0.05) 50%,
        rgba(180, 83, 9, 0.1) 100%);
      border-color: rgba(245, 158, 11, 0.2);
    }

    .config-physical:hover {
      border-color: rgba(245, 158, 11, 0.4);
      box-shadow:
        0 20px 40px rgba(245, 158, 11, 0.2),
        0 0 0 1px rgba(245, 158, 11, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .config-social {
      background: linear-gradient(135deg,
        rgba(139, 92, 246, 0.1) 0%,
        rgba(124, 58, 237, 0.05) 50%,
        rgba(109, 40, 217, 0.1) 100%);
      border-color: rgba(139, 92, 246, 0.2);
    }

    .config-social:hover {
      border-color: rgba(139, 92, 246, 0.4);
      box-shadow:
        0 20px 40px rgba(139, 92, 246, 0.2),
        0 0 0 1px rgba(139, 92, 246, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .config-filtered {
      background: linear-gradient(135deg,
        rgba(236, 72, 153, 0.1) 0%,
        rgba(219, 39, 119, 0.05) 50%,
        rgba(190, 24, 93, 0.1) 100%);
      border-color: rgba(236, 72, 153, 0.2);
    }

    .config-filtered:hover {
      border-color: rgba(236, 72, 153, 0.4);
      box-shadow:
        0 20px 40px rgba(236, 72, 153, 0.2),
        0 0 0 1px rgba(236, 72, 153, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .feature-icon {
      margin-bottom: 20px;
      filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
      transition: transform 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .feature-icon i {
      width: 48px;
      height: 48px;
      stroke-width: 1.5;
      color: rgba(255, 255, 255, 0.9);
    }

    .feature-card:hover .feature-icon {
      transform: scale(1.1) rotate(5deg);
    }

    .feature-card h3 {
      text-align: center;
      margin-bottom: 10px;
    }

    .feature-card p {
      text-align: center;
      font-size: 0.95rem;
    }

    /* Feature Card Gradient Themes */
    .feature-ai {
      background: linear-gradient(135deg,
        rgba(59, 130, 246, 0.1) 0%,
        rgba(37, 99, 235, 0.05) 50%,
        rgba(30, 64, 175, 0.1) 100%);
      border-color: rgba(59, 130, 246, 0.2);
    }

    .feature-ai:hover {
      border-color: rgba(59, 130, 246, 0.4);
      box-shadow:
        0 20px 40px rgba(59, 130, 246, 0.2),
        0 0 0 1px rgba(59, 130, 246, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .feature-speed {
      background: linear-gradient(135deg,
        rgba(245, 158, 11, 0.1) 0%,
        rgba(217, 119, 6, 0.05) 50%,
        rgba(180, 83, 9, 0.1) 100%);
      border-color: rgba(245, 158, 11, 0.2);
    }

    .feature-speed:hover {
      border-color: rgba(245, 158, 11, 0.4);
      box-shadow:
        0 20px 40px rgba(245, 158, 11, 0.2),
        0 0 0 1px rgba(245, 158, 11, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .feature-config {
      background: linear-gradient(135deg,
        rgba(139, 92, 246, 0.1) 0%,
        rgba(124, 58, 237, 0.05) 50%,
        rgba(109, 40, 217, 0.1) 100%);
      border-color: rgba(139, 92, 246, 0.2);
    }

    .feature-config:hover {
      border-color: rgba(139, 92, 246, 0.4);
      box-shadow:
        0 20px 40px rgba(139, 92, 246, 0.2),
        0 0 0 1px rgba(139, 92, 246, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .feature-modal {
      background: linear-gradient(135deg,
        rgba(16, 185, 129, 0.1) 0%,
        rgba(5, 150, 105, 0.05) 50%,
        rgba(4, 120, 87, 0.1) 100%);
      border-color: rgba(16, 185, 129, 0.2);
    }

    .feature-modal:hover {
      border-color: rgba(16, 185, 129, 0.4);
      box-shadow:
        0 20px 40px rgba(16, 185, 129, 0.2),
        0 0 0 1px rgba(16, 185, 129, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .feature-context {
      background: linear-gradient(135deg,
        rgba(236, 72, 153, 0.1) 0%,
        rgba(219, 39, 119, 0.05) 50%,
        rgba(190, 24, 93, 0.1) 100%);
      border-color: rgba(236, 72, 153, 0.2);
    }

    .feature-context:hover {
      border-color: rgba(236, 72, 153, 0.4);
      box-shadow:
        0 20px 40px rgba(236, 72, 153, 0.2),
        0 0 0 1px rgba(236, 72, 153, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .feature-production {
      background: linear-gradient(135deg,
        rgba(34, 197, 94, 0.1) 0%,
        rgba(22, 163, 74, 0.05) 50%,
        rgba(21, 128, 61, 0.1) 100%);
      border-color: rgba(34, 197, 94, 0.2);
    }

    .feature-production:hover {
      border-color: rgba(34, 197, 94, 0.4);
      box-shadow:
        0 20px 40px rgba(34, 197, 94, 0.2),
        0 0 0 1px rgba(34, 197, 94, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    /* Footer */
    .footer {
      background: linear-gradient(145deg, 
        rgba(10, 10, 10, 0.95) 0%,
        rgba(20, 20, 20, 0.98) 25%,
        rgba(25, 25, 25, 0.99) 50%,
        rgba(20, 20, 20, 0.98) 75%,
        rgba(10, 10, 10, 0.95) 100%
      );
      padding: 40px 0 30px;
      text-align: center;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .footer-content p {
      margin-bottom: 20px;
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.9rem;
    }

    .footer-links {
      display: flex;
      justify-content: center;
      gap: 30px;
      margin-bottom: 15px;
    }

    .footer-links a {
      color: rgba(255, 255, 255, 0.6);
      text-decoration: none;
      transition: color 0.3s ease;
      font-weight: 500;
    }

    .footer-links a:hover {
      color: rgba(59, 130, 246, 0.9);
    }

    .footer-copyright {
      margin-top: 20px;
      padding-top: 15px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.5);
      font-size: 0.8rem;
    }

    /* Responsive Design */
    @media (max-width: 768px) {
      .hero {
        min-height: 90vh;
        padding: 100px 0 60px;
      }

      .hero h1 {
        font-size: 3.5rem;
      }

      .tagline {
        font-size: 1.4rem;
      }

      .description {
        font-size: 1.1rem;
      }

      .stats-bar {
        flex-direction: column;
        gap: 20px;
        align-items: center;
      }

      .social-links {
        flex-direction: column;
        align-items: center;
        gap: 15px;
      }

      .step {
        flex-direction: column;
        text-align: center;
      }

      .endpoints-grid, .config-grid, .features-grid {
        grid-template-columns: 1fr;
        max-width: 420px;
        gap: 24px;
      }

      .features-grid .feature-card:nth-last-child(1):nth-child(odd),
      .features-grid .feature-card:nth-last-child(2):nth-child(even),
      .features-grid .feature-card:nth-last-child(1):nth-child(even) {
        grid-column: 1;
        justify-self: center;
      }

      .footer-links {
        flex-direction: column;
        gap: 15px;
      }

      h2 {
        font-size: 2.2rem;
      }

      .container {
        padding: 0 20px;
      }

      .bento-grid {
        grid-template-columns: repeat(2, 1fr);
        grid-template-rows: repeat(5, minmax(180px, auto));
        gap: 20px;
        padding: 0 10px;
      }

      .bento-large {
        grid-column: 1 / 3;
        grid-row: 1 / 2;
        min-height: 180px;
      }

      .bento-medium:nth-of-type(2) {
        grid-column: 1 / 3;
        grid-row: 2 / 3;
        min-height: 180px;
      }

      .bento-small:nth-of-type(3) {
        grid-column: 1 / 2;
        grid-row: 3 / 4;
        min-height: 180px;
      }

      .bento-medium:nth-of-type(4) {
        grid-column: 1 / 3;
        grid-row: 4 / 5;
        min-height: 180px;
      }

      .bento-small:nth-of-type(5) {
        grid-column: 2 / 3;
        grid-row: 3 / 4;
        min-height: 180px;
      }

      .config-grid, .features-grid {
        gap: 28px;
      }
    }

    @media (max-width: 480px) {
      .hero {
        min-height: 85vh;
        padding: 80px 0 50px;
      }

      .hero h1 {
        font-size: 2.8rem;
      }

      .tagline {
        font-size: 1.2rem;
      }

      .description {
        font-size: 1rem;
      }

      .shield {
        font-size: 2.5rem;
      }

      section {
        padding: 50px 0;
      }

      h2 {
        font-size: 1.8rem;
      }

      .social-link {
        padding: 12px 20px;
        font-size: 0.9rem;
      }

      .features-grid {
        max-width: 320px;
      }

      .bento-grid {
        grid-template-columns: 1fr;
        grid-template-rows: repeat(5, minmax(160px, auto));
        gap: 16px;
        padding: 0 5px;
      }

      .bento-large, .bento-medium, .bento-small {
        grid-column: span 1;
        grid-row: span 1;
        min-height: 160px;
      }

      .bento-card {
        padding: 20px;
      }

      .bento-header {
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 12px;
        margin-bottom: 16px;
      }

      .bento-icon {
        font-size: 2rem;
      }

      .bento-header h3 {
        font-size: 1.2rem;
        text-align: center;
      }

      .bento-header p {
        font-size: 0.9rem;
        text-align: center;
      }

      .feature-card, .config-card, .endpoint-card {
        max-width: 100%;
        padding: 20px;
      }
    }
  `;
}
