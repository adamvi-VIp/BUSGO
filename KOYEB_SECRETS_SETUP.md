# Koyeb Secrets Setup for BusGo

This document explains how to set up the PID API key as a secret in Koyeb for the BusGo application.

## Overview

The BusGo backend has been updated to support Koyeb secrets. According to [Koyeb's documentation](https://www.koyeb.com/docs/reference/secrets), secrets are used as environment variables in the application. The application will:

1. Check for the `PID_API_KEY` environment variable (which can be set as a secret)
2. If not found, the application will start but API calls will fail

## Setting up the Secret in Koyeb

### Method 1: Using Koyeb Web Interface

1. Go to your Koyeb dashboard
2. Navigate to your BusGo app
3. Go to the "Secrets" tab
4. Click "Create Secret"
5. Set the following values:
   - **Name**: `PID_API_KEY`
   - **Value**: Your PID API key from https://api.golemio.cz/
6. Save the secret

### Method 2: Using Koyeb CLI

```bash
# Install Koyeb CLI if you haven't already
# Follow instructions at: https://www.koyeb.com/docs/developing/cli

# Create the secret
koyeb secrets create PID_API_KEY --value "your_api_key_here"

# Link the secret to your app
koyeb app update your-app-name --secret PID_API_KEY
```

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

- `[ENV] API key loaded from environment variable` - API key is loaded (from secret or env var)
- `[WARNING] No API key found in environment variables` - No API key configured

The startup banner will also show:
- `Loaded Successfully` - API key is available
- `NOT FOUND - Check Koyeb secrets or .env file` - No API key configured

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