"""
SSE (Server-Sent Events) manager — replaces WebSocket for pipeline data push.

Each connected client gets its own asyncio.Queue. The pipeline worker
pushes JSON events into all queues; the SSE endpoint drains its queue
and yields SSE-formatted text.

Much simpler than WebSocket: no framing protocol, no handshake, browser
auto-reconnect via EventSource API.
"""

import asyncio
import json
from typing import Dict, Any, List

from utils.logger import setup_logger

logger = setup_logger(__name__)


class SSEManager:
    """
    Manages SSE client queues. Thread-safe for cross-thread push
    (pipeline worker threads → asyncio queues).
    """

    def __init__(self):
        self._queues: List[asyncio.Queue] = []
        self._lock = asyncio.Lock()

    @property
    def client_count(self) -> int:
        return len(self._queues)

    async def subscribe(self) -> asyncio.Queue:
        """Register a new SSE client. Returns its personal event queue."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=256)
        async with self._lock:
            self._queues.append(queue)
        logger.info(f"SSE client connected (total: {len(self._queues)})")
        return queue

    async def unsubscribe(self, queue: asyncio.Queue) -> None:
        """Remove a disconnected SSE client."""
        async with self._lock:
            if queue in self._queues:
                self._queues.remove(queue)
        logger.info(f"SSE client disconnected (total: {len(self._queues)})")

    def broadcast(self, data: Dict[str, Any]) -> None:
        """
        Push an event to ALL connected clients.

        Safe to call from any thread — uses put_nowait which is
        thread-safe on asyncio.Queue.
        """
        event_json = json.dumps(data, default=str)
        dead: List[asyncio.Queue] = []

        for q in self._queues:
            try:
                q.put_nowait(event_json)
            except asyncio.QueueFull:
                # Client is too slow — drop oldest, push newest
                try:
                    q.get_nowait()
                    q.put_nowait(event_json)
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    dead.append(q)
            except Exception:
                dead.append(q)

        # Schedule cleanup of dead queues
        if dead:
            for q in dead:
                try:
                    self._queues.remove(q)
                except ValueError:
                    pass


# Singleton — imported by pipeline.py and main.py
sse_manager = SSEManager()
