"""
WebSocket connection manager for the OCR Pipeline.
Handles concurrent client connections and broadcasts.
"""

from fastapi import WebSocket
from typing import List, Dict, Any
import asyncio
import json

from utils.logger import setup_logger

logger = setup_logger(__name__)


class ConnectionManager:
    """
    Manages WebSocket connections and broadcasts.

    Usage from non-async contexts (e.g. pipeline threads):
        asyncio.run_coroutine_threadsafe(
            manager.broadcast(message),
            loop,
        )
    """

    def __init__(self):
        self._connections: List[WebSocket] = []
        self._lock = asyncio.Lock()

    @property
    def client_count(self) -> int:
        return len(self._connections)

    async def connect(self, websocket: WebSocket) -> None:
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            self._connections.append(websocket)

        logger.info(
            f"WebSocket client connected (total: {len(self._connections)})"
        )

        # Send handshake confirmation
        await self._send_json(websocket, {
            "type": "connection_established",
            "payload": {
                "client_count": len(self._connections),
            },
        })

    async def disconnect(self, websocket: WebSocket) -> None:
        """Remove a disconnected client."""
        async with self._lock:
            if websocket in self._connections:
                self._connections.remove(websocket)

        remaining = len(self._connections)
        logger.info(f"WebSocket client disconnected (total: {remaining})")

        # Log when last client leaves — pipeline may auto-stop
        if remaining == 0:
            logger.info(
                "Last WebSocket client disconnected — no live viewers. "
                "Pipeline continues running; stop it via API when needed."
            )

    async def broadcast(self, message: Dict[str, Any]) -> None:
        """Broadcast a JSON message to all connected clients."""
        dead: List[WebSocket] = []

        for ws in self._connections:
            try:
                await self._send_json(ws, message)
            except Exception:
                dead.append(ws)

        # Clean up dead connections
        if dead:
            async with self._lock:
                for ws in dead:
                    if ws in self._connections:
                        self._connections.remove(ws)

    async def _send_json(self, websocket: WebSocket, data: Dict) -> None:
        """Send a JSON payload to a single client."""
        await websocket.send_text(json.dumps(data, default=str))


# Singleton manager instance — imported by pipeline.py
manager = ConnectionManager()
