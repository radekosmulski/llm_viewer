import json
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import uvicorn


class LogFileHandler(FileSystemEventHandler):
    """Handles file system events for the log.jsonl file"""
    
    def __init__(self, websocket_manager):
        self.websocket_manager = websocket_manager
        self._loop = None
    
    def set_event_loop(self, loop):
        """Set the event loop from the main thread"""
        self._loop = loop
    
    def on_modified(self, event):
        if not event.is_directory and event.src_path.endswith("log.jsonl"):
            if self._loop and not self._loop.is_closed():
                # Schedule the coroutine in the main event loop
                asyncio.run_coroutine_threadsafe(
                    self.websocket_manager.broadcast_latest_log(), 
                    self._loop
                )


class WebSocketManager:
    """Manages WebSocket connections and broadcasts"""
    
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.log_file = Path("log.jsonl")
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        # Send all log entries immediately upon connection
        all_entries = self.get_all_log_entries()
        try:
            await websocket.send_json({
                "type": "initial",
                "entries": all_entries,
                "total": len(all_entries)
            })
        except Exception:
            self.disconnect(websocket)
    
    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
    
    async def broadcast_latest_log(self):
        """Broadcast the most recent log entry to all connected clients"""
        if not self.active_connections:
            return
        
        latest_entry = self.get_latest_log_entry()
        if latest_entry:
            disconnected = []
            for connection in self.active_connections:
                try:
                    await connection.send_json({
                        "type": "update",
                        "entry": latest_entry
                    })
                except Exception:
                    disconnected.append(connection)
            
            # Remove disconnected clients
            for connection in disconnected:
                self.disconnect(connection)
    
    def get_latest_log_entry(self) -> Optional[Dict[str, Any]]:
        """Read the last line from log.jsonl and return parsed JSON"""
        try:
            if not self.log_file.exists():
                return None
            
            with open(self.log_file, 'r') as f:
                lines = f.readlines()
                if not lines:
                    return None
                
                # Get the last non-empty line
                for line in reversed(lines):
                    line = line.strip()
                    if line:
                        entry = json.loads(line)
                        # Add timestamp for display if not present
                        if 'timestamp' not in entry:
                            entry['timestamp'] = datetime.now().isoformat()
                        return entry
                
                return None
        except Exception as e:
            print(f"Error reading log file: {e}")
            return None
    
    def get_all_log_entries(self) -> list[Dict[str, Any]]:
        """Read all entries from log.jsonl and return as a list"""
        entries = []
        try:
            if not self.log_file.exists():
                return entries
            
            with open(self.log_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            entry = json.loads(line)
                            # Add timestamp for display if not present
                            if 'timestamp' not in entry:
                                entry['timestamp'] = datetime.now().isoformat()
                            entries.append(entry)
                        except json.JSONDecodeError:
                            continue
            
            return entries
        except Exception as e:
            print(f"Error reading log file: {e}")
            return entries


# Initialize WebSocket manager
websocket_manager = WebSocketManager()

# Set up file watcher
log_handler = LogFileHandler(websocket_manager)
observer = Observer()
observer.schedule(log_handler, path=".", recursive=False)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage startup and shutdown events"""
    # Startup
    log_handler.set_event_loop(asyncio.get_running_loop())
    observer.start()
    print("📁 File watcher started - monitoring log.jsonl")
    yield
    # Shutdown
    observer.stop()
    observer.join()


# Initialize FastAPI app
app = FastAPI(title="OpenRouter Request Dashboard", version="1.0.0", lifespan=lifespan)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def get_dashboard():
    """Serve the main dashboard HTML"""
    return FileResponse("static/index.html")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time log updates"""
    await websocket_manager.connect(websocket)
    try:
        while True:
            # Keep the connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        websocket_manager.disconnect(websocket)


if __name__ == "__main__":
    print("🚀 Starting OpenRouter Dashboard...")
    print("📊 Dashboard will be available at: http://localhost:8000")
    print("🔗 WebSocket endpoint: ws://localhost:8000/ws")
    print("📡 Monitoring: log.jsonl")
    print("\nPress Ctrl+C to stop\n")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )