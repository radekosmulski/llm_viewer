import http.server
import socketserver
import urllib.request
import threading
import time
import gzip
import json
import argparse
import sys

class ProxyHandler(http.server.BaseHTTPRequestHandler):
    target_url = "https://api.anthropic.com"  # Default to Anthropic (without /v1)
    
    def log_message(self, format, *args):
        pass  # Suppress logs
    
    def do_POST(self):
        self.proxy_request()
    
    def do_GET(self):
        self.proxy_request()
    
    def proxy_request(self):
        request_json = ""
        response_json = None
        
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length) if content_length > 0 else b''
            
            # Print basic info
            print(f"{self.command} {self.path}")
            print(f"Forwarding to: {self.target_url}{self.path}")
            print(f"Headers received: {dict(self.headers)}")
            request_json = body.decode('utf-8', errors='ignore')
            print(f"Body length: {len(body)} bytes")

            # Forward to target URL
            url = f"{self.target_url}{self.path}"
            headers = {k: v for k, v in self.headers.items() 
                      if k.lower() not in ['host', 'connection', 'content-length']}
            
            # Set content-length if we have a body
            if body:
                headers['Content-Length'] = str(len(body))
            
            req = urllib.request.Request(url, data=body, headers=headers, method=self.command)
            
            # Make request
            with urllib.request.urlopen(req) as response:
                response_body = response.read()
                
                # Decompress if gzipped, then decode and pretty-print
                try:
                    if response_body.startswith(b'\x1f\x8b'):
                        decoded_text = gzip.decompress(response_body).decode('utf-8')
                    else:
                        decoded_text = response_body.decode('utf-8')
                    
                    try:
                        response_json = json.loads(decoded_text)
                    except json.JSONDecodeError:
                        response_json = {"raw_response": decoded_text}
                except UnicodeDecodeError:
                    response_json = {"error": "Binary response received", "raw_bytes": len(response_body)}
                except Exception as decode_error:
                    response_json = {"error": f"Decoding error: {str(decode_error)}", "raw_bytes": len(response_body)}

                # Send response back
                self.send_response(response.status)
                for k, v in response.headers.items():
                    if k.lower() not in ['connection', 'transfer-encoding']:
                        self.send_header(k, v)
                self.end_headers()
                self.wfile.write(response_body)
                
        except urllib.error.HTTPError as e:
            error_body = e.read()
            try:
                decoded_error = error_body.decode('utf-8')
                response_json = json.loads(decoded_error)
            except json.JSONDecodeError:
                response_json = {"error": error_body.decode('utf-8', errors='ignore')}
            except UnicodeDecodeError:
                response_json = {"error": "Binary response received", "raw_bytes": len(error_body)}
            
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(error_body)
        except Exception as e:
            print(f"Error: {e}")
            response_json = {"error": str(e)}
            self.send_response(500)
            self.end_headers()

        # append {'request': request_json, 'response': response_json} to log.jsonl
        if response_json is not None:
            with open("log.jsonl", "a") as log_file:
                log_file.write(json.dumps({'request': request_json, 'response': response_json}) + "\n")

def start_proxy(port=8888, target_url="https://api.anthropic.com"):
    """Start the proxy server and keep it running"""
    try:
        # Set the target URL for the proxy handler
        ProxyHandler.target_url = target_url
        
        # Create server with SO_REUSEADDR to avoid "Address already in use" errors
        server = socketserver.TCPServer(("", port), ProxyHandler)
        server.allow_reuse_address = True
        
        # Start in a thread
        thread = threading.Thread(target=server.serve_forever)
        thread.daemon = True
        thread.start()
        
        print(f"✓ Proxy server started on http://localhost:{port}")
        print(f"  Forwarding to: {target_url}")
        print(f"  Configure your client to use: http://localhost:{port}")
        print(f"  Press Ctrl+C to stop\n")
        
        # Keep the main thread alive
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down proxy...")
            server.shutdown()
            
    except OSError as e:
        if "Address already in use" in str(e):
            print(f"Error: Port {port} is already in use!")
            print("Try: 1) Use a different port, or")
            print("     2) Kill the process using this port")
        else:
            print(f"Error starting server: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")

# When running this script directly
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="HTTP proxy server for API requests")
    parser.add_argument("--port", "-p", type=int, default=8888, 
                       help="Port to listen on (default: 8888)")
    parser.add_argument("--target", "-t", type=str, default="https://api.anthropic.com",
                       help="Target URL to proxy to (default: https://api.anthropic.com)")
    
    args = parser.parse_args()
    
    # Remove trailing slash if present
    target_url = args.target.rstrip('/')
    
    start_proxy(args.port, target_url)