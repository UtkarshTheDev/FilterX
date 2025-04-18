# FilterX - Content Moderation API

FilterX is a powerful content moderation API designed to filter potentially harmful or sensitive content from text and images. It combines regex pattern matching, AI-based content analysis, and a caching mechanism to deliver fast and accurate content moderation.

## Features

- **Text Moderation**: Filter sensitive content including abusive language, personal information, etc.
- **Image Analysis**: Detect NSFW or inappropriate content in images
- **Context-Aware Filtering**: Analyze up to 15 previous messages for context
- **Customizable Configuration**: Configure which types of content to filter
- **Filtered Message Generation**: Option to return filtered versions of messages
- **IP-Based API Keys**: Simple API key management based on IP address
- **Rate Limiting**: Protect your API from abuse
- **Public Stats**: View usage statistics to showcase platform reach

## Technology Stack

- **Backend**: Node.js/Express.js with Bun runtime
- **Database**: PostgreSQL via Neon
- **Cache & Stats**: Redis via Upstash
- **AI Integration**: Akash Chat API for text, MoonDream 2B for images

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (>= 1.0.0)
- Neon PostgreSQL database
- Upstash Redis instance

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/filterx.git
   cd filterx
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Set up environment variables:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration details
   ```

4. Run database migrations:

   ```bash
   bun run migrate
   ```

5. Prepare the database with initial data:

   ```bash
   bun run prepare-db
   ```

6. Start the development server:
   ```bash
   bun run dev
   ```

### Available Scripts

- `bun run start` - Start the server
- `bun run dev` - Start the server with watch mode for development
- `bun run build` - Build the project for production
- `bun run prod` - Run the production build
- `bun run migrate` - Run database migrations
- `bun run test` - Run tests
- `bun run lint` - Run ESLint
- `bun run format` - Format code using Prettier
- `bun run analyze` - Analyze bundle size
- `bun run clean` - Clean build directory
- `bun run docker:build` - Build Docker image
- `bun run prepare-db` - Prepare the database with initial data

## API Endpoints

### POST /v1/filter

Filter content for moderation.

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

### GET /v1/apikey

Generate or retrieve API key for the client IP.

```http
GET /v1/apikey
```

### GET /admin/stats

Get public statistics about FilterX usage.

```http
GET /admin/stats
```

## Environment Variables

See `.env.example` for the list of available environment variables.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
