"""
MQTT Client — subscribes to scale telemetry from the Aedes broker
and feeds weight readings into the CrateStateMachine.

Uses paho-mqtt in a background thread (matches the existing threading
pattern used by pipeline_worker).
"""

import json
import threading
import time
from typing import Optional, Callable

from utils.logger import setup_logger
from utils.config import settings

logger = setup_logger(__name__)


class ScaleMqttClient:
    """
    Subscribes to pineapple/scale1/# topics and extracts weight data.

    Usage:
        from core.crate_state_machine import crate_state_machine
        client = ScaleMqttClient(state_machine=crate_state_machine)
        client.connect()
        ...
        client.disconnect()
    """

    # MQTT topics to subscribe to
    TOPIC_DATA = "pineapple/scale1/data"
    TOPIC_AVAILABILITY = "pineapple/scale1/availability"

    def __init__(self, state_machine=None):
        # Lazy import — paho-mqtt may not be installed yet
        self._client = None
        self._state_machine = state_machine
        self._connected = False
        self._lock = threading.Lock()

        # Configuration
        self._broker_url = getattr(
            settings, "MQTT_BROKER_URL", "mqtt://localhost:1883"
        )
        self._client_id = getattr(
            settings, "MQTT_CLIENT_ID", "python-ocr-backend"
        )
        self._reconnect_period = 5  # seconds

        # Track availability
        self._scale_online: Optional[bool] = None

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def scale_online(self) -> Optional[bool]:
        return self._scale_online

    def connect(self) -> bool:
        """Connect to the MQTT broker and subscribe to scale topics."""
        try:
            import paho.mqtt.client as mqtt
        except ImportError:
            logger.error(
                "paho-mqtt not installed. Run: pip install paho-mqtt>=2.0.0"
            )
            return False

        with self._lock:
            if self._client is not None:
                logger.warning("MQTT client already initialised")
                return self._connected

            self._client = mqtt.Client(
                client_id=self._client_id,
                protocol=mqtt.MQTTv311,
            )
            self._client.on_connect = self._on_connect
            self._client.on_message = self._on_message
            self._client.on_disconnect = self._on_disconnect

            # Enable automatic reconnect
            self._client.reconnect_delay_set(
                min_delay=1, max_delay=30
            )

            try:
                # Parse broker URL — paho expects host, port separately
                url = self._broker_url
                host = "localhost"
                port = 1883

                if "://" in url:
                    url = url.split("://", 1)[1]
                if ":" in url:
                    parts = url.rsplit(":", 1)
                    host = parts[0]
                    try:
                        port = int(parts[1])
                    except ValueError:
                        port = 1883
                else:
                    host = url

                logger.info(f"[MQTT] Connecting to {host}:{port} ...")
                self._client.connect_async(host, port, keepalive=30)
                self._client.loop_start()
                return True

            except Exception as e:
                logger.error(f"[MQTT] Connection failed: {e}")
                self._client = None
                return False

    def disconnect(self) -> None:
        """Disconnect from the MQTT broker."""
        with self._lock:
            if self._client is not None:
                logger.info("[MQTT] Disconnecting ...")
                try:
                    self._client.loop_stop()
                    self._client.disconnect()
                except Exception as e:
                    logger.warning(f"[MQTT] Disconnect error: {e}")
                self._client = None
                self._connected = False
                self._scale_online = None

    # ── callbacks ─────────────────────────────────────────────────────

    def _on_connect(self, client, userdata, flags, rc):
        """Called when the client connects to the broker."""
        if rc == 0:
            self._connected = True
            logger.info(f"[MQTT] Connected to broker at {self._broker_url}")

            # Subscribe to scale data + availability
            client.subscribe(self.TOPIC_DATA, qos=1)
            client.subscribe(self.TOPIC_AVAILABILITY, qos=1)
            logger.info(
                f"[MQTT] Subscribed to {self.TOPIC_DATA}, "
                f"{self.TOPIC_AVAILABILITY}"
            )
        else:
            self._connected = False
            logger.error(f"[MQTT] Connection failed with rc={rc}")

    def _on_disconnect(self, client, userdata, rc):
        """Called when the client disconnects from the broker."""
        self._connected = False
        self._scale_online = None
        if rc != 0:
            logger.warning(
                f"[MQTT] Unexpected disconnect (rc={rc}) — "
                f"auto-reconnect enabled"
            )

    def _on_message(self, client, userdata, msg):
        """Called when a message is received on a subscribed topic."""
        try:
            payload_str = msg.payload.decode("utf-8", errors="replace")

            if msg.topic == self.TOPIC_AVAILABILITY:
                self._scale_online = (
                    payload_str.strip().lower() == "online"
                )
                logger.debug(
                    f"[MQTT] Scale availability: "
                    f"{'online' if self._scale_online else 'offline'}"
                )
                return

            if msg.topic == self.TOPIC_DATA and self._state_machine:
                data = json.loads(payload_str)

                weight_g = data.get("weight_g")
                grade = data.get("grade", "PENDING_FORMULA")

                if weight_g is not None and isinstance(weight_g, (int, float)):
                    weight_g = int(weight_g)
                    self._state_machine.on_weight_reading(weight_g, grade)
                    logger.debug(
                        f"[MQTT] Weight forwarded to state machine: "
                        f"{weight_g}g grade={grade}"
                    )
                else:
                    logger.debug(
                        f"[MQTT] Data message without valid weight_g: "
                        f"{payload_str[:120]}"
                    )

        except json.JSONDecodeError:
            logger.warning(
                f"[MQTT] Invalid JSON on {msg.topic}: "
                f"{msg.payload[:120]}"
            )
        except Exception as e:
            logger.error(f"[MQTT] Message handler error: {e}", exc_info=True)
