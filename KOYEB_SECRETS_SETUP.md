# Koyeb Secrets Setup for BusGo

This document explains how to set up the PID API key as a secret in Koyeb for the BusGo application.

## Overview

The BusGo backend has been updated to support Koyeb secrets with fallback to environment variables. The application will:

1. First check for the API key in Koyeb secrets at `/run/secrets/pid_api_key`
2. If not found, fall back to the `PID_API_KEY` environment variable
3. If neither is available, the application will start but API calls will fail

## Setting up the Secret in Koyeb

### Method 1: Using Koyeb Web Interface

1. Go to your Koyeb dashboard
2. Navigate to your BusGo app
3. Go to the "Secrets" tab
4. Click "Create Secret"
5. Set the following values:
   - **Name**: `pid_api_key`
   - **Value**: Your PID API key from https://api.golemio.cz/
6. Save the secret

### Method 2: Using Koyeb CLI

```bash
# Install Koyeb CLI if you haven't already
# Follow instructions at: https://www.koyeb.com/docs/developing/cli

# Create the secret
koyeb secrets create pid_api_key --value "your_api_key_here"

# Link the secret to your app
koyeb app update your-app-name --secret pid_api_key
```

## Environment Variables (Fallback)

If you prefer to use environment variables instead of secrets, you can set the `PID_API_KEY` environment variable in your Koyeb app settings:

1. Go to your Koyeb dashboard
2. Navigate to your BusGo app
3. Go to the "Environment variables" section
4. Add:
   - **Name**: `PID_API_KEY`
   - **Value**: Your PID API key from https://api.golemio.cz/

## Verification

When the application starts, you'll see one of these messages in the logs:

- `[SECRETS] API key loaded from Koyeb secrets` - Secret is being used
- `[ENV] API key loaded from environment variable` - Environment variable is being used
- `[WARNING] No API key found in secrets or environment variables` - No API key configured

The startup banner will also show the source:
- `Loaded from Koyeb Secrets`
- `Loaded from Environment`
- `NOT FOUND - Check secrets or .env file`

## Getting a PID API Key

1. Go to https://api.golemio.cz/
2. Register for an account
3. Request API access
4. Copy your API key

## Security Notes

- Secrets are encrypted server-side by Koyeb
- Environment variables are also secure but secrets provide additional encryption
- Never commit API keys to your repository
- Use secrets for production deployments
- Environment variables are fine for development/testing 