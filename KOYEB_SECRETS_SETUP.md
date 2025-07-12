# Koyeb Secrets Setup for BusGo

This document explains how to set up the PID API key as a secret in Koyeb for the BusGo application, following Koyeb's official secrets management approach.

## Overview

The BusGo backend is designed to work with Koyeb's secrets system. According to [Koyeb's official documentation](https://www.koyeb.com/docs/reference/secrets), secrets are injected as environment variables at runtime. The application will:

1. Check for the `PID_API_KEY` environment variable (which can be set as a secret)
2. If not found, the application will start but API calls will fail

## How Koyeb Secrets Work

Koyeb secrets are **organization-wide** and are injected as **environment variables** at runtime. They are **not available during build time**. The process is:

1. Create a secret in your Koyeb organization
2. Attach the secret to your service as an environment variable
3. Koyeb injects the secret's value as an environment variable at runtime
4. Your application reads the environment variable normally

## Setting up the Secret in Koyeb

### Method 1: Using Koyeb Web Interface

1. Go to your Koyeb dashboard
2. Navigate to the "Secrets" page (top navigation bar)
3. Click "Add secret"
4. Set the following values:
   - **Name**: `PID_API_KEY`
   - **Value**: Your PID API key from https://api.golemio.cz/
5. Click "Create Secret"
6. **Important**: The secret is now created but must be attached to your service

### Method 2: Using Koyeb CLI

```bash
# Install Koyeb CLI if you haven't already
# Follow instructions at: https://www.koyeb.com/docs/developing/cli

# Create the secret
koyeb secret create PID_API_KEY --value "your_api_key_here"

# List secrets to verify
koyeb secret list
```

## Attaching Secrets to Your Service

### Via Web Interface

1. Go to your BusGo app/service in Koyeb dashboard
2. Go to "Environment variables and files" section
3. Click "Add variable"
4. Set:
   - **Name**: `PID_API_KEY`
   - **Type**: Change from "Plaintext" to "Secret"
   - **Value**: Select your `PID_API_KEY` secret from the dropdown
5. Save the service configuration

### Via CLI

```bash
# Create/update your service with the secret attached
koyeb service create busgo-backend --app busgo \
  --docker your-registry/busgo-backend:latest \
  --env PID_API_KEY=@PID_API_KEY

# Or update existing service
koyeb service update busgo-backend --env PID_API_KEY=@PID_API_KEY
```

**Important**: The `@` prefix tells Koyeb to use the secret's value, not the literal string.

## Environment Variables (Alternative)

If you prefer to use environment variables instead of secrets, you can set the `PID_API_KEY` environment variable in your Koyeb app settings:

1. Go to your Koyeb dashboard
2. Navigate to your BusGo app
3. Go to the "Environment variables" section
4. Add:
   - **Name**: `PID_API_KEY`
   - **Value**: Your PID API key from https://api.golemio.cz/

## Verification

When the application starts, you'll see one of these messages in the logs:

- `[INFO] PID API Key loaded successfully from environment variable.` - API key is loaded
- `[FATAL] PID_API_KEY is not defined. Please set it in Koyeb secrets or in a local .env file.` - No API key configured

The startup banner will also show:
- `Loaded Successfully` - API key is available
- `NOT FOUND!` - No API key configured

## Debug Information

If the API key is not found, the application will show debug information:
- Current `NODE_ENV` setting
- Total number of environment variables
- All environment variables containing "PID", "API", or "KEY"

## Getting a PID API Key

1. Go to https://api.golemio.cz/
2. Register for an account
3. Request API access
4. Copy your API key

## Troubleshooting

### If the API key is not being detected:

1. **Check Secret Creation**: Verify the secret exists in your Koyeb organization
2. **Check Secret Attachment**: Make sure the secret is attached to your service as an environment variable
3. **Verify Secret Name**: The secret must be named exactly `PID_API_KEY` (case sensitive)
4. **Check Service Configuration**: Ensure the environment variable is set to use the secret (not plaintext)
5. **Redeploy**: Redeploy your app after creating/linking the secret
6. **View Logs**: Check the application logs for debug information

### Common Issues:

- **Secret not attached**: The secret exists but isn't linked to your service
- **Wrong variable name**: Environment variable must be named `PID_API_KEY`
- **Build vs Runtime**: Secrets are only available at runtime, not during Docker build
- **Case sensitivity**: Secret and environment variable names are case-sensitive

## Security Notes

- Secrets are encrypted server-side by Koyeb
- Environment variables are also secure but secrets provide additional encryption
- Never commit API keys to your repository
- Use secrets for production deployments
- Environment variables are fine for development/testing
- Secrets are organization-wide and reusable across multiple services

## Local Development

For local development, create a `.env` file in your project root:

```env
NODE_ENV=development
PID_API_KEY=your_api_key_here
```

The application will automatically load this file when `NODE_ENV` is not 'production'. 