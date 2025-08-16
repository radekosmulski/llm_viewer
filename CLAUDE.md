# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an LLM API request viewer/dashboard that consists of:
- A proxy server that intercepts and logs API requests to LLM providers (proxy.py)
- A real-time dashboard web application for viewing the logged requests (dashboard.py)
- Web frontend for displaying requests in both chat and JSON formats (static/)

## Development Commands

### Running the proxy server
```bash
python3 proxy.py --port 8888 --target https://api.anthropic.com
```

### Running the dashboard
```bash
python3 dashboard.py
```
Dashboard will be available at http://localhost:8000

## Architecture

### Core Components

1. **proxy.py**: HTTP proxy server that:
   - Forwards requests to target API endpoints (default: Anthropic API)
   - Logs all request/response pairs to log.jsonl
   - Supports gzipped responses
   - Configurable port and target URL via command line arguments

2. **dashboard.py**: FastAPI application that:
   - Serves the web dashboard at port 8000
   - Uses WebSocket for real-time updates when log.jsonl changes
   - Implements file watching using watchdog library
   - Sends initial log entries on WebSocket connection

3. **static/js/dashboard.js**: Frontend JavaScript that:
   - Manages WebSocket connection with auto-reconnect
   - Provides navigation through logged requests
   - Supports two view modes: Chat View (formatted messages) and Raw JSON
   - Handles various LLM API formats (OpenAI/OpenRouter and Claude)

### Data Flow
1. Client makes API request → proxy.py intercepts → forwards to API → logs to log.jsonl
2. dashboard.py watches log.jsonl → detects changes → broadcasts via WebSocket
3. Frontend receives updates → displays in real-time

## Dependencies

Python packages required:
- fastapi
- uvicorn
- watchdog

Frontend uses:
- marked.js (CDN) for markdown rendering
- Native WebSocket API for real-time updates