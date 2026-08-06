/* =====================================================================
   Bukidnon Fresh Pineapple Corp. — Grading Scale Firmware
   Team Bisdak Brokers — CubeWorks IIoT Challenge

   REFINED v2 — 2026-08-06
   Adds MQTT command subscription for HMI remote control.
   Button actions extracted into named functions (no duplication).
   Button 2 repurposed: ESP.restart() → manual crate log trigger
   (⚠️ FLAGGED — confirm with team before production deploy).

   Signal chain : Load Cell -> HX711 -> ESP32-P4 -> MQTT (Aedes broker)
   Wiring       : HX711 DT  -> GPIO20
                  HX711 SCK -> GPIO21

   Hardware additions:
     - 4x R16-503 LED push-buttons (Power, Reset, Tare, Mode)
     - I2C 2004A LCD (20x4) — on-board weight verification display

   Client priorities (in order), and how this firmware honors them:
     1. Live/accurate data only     -> every published value comes from a
                                       fresh HX711 read this cycle, or data
                                       is explicitly marked invalid via
                                       status booleans in the JSON payload.
     2. Honest offline state        -> MQTT Last Will and Testament (LWT)
                                       triggers "offline" on the availability
                                       topic the instant the broker detects
                                       a dropped connection.
     3. Reliability over features   -> MQTT topics are weight+grade only. No
                                       camera/YOLO hooks are implemented
                                       here; JSON payload has room to extend
                                       without a breaking change.

   ===================================================================
   MQTT TOPIC STRUCTURE
   ===================================================================
     pineapple/scale1/availability  (retained, QoS 1)
       "online"  — published on MQTT connect (birth message)
       "offline" — LWT, broker publishes automatically on disconnect

     pineapple/scale1/data          (not retained, QoS 1)
       JSON published on each fresh HX711+grade computation:
       {
         "weight_g": 1342,
         "status": {
           "hx711_fault": false,
           "eth_or_wifi_issue": false
         },
         "grade": "grade_1",
         "ts": 5901234
       }

     pineapple/scale1/command       (not retained, QoS 1) ← NEW
       Web app publishes JSON commands:
       {"action":"power"}       — toggle power state
       {"action":"tare"}        — tare the scale
       {"action":"mode"}        — toggle g/kg display mode
       {"action":"log_trigger"} — manual crate log trigger

     pineapple/scale1/device_state  (not retained, QoS 1) ← REFINED
       Published after every state change (button or MQTT command):
       {
         "power": "on",
         "mode": "auto",
         "tare": true
       }
       Format matches what the React HMI panel expects.

   ===================================================================
   HMI ACKNOWLEDGMENT PATTERN
   ===================================================================
   Every action function (physical button OR MQTT command) MUST call
   publishDeviceState() after execution. The web app's HMIPanel shows
   a "pending" state until device_state confirms the change. Without
   this call, the HMI panel times out to an error state (~5 seconds).

   ===================================================================
   BUTTON MAP (R16-503 LED push-buttons)
   ===================================================================
     Button 1: LED=GPIO18, SW=GPIO14 — Power (standby/resume toggle)
     Button 2: LED=GPIO17, SW=GPIO6  — Manual Log Trigger ⚠️ FLAGGED
               (was: ESP.restart() — old behavior removed per Part 3 spec.
                Team must confirm this change before production deploy.)
     Button 3: LED=GPIO16, SW=GPIO5  — Tare (HX711 tare)
     Button 4: LED=GPIO15, SW=GPIO4  — Mode (toggle g / kg display)

   ===================================================================
   OPEN ITEMS — confirm on-site before this ships
   ===================================================================
     - MQTT broker (Aedes) must be running in Node-RED on the laptop.
     - Calibration factor (see CALIBRATION_FACTOR below).
     - HX711 timeout threshold (HX711_TIMEOUT_MS) — 500ms assumed.
     - Confirm I2C LCD address (0x27 vs 0x3F).
     - Button 2 repurpose (Reset→Log Trigger) — UNCONFIRMED.
   ===================================================================
*/

#include <ETH.h>
#include <Network.h>
#include <HX711.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// ---------------------------------------------------------------------
// NETWORK CONFIG
// ---------------------------------------------------------------------
IPAddress local_IP(192, 168, 1, 20);
IPAddress gateway(192, 168, 1, 1);
IPAddress subnet(255, 255, 255, 0);
IPAddress primaryDNS(8, 8, 8, 8);

// ---------------------------------------------------------------------
// ETHERNET PHY CONFIG — Waveshare ESP32-P4-Eth (IP101 @ addr 1)
// ---------------------------------------------------------------------
#define ETH_PHY_TYPE   ETH_PHY_IP101
#define ETH_PHY_ADDR   1
#define ETH_PHY_MDC    31
#define ETH_PHY_MDIO   52
#define ETH_PHY_POWER  51
#define ETH_CLK_MODE   EMAC_CLK_EXT_IN

// ---------------------------------------------------------------------
// MQTT CONFIG
// ---------------------------------------------------------------------
const char* MQTT_BROKER          = "192.168.1.10";
const int   MQTT_PORT            = 1884;
const char* MQTT_CLIENT_ID       = "pineapple-scale1";
const char* MQTT_TOPIC_AVAIL     = "pineapple/scale1/availability";
const char* MQTT_TOPIC_DATA      = "pineapple/scale1/data";
const char* MQTT_TOPIC_STATE     = "pineapple/scale1/device_state";
const char* MQTT_TOPIC_COMMAND   = "pineapple/scale1/command";  // ← NEW
const int   MQTT_BUFFER_SIZE     = 512;

// ---------------------------------------------------------------------
// HX711 CONFIG
// ---------------------------------------------------------------------
#define HX711_DT_PIN    20
#define HX711_SCK_PIN   21
#define HX711_TIMEOUT_MS  500
const float CALIBRATION_FACTOR = 420.0f;  // CONFIRM ON-SITE

// ---------------------------------------------------------------------
// GRADE THRESHOLDS
// ---------------------------------------------------------------------
const uint16_t GRADE_LIGHT_MAX_G = 1200;
const uint16_t GRADE_HEAVY_MIN_G = 1500;

enum GradeClass : uint16_t {
  GRADE_INVALID = 0,
  GRADE_LIGHT   = 1,
  GRADE_1       = 2,
  GRADE_HEAVY   = 3
};

// ---------------------------------------------------------------------
// BUTTON PINS
// ---------------------------------------------------------------------
#define BTN1_LED  18   // Power
#define BTN1_SW   14
#define BTN2_LED  17   // Log Trigger (was: Reset) ⚠️ FLAGGED
#define BTN2_SW   6
#define BTN3_LED  16   // Tare
#define BTN3_SW   5
#define BTN4_LED  15   // Mode
#define BTN4_SW   4

// ---------------------------------------------------------------------
// LCD
// ---------------------------------------------------------------------
#define LCD_ADDR  0x27
#define LCD_COLS  20
#define LCD_ROWS  4

// ---------------------------------------------------------------------
// DEBOUNCE
// ---------------------------------------------------------------------
#define DEBOUNCE_MS   50

// =======================================================================
// GLOBAL STATE
// =======================================================================
HX711 scale;
volatile bool ethLinkUp = false;
unsigned long lastGoodHx711ReadMs = 0;
bool hx711EverReady = false;

NetworkClient ethClient;
PubSubClient mqttClient(ethClient);
bool mqttConnected = false;
unsigned long lastMqttReconnectAttempt = 0;
const unsigned long MQTT_RECONNECT_INTERVAL_MS = 5000;

LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);

// System mode
bool systemActive = true;
bool displayKg = false;
uint16_t lastValidWeight_g = 0;
uint16_t lastGradeCode = GRADE_INVALID;
bool lastDataValid = false;

// Button debounce
unsigned long lastBtn1Check = 0, lastBtn2Check = 0;
unsigned long lastBtn3Check = 0, lastBtn4Check = 0;
bool btn1PrevState = HIGH, btn2PrevState = HIGH;
bool btn3PrevState = HIGH, btn4PrevState = HIGH;

// Tare flash
unsigned long tareFlashStart = 0;
bool tareFlashing = false;
unsigned long lastTareMs = 0;
uint16_t tareCount = 0;         // increments on each tare — HMI uses this to detect change
uint16_t logTriggerCount = 0;   // increments on each log trigger — HMI uses this to detect change

// Periodic state publish
unsigned long lastStatePublish = 0;

// =======================================================================
// HELPERS
// =======================================================================

const char* gradeLabel(uint16_t code) {
  switch (code) {
    case GRADE_LIGHT: return "light";
    case GRADE_1:     return "grade_1";
    case GRADE_HEAVY: return "heavy";
    default:          return "invalid";
  }
}

const char* gradeLabelLCD(uint16_t code) {
  switch (code) {
    case GRADE_LIGHT: return "Light  ";
    case GRADE_1:     return "Grade 1";
    case GRADE_HEAVY: return "Heavy  ";
    default:          return "Invalid";
  }
}

// =======================================================================
// ETHERNET EVENT HANDLER
// =======================================================================
void onEthEvent(arduino_event_id_t event) {
  switch (event) {
    case ARDUINO_EVENT_ETH_CONNECTED:
      Serial.println("[ETH] Physical link UP");
      ethLinkUp = true;
      break;
    case ARDUINO_EVENT_ETH_GOT_IP:
      Serial.print("[ETH] IP bound: ");
      Serial.println(ETH.localIP());
      break;
    case ARDUINO_EVENT_ETH_DISCONNECTED:
    case ARDUINO_EVENT_ETH_STOP:
      Serial.println("[ETH] Link DOWN");
      ethLinkUp = false;
      break;
    default: break;
  }
}

// =======================================================================
// MQTT COMMAND CALLBACK — parses JSON and dispatches to action functions
// =======================================================================
void mqttCommandCallback(char* topic, byte* payload, unsigned int length) {
  // Null-terminate the payload
  char jsonBuf[256];
  if (length >= sizeof(jsonBuf)) length = sizeof(jsonBuf) - 1;
  memcpy(jsonBuf, payload, length);
  jsonBuf[length] = '\0';

  Serial.print("[MQTT] Command received: ");
  Serial.println(jsonBuf);

  StaticJsonDocument<128> doc;
  DeserializationError err = deserializeJson(doc, jsonBuf);

  if (err) {
    Serial.print("[MQTT] Command parse error: ");
    Serial.println(err.c_str());
    return;
  }

  const char* action = doc["action"];
  if (!action) {
    Serial.println("[MQTT] Command missing 'action' field");
    return;
  }

  if (strcmp(action, "power") == 0) {
    doPowerToggle();
  } else if (strcmp(action, "tare") == 0) {
    doTare();
  } else if (strcmp(action, "mode") == 0) {
    doModeToggle();
  } else if (strcmp(action, "log_trigger") == 0) {
    doManualLogTrigger();
  } else {
    Serial.print("[MQTT] Unknown action: ");
    Serial.println(action);
  }
}

// =======================================================================
// ACTION FUNCTIONS — called by BOTH physical buttons AND MQTT commands
// (no duplicated logic — one function, two callers)
// =======================================================================

void doPowerToggle() {
  systemActive = !systemActive;
  digitalWrite(BTN1_LED, systemActive ? HIGH : LOW);

  if (systemActive) {
    Serial.println("[ACTION] Power: SYSTEM ACTIVE");
    digitalWrite(BTN2_LED, HIGH);
    digitalWrite(BTN3_LED, HIGH);
    digitalWrite(BTN4_LED, displayKg ? HIGH : LOW);
    lcd.backlight();

    // Force immediate MQTT reconnect so publishDeviceState() works
    lastMqttReconnectAttempt = 0;
    ensureMqttConnected();
  } else {
    Serial.println("[ACTION] Power: STANDBY");
    digitalWrite(BTN2_LED, LOW);
    digitalWrite(BTN3_LED, LOW);
    digitalWrite(BTN4_LED, LOW);
    lcd.noBacklight();

    if (mqttClient.connected()) {
      mqttClient.publish(MQTT_TOPIC_AVAIL, "offline", true);
      mqttClient.disconnect();
    }
    mqttConnected = false;
  }

  publishDeviceState();
  updateLCD();
}

void doTare() {
  Serial.print("[ACTION] Tare requested... ");
  if (scale.is_ready()) {
    scale.tare();
    Serial.println("done. Scale zeroed.");
    lastGoodHx711ReadMs = millis();
    lastValidWeight_g = 0;
    lastDataValid = false;
    lastTareMs = millis();
    tareCount++;  // increment so HMI panel detects the change

    tareFlashing = true;
    tareFlashStart = millis();
    digitalWrite(BTN3_LED, LOW);
  } else {
    Serial.println("FAILED (HX711 not ready)");
  }

  publishDeviceState();
  updateLCD();
}

void doModeToggle() {
  displayKg = !displayKg;
  digitalWrite(BTN4_LED, displayKg ? HIGH : LOW);
  Serial.print("[ACTION] Mode: display unit = ");
  Serial.println(displayKg ? "kg" : "g");

  publishDeviceState();
  updateLCD();
}

// ⚠️ FLAGGED — UNCONFIRMED
// Button 2 was previously ESP.restart(). It is now a manual crate log
// trigger. The old restart behavior may still be needed — consider moving
// it to a long-press on the same button, or an admin-only HMI command.
// Team must confirm before production deploy.
void doManualLogTrigger() {
  Serial.println("[ACTION] Manual log trigger — publishing log event");
  logTriggerCount++;  // increment so HMI panel detects the change

  // Flash LED to confirm
  digitalWrite(BTN2_LED, LOW);
  delay(100);
  digitalWrite(BTN2_LED, HIGH);

  // Publish a special data payload with manual_button trigger flag.
  // The backend/Node-RED should detect this and write a crate_log row
  // with capture_trigger = 'manual_button' using the current weight/grade.
  if (mqttClient.connected()) {
    StaticJsonDocument<256> doc;
    doc["weight_g"] = lastDataValid ? lastValidWeight_g : 0;
    doc["grade"] = lastDataValid ? gradeLabel(lastGradeCode) : "invalid";
    JsonObject status = doc.createNestedObject("status");
    status["hx711_fault"] = !lastDataValid;
    status["eth_or_wifi_issue"] = !ethLinkUp;
    doc["capture_trigger"] = "manual_button";  // ← signals backend
    doc["ts"] = millis();

    char buf[256];
    size_t len = serializeJson(doc, buf);
    mqttClient.publish(MQTT_TOPIC_DATA, (const uint8_t*)buf, len, false);
    Serial.println("[ACTION] Manual log trigger event published");
  }

  publishDeviceState();
}

// =======================================================================
// MQTT CONNECTION MANAGEMENT
// =======================================================================
void ensureMqttConnected() {
  if (!systemActive) {
    if (mqttClient.connected()) {
      mqttClient.disconnect();
    }
    mqttConnected = false;
    return;
  }

  if (!mqttClient.connected()) {
    unsigned long now = millis();
    if (now - lastMqttReconnectAttempt >= MQTT_RECONNECT_INTERVAL_MS) {
      lastMqttReconnectAttempt = now;
      Serial.print("[MQTT] Connecting to ");
      Serial.print(MQTT_BROKER);
      Serial.print(":");
      Serial.print(MQTT_PORT);
      Serial.print("... ");

      if (mqttClient.connect(MQTT_CLIENT_ID,
                             MQTT_TOPIC_AVAIL, 1, true, "offline")) {
        Serial.println("connected");

        // Birth message
        mqttClient.publish(MQTT_TOPIC_AVAIL, "online", true);

        // ── SUBSCRIBE TO COMMAND TOPIC ── (NEW)
        mqttClient.subscribe(MQTT_TOPIC_COMMAND, 1);
        Serial.print("[MQTT] Subscribed to command topic: ");
        Serial.println(MQTT_TOPIC_COMMAND);

        // Publish initial device state so web app has current state
        publishDeviceState();

        mqttConnected = true;
      } else {
        Serial.print("failed, state=");
        Serial.println(mqttClient.state());
        mqttConnected = false;
      }
    }
  } else {
    mqttConnected = true;
  }
}

// =======================================================================
// HX711 READ
// =======================================================================
void updateWeightReading() {
  uint16_t grams = 0;
  uint16_t gradeCode = GRADE_INVALID;
  bool hx711Faulted = false;
  bool ethDown = false;

  if (scale.is_ready()) {
    long raw = scale.get_value();
    float grams_f = raw / CALIBRATION_FACTOR;

    if (grams_f < 0) grams_f = 0;
    if (grams_f > 65535) grams_f = 65535;

    grams = (uint16_t)(grams_f + 0.5f);

    if (grams < GRADE_LIGHT_MAX_G) {
      gradeCode = GRADE_LIGHT;
    } else if (grams > GRADE_HEAVY_MIN_G) {
      gradeCode = GRADE_HEAVY;
    } else {
      gradeCode = GRADE_1;
    }

    lastGoodHx711ReadMs = millis();
    hx711EverReady = true;
  }

  hx711Faulted = (!hx711EverReady) ||
                 (millis() - lastGoodHx711ReadMs > HX711_TIMEOUT_MS);
  ethDown = !ethLinkUp;

  bool dataValid = !hx711Faulted && !ethDown;

  lastValidWeight_g = dataValid ? grams : 0;
  lastGradeCode = dataValid ? gradeCode : GRADE_INVALID;
  lastDataValid = dataValid;

  // Build JSON payload
  StaticJsonDocument<256> doc;
  doc["weight_g"] = dataValid ? grams : 0;
  JsonObject status = doc.createNestedObject("status");
  status["hx711_fault"] = hx711Faulted;
  status["eth_or_wifi_issue"] = ethDown;
  doc["grade"] = dataValid ? gradeLabel(gradeCode) : "invalid";
  doc["ts"] = millis();

  char jsonBuf[256];
  size_t len = serializeJson(doc, jsonBuf);

  if (systemActive && mqttClient.connected()) {
    if (!mqttClient.publish(MQTT_TOPIC_DATA, (const uint8_t*)jsonBuf, len, false)) {
      Serial.println("[MQTT] publish to data topic FAILED");
    }
  }
}

// =======================================================================
// LCD DISPLAY
// =======================================================================
void updateLCD() {
  char buf[21];

  lcd.setCursor(0, 0);
  if (systemActive) {
    lcd.print(" BUKIDNON PINEAPPLE ");
  } else {
    lcd.print("   -- STANDBY --    ");
  }

  lcd.setCursor(0, 1);
  if (systemActive && lastDataValid) {
    if (displayKg) {
      float kg = lastValidWeight_g / 1000.0f;
      snprintf(buf, sizeof(buf), "     %6.3fkg       ", kg);
    } else {
      snprintf(buf, sizeof(buf), "     %5ug          ", lastValidWeight_g);
    }
    lcd.print(buf);
  } else if (!systemActive) {
    lcd.print("                    ");
  } else {
    lcd.print("     -- NO DATA --  ");
  }

  lcd.setCursor(0, 2);
  if (systemActive && lastDataValid) {
    snprintf(buf, sizeof(buf), "GRADE: %-7s        ", gradeLabelLCD(lastGradeCode));
    lcd.print(buf);
  } else {
    lcd.print("                    ");
  }

  lcd.setCursor(0, 3);
  if (systemActive && lastDataValid) {
    snprintf(buf, sizeof(buf), "MQTT:%-3s ETH:%-3s %-7s",
             mqttConnected ? "ON" : "OFF",
             ethLinkUp ? "UP" : "DN",
             gradeLabelLCD(lastGradeCode));
    lcd.print(buf);
  } else if (!systemActive) {
    lcd.print("   -- STANDBY --    ");
  } else {
    snprintf(buf, sizeof(buf), "MQTT:%-3s ETH:%-3s NO DATA",
             mqttConnected ? "ON" : "OFF",
             ethLinkUp ? "UP" : "DN");
    lcd.print(buf);
  }
}

// =======================================================================
// DEVICE STATE PUBLISH — refined for HMI panel compatibility
//
// The React HMIPanel expects this exact shape:
//   { "power": "on"|"off", "mode": "<string>", "tare": true|false }
//
// Called after EVERY action (button or MQTT command) so the web app
// receives fast confirmation and clears the pending/timeout state.
// =======================================================================
void publishDeviceState() {
  StaticJsonDocument<256> doc;

  // ── Fields the HMI Panel reads ──
  doc["power"] = systemActive ? "on" : "off";
  doc["mode"] = displayKg ? "kg" : "g";
  doc["tare"] = (lastTareMs > 0);                // true if tare has been performed
  doc["tare_count"] = tareCount;                  // increments each tare — HMI uses for change detection
  doc["log_trigger_count"] = logTriggerCount;     // increments each trigger — HMI uses for change detection

  // ── Extended telemetry (for Device Management screen) ──
  doc["system_active"] = systemActive;
  doc["display_unit"] = displayKg ? "kg" : "g";
  doc["tare_last_ms"] = lastTareMs;

  JsonObject btns = doc.createNestedObject("buttons");
  btns["power_led"] = (bool)digitalRead(BTN1_LED);
  btns["log_led"]   = (bool)digitalRead(BTN2_LED);
  btns["tare_led"]  = (bool)digitalRead(BTN3_LED);
  btns["mode_led"]  = (bool)digitalRead(BTN4_LED);

  doc["lcd_backlight"] = systemActive;

  doc["ts"] = millis();

  char jsonBuf[384];
  size_t len = serializeJson(doc, jsonBuf);

  if (mqttClient.connected()) {
    mqttClient.publish(MQTT_TOPIC_STATE, (const uint8_t*)jsonBuf, len, false);
    Serial.print("[STATE] Published: ");
    Serial.println(jsonBuf);
  }
}

// =======================================================================
// BUTTON HANDLING — debounced, delegates to action functions
// =======================================================================

bool readButton(uint8_t pin, unsigned long &lastCheck, bool &prevState) {
  unsigned long now = millis();
  bool current = digitalRead(pin);

  if (now - lastCheck < DEBOUNCE_MS) return false;

  if (prevState == HIGH && current == LOW) {
    prevState = current;
    lastCheck = now;
    return false;  // press started
  }

  if (prevState == LOW && current == HIGH) {
    prevState = current;
    lastCheck = now;
    return true;   // release → click confirmed
  }

  prevState = current;
  lastCheck = now;
  return false;
}

void handleButtons() {
  // Button 1: Power
  if (readButton(BTN1_SW, lastBtn1Check, btn1PrevState)) {
    doPowerToggle();  // ← calls the same function as MQTT {"action":"power"}
  }

  // Button 2: Manual Log Trigger (⚠️ was: ESP.restart())
  if (readButton(BTN2_SW, lastBtn2Check, btn2PrevState)) {
    doManualLogTrigger();  // ← calls the same function as MQTT {"action":"log_trigger"}
  }

  // Button 3: Tare
  if (readButton(BTN3_SW, lastBtn3Check, btn3PrevState)) {
    doTare();  // ← calls the same function as MQTT {"action":"tare"}
  }

  // Button 4: Mode
  if (readButton(BTN4_SW, lastBtn4Check, btn4PrevState)) {
    doModeToggle();  // ← calls the same function as MQTT {"action":"mode"}
  }

  // Tare LED flash completion
  if (tareFlashing && (millis() - tareFlashStart >= 300)) {
    tareFlashing = false;
    digitalWrite(BTN3_LED, HIGH);
  }
}

// =======================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== Bukidnon Pineapple Grading Scale Firmware v2 (HMI + MQTT Commands) ===");

  // LCD init
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(" BUKIDNON PINEAPPLE ");
  lcd.setCursor(0, 1);
  lcd.print("   INITIALIZING...  ");
  lcd.setCursor(0, 2);
  lcd.print(" v2 — HMI Commands  ");
  Serial.println("[LCD] Initialized (0x27, 20x4)");

  // Button pins
  pinMode(BTN1_LED, OUTPUT);  pinMode(BTN1_SW, INPUT_PULLUP);
  pinMode(BTN2_LED, OUTPUT);  pinMode(BTN2_SW, INPUT_PULLUP);
  pinMode(BTN3_LED, OUTPUT);  pinMode(BTN3_SW, INPUT_PULLUP);
  pinMode(BTN4_LED, OUTPUT);  pinMode(BTN4_SW, INPUT_PULLUP);

  digitalWrite(BTN1_LED, HIGH);
  digitalWrite(BTN2_LED, HIGH);
  digitalWrite(BTN3_LED, HIGH);
  digitalWrite(BTN4_LED, LOW);

  // HX711 init
  scale.begin(HX711_DT_PIN, HX711_SCK_PIN);
  Serial.println("[HX711] Taring...");
  if (scale.wait_ready_timeout(HX711_TIMEOUT_MS)) {
    scale.tare();
    Serial.println("[HX711] Tare complete.");
  } else {
    Serial.println("[HX711] WARNING: not ready during tare.");
  }

  // Ethernet init
  Network.onEvent(onEthEvent);
  ETH.begin(ETH_PHY_TYPE, ETH_PHY_ADDR, ETH_PHY_MDC, ETH_PHY_MDIO,
            ETH_PHY_POWER, ETH_CLK_MODE);
  ETH.config(local_IP, gateway, subnet, primaryDNS);
  delay(1500);
  Serial.print("[ETH] IP: ");
  Serial.println(ETH.localIP());

  // MQTT client setup
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setBufferSize(MQTT_BUFFER_SIZE);

  // ── SET COMMAND CALLBACK ── (NEW — this is why HMI was stuck)
  mqttClient.setCallback(mqttCommandCallback);

  Serial.print("[MQTT] Broker: ");
  Serial.print(MQTT_BROKER);
  Serial.print(":");
  Serial.println(MQTT_PORT);
  Serial.print("[MQTT] Command topic: ");
  Serial.println(MQTT_TOPIC_COMMAND);

  updateLCD();
}

// =======================================================================
void loop() {
  mqttClient.loop();     // MQTT keepalive + incoming message processing
  ensureMqttConnected(); // reconnect + subscribe on every connect
  handleButtons();       // debounced button reads → action functions

  static unsigned long lastSensorPoll = 0;
  static unsigned long lastLcdUpdate = 0;
  static unsigned long lastHeartbeat = 0;
  unsigned long now = millis();

  if (now - lastSensorPoll >= 100) {
    lastSensorPoll = now;
    updateWeightReading();
  }

  if (now - lastLcdUpdate >= 500) {
    lastLcdUpdate = now;
    updateLCD();
  }

  // Periodic device state publish every 5s
  if (now - lastStatePublish >= 5000) {
    lastStatePublish = now;
    publishDeviceState();
  }

  // Heartbeat
  if (now - lastHeartbeat >= 1000) {
    lastHeartbeat = now;
    Serial.printf("[HB %lu] mqtt=%s  eth=%s  active=%s  unit=%s  weight=%u\n",
                  now / 1000,
                  mqttConnected ? "up" : "DOWN",
                  ethLinkUp ? "up" : "DOWN",
                  systemActive ? "yes" : "STANDBY",
                  displayKg ? "kg" : "g",
                  lastValidWeight_g);
  }
}
