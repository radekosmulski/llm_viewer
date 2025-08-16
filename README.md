# LLM Request Viewer

A real-time dashboard for monitoring LLM API requests and responses.

## Quick Start

1. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Start the proxy server**
   ```bash
   python proxy.py
   ```
   The proxy runs on `http://localhost:8888` by default

3. **Start the dashboard** (in a new terminal)
   ```bash
   python dashboard.py
   ```
   
4. **Configure your LLM client** to use the proxy:
   ```python
   from anthropic import Anthropic
   
   client = Anthropic(base_url="http://localhost:8888")
   # Now all requests will be logged and visible in the dashboard
   ```

5. **View the dashboard** at http://localhost:8000

## Features

- Real-time request/response monitoring
- Chat view and raw JSON view modes
- Request history navigation
- Support for Anthropic, OpenAI, and OpenRouter APIs

## Custom Proxy Targets

To proxy different LLM providers:
```bash
python proxy.py --target https://api.openai.com/v1
```