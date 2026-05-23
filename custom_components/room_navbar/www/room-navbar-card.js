/**
 * room-navbar-card  v0.0.8
 *
 * Performance-optimized shared navigation menu for HA dashboards.
 *
 * Architecture:
 *   - _fullRender()    → builds DOM once when config is loaded
 *   - _updateStates()  → changes ONLY attributes that differ from previous state
 *                        (called via requestAnimationFrame – max 1× per frame)
 *
 * Filter optimization:
 *   Card first looks for sensor.rnc_{config_id}_{room_id}_filter created by
 *   Python backend. If sensor exists, uses its state (server-side computation,
 *   browser doesn't receive WS message until filter actually changes).
 *   Falls back to local JS computation if sensor doesn't exist.
 */

const VERSION = "0.0.8";
const CARD_TAG = "room-navbar-card";
const EDITOR_TAG = "room-navbar-card-editor";
const SENSOR_PREFIX = "rnc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fireEvent(node, type, detail = {}) {
  const ev = new Event(type, { bubbles: true, cancelable: false, composed: true });
  ev.detail = detail;
  node.dispatchEvent(ev);
  return ev;
}

function navigate(path) {
  window.history.pushState(null, "", path);
  fireEvent(window, "location-changed", { replace: false });
}

function tempColor(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return "rgba(255,255,255,0.7)";
  return n > 25 ? "#ff4d4f" : n < 18 ? "#40a9ff" : "#52c41a";
}

function humColor(val) {
  const n = parseFloat(val);
  if (isNaN(n)) return "rgba(255,255,255,0.7)";
  return n >= 60 ? "#ff4d4f" : n >= 55 ? "#faad14" : "#52c41a";
}

/**
 * Parse a CSS filter string into its numeric components.
 * Returns defaults when a component is missing.
 */
function parseFilter(filterStr) {
  const str = filterStr ?? "";
  const get = (fn) => {
    const m = str.match(new RegExp(fn + "\\(([^)]+)\\)"));
    return m ? parseFloat(m[1]) : null;
  };
  return {
    brightness: get("brightness") ?? 1.0,
    saturate:   get("saturate")   ?? 1.0,
    sepia:      get("sepia")      ?? 0.0,
    hueRotate:  get("hue-rotate") ?? 0.0,
  };
}

/**
 * Build a CSS filter string from numeric components.
 * Omits components at their default values.
 */
function buildFilter({ brightness, saturate, sepia, hueRotate }) {
  const parts = [`brightness(${brightness.toFixed(2)})`];
  if (sepia > 0.005)                parts.push(`sepia(${sepia.toFixed(2)})`);
  if (Math.abs(saturate - 1) > 0.01) parts.push(`saturate(${saturate.toFixed(2)})`);
  if (Math.abs(hueRotate) > 0.5)   parts.push(`hue-rotate(${Math.round(hueRotate)}deg)`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Tap / Hold / Double-tap dispatcher
// ---------------------------------------------------------------------------

class ActionHandler {
  constructor(element, callbacks) {
    this._el = element;
    this._cb = callbacks; // { tap, hold, double_tap }
    this._timer = null;
    this._tapCount = 0;
    this._tapTimer = null;
    this._fired = false;
    this._bind();
  }

  _bind() {
    const onDown = (e) => {
      e.preventDefault();
      this._fired = false;
      this._timer = setTimeout(() => {
        this._fired = true;
        this._cb.hold?.();
      }, 500);
    };

    const onUp = () => {
      clearTimeout(this._timer);
      if (this._fired) return;
      this._tapCount++;
      clearTimeout(this._tapTimer);
      this._tapTimer = setTimeout(() => {
        if (this._tapCount === 1) this._cb.tap?.();
        else this._cb.double_tap?.();
        this._tapCount = 0;
      }, 250);
    };

    const onCancel = () => {
      clearTimeout(this._timer);
      this._fired = true; // suppress tap on scroll
    };

    this._el.addEventListener("mousedown", onDown);
    this._el.addEventListener("mouseup", onUp);
    this._el.addEventListener("touchstart", onDown, { passive: false });
    this._el.addEventListener("touchend", onUp);
    this._el.addEventListener("touchmove", onCancel, { passive: true });
  }
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

class RoomNavbarCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this._cardConfig = null;   // card YAML config (config_id or rooms)
    this._menuConfig = null;   // loaded menu config (rooms array)
    this._hass = null;
    this._configLoaded = false;

    // Cache of previous values for incremental update
    // { roomId: { filter, lightOn, border, temp, hum } }
    this._prev = {};

    // requestAnimationFrame guard
    this._rafPending = false;
  }

  // ------------------------------------------------------------------
  // Lovelace lifecycle
  // ------------------------------------------------------------------

  static getConfigElement() {
    return document.createElement(EDITOR_TAG);
  }

  static getStubConfig() {
    return { config_id: "main_navbar" };
  }

  setConfig(config) {
    if (!config) throw new Error("room-navbar-card: missing configuration");
    this._cardConfig = config;
    this._configLoaded = false; // Reset – reload on config_id change

    if (config.rooms && Array.isArray(config.rooms)) {
      // Inline mode (no backend)
      this._applyMenuConfig({ rooms: config.rooms });
    } else if (this._hass) {
      // hass already set (e.g. editor changed config_id) → load immediately
      this._loadConfigFromBackend();
    } else {
      // Waiting for first hass set
      this._renderPlaceholder("Loading configuration…");
    }
  }

  set hass(hass) {
    const firstSet = !this._hass;
    this._hass = hass;

    if (firstSet && this._cardConfig?.config_id && !this._configLoaded) {
      // First hass set → load config from backend
      this._loadConfigFromBackend();
    } else if (this._menuConfig) {
      // Regular state update
      this._scheduleUpdate();
    }
  }

  getCardSize() {
    return 1;
  }

  // ------------------------------------------------------------------
  // Load config from backend
  // ------------------------------------------------------------------

  async _loadConfigFromBackend() {
    try {
      const result = await this._hass.connection.sendMessagePromise({
        type: "room_navbar/get_config",
        config_id: this._cardConfig.config_id,
      });
      this._configLoaded = true;
      this._applyMenuConfig(result);
    } catch (err) {
      console.warn(`[RoomNavbar] Backend unavailable or config '${this._cardConfig.config_id}' not found:`, err);
      this._renderPlaceholder(
        `⚠️ Configuration '${this._cardConfig?.config_id}' not found.\nInstall the integration and create a configuration.`
      );
    }
  }

  _applyMenuConfig(config) {
    this._menuConfig = config;
    this._prev = {};
    this._fullRender();
  }

  // ------------------------------------------------------------------
  // Full render (called only on config change)
  // ------------------------------------------------------------------

  _fullRender() {
    const rooms = this._menuConfig?.rooms ?? [];
    if (!rooms.length) {
      this._renderPlaceholder("No rooms in configuration.");
      return;
    }

    const style = `
      :host {
        display: block;
        container-type: inline-size;
      }
      .navbar {
        display: flex;
        gap: 4px;
        width: 100%;
        box-sizing: border-box;
      }
      .room {
        flex: 1;
        position: relative;
        overflow: hidden;
        border-radius: 12px;
        min-height: 83px;
        cursor: pointer;
        border: 1px solid rgba(255,255,255,0.1);
        transition: border-color 0.3s ease;
        -webkit-tap-highlight-color: transparent;
        user-select: none;
      }
      .room-bg {
        position: absolute;
        inset: 0;
        z-index: 0;
        background-size: cover;
        background-position: center;
        transition: filter var(--rnc-filter-transition, 1.5s) ease;
        pointer-events: none;
      }
      .room-bg.animating {
        will-change: filter;
      }
      .room-overlay {
        position: absolute;
        inset: 0;
        z-index: 1;
        background-size: cover;
        background-position: center;
        transition: opacity var(--rnc-overlay-transition, 2s) ease;
        opacity: 0;
        pointer-events: none;
      }
      .badge {
        position: absolute;
        z-index: 2;
        font-size: 11px;
        font-weight: 700;
        text-shadow: 0 1px 3px rgba(0,0,0,0.9);
        line-height: 1;
        pointer-events: none;
      }
      .badge-temp { top: 5px; left: 6px; }
      .badge-hum  { bottom: 5px; left: 6px; }
    `;

    const roomsHtml = rooms.map((room) => {
      const rid = room.id;
      const filter = this._computeFilter(room);
      const lightOn = this._hass?.states[room.light_entity]?.state === "on";
      const overlayOpacity = lightOn ? "1" : "0";
      const border = lightOn
        ? "1px solid rgba(255,165,0,0.45)"
        : "1px solid rgba(255,255,255,0.1)";

      const tempVal = this._hass?.states[room.temp_sensor]?.state ?? "--";
      const humVal = this._hass?.states[room.humidity_sensor]?.state ?? "--";
      const tc = tempColor(tempVal);
      const hc = humColor(humVal);

      const filterTransition = room.transition_filter ?? "1.5s";
      const overlayTransition = room.transition_overlay ?? "2.0s";

      return `
        <div class="room" data-room="${rid}" style="border: ${border}">
          <div class="room-bg"
               data-room-bg="${rid}"
               style="
                 background-image: url('${room.image_url ?? ""}');
                 filter: ${filter};
                 --rnc-filter-transition: ${filterTransition};
                 transition: filter ${filterTransition} ease;
               "></div>
          ${room.overlay_image_url ? `
          <div class="room-overlay"
               data-room-overlay="${rid}"
               style="
                 background-image: url('${room.overlay_image_url}');
                 opacity: ${overlayOpacity};
                 transition: opacity ${overlayTransition} ease;
               "></div>
          ` : ""}
          <div class="badge badge-temp" data-room-temp="${rid}">
            <span style="color:${tc}">${tempVal}°</span>
          </div>
          <div class="badge badge-hum" data-room-hum="${rid}">
            <span style="color:${hc}">${humVal}%</span>
          </div>
        </div>
      `;
    }).join("");

    this.shadowRoot.innerHTML = `<style>${style}</style><div class="navbar">${roomsHtml}</div>`;

    // Initialize prev cache and action handlers
    for (const room of rooms) {
      const el = this.shadowRoot.querySelector(`[data-room="${room.id}"]`);
      if (!el) continue;

      const lightOn = this._hass?.states[room.light_entity]?.state === "on";
      this._prev[room.id] = {
        filter: this._computeFilter(room),
        lightOn,
        border: lightOn ? "1px solid rgba(255,165,0,0.45)" : "1px solid rgba(255,255,255,0.1)",
        temp: this._hass?.states[room.temp_sensor]?.state,
        hum: this._hass?.states[room.humidity_sensor]?.state,
      };

      new ActionHandler(el, {
        tap: () => this._handleAction(room, room.tap_action),
        hold: () => this._handleAction(room, room.hold_action),
        double_tap: () => this._handleAction(room, room.double_tap_action),
      });
    }
  }

  _renderPlaceholder(msg) {
    this.shadowRoot.innerHTML = `
      <style>:host{display:block}</style>
      <div style="
        padding: 12px 16px;
        color: var(--secondary-text-color);
        font-size: 13px;
        background: var(--card-background-color);
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.08);
        white-space: pre-wrap;
      ">${msg}</div>
    `;
  }

  // ------------------------------------------------------------------
  // Incremental update (called via rAF)
  // ------------------------------------------------------------------

  _scheduleUpdate() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this._updateStates();
    });
  }

  _updateStates() {
    if (!this._hass || !this._menuConfig) return;
    const root = this.shadowRoot;

    for (const room of this._menuConfig.rooms ?? []) {
      const rid = room.id;
      const prev = this._prev[rid] ?? {};

      // ── Filter ────────────────────────────────────────────────────
      const newFilter = this._computeFilter(room);
      if (newFilter !== prev.filter) {
        const bgEl = root.querySelector(`[data-room-bg="${rid}"]`);
        if (bgEl) {
          bgEl.classList.add("animating");
          bgEl.style.filter = newFilter;
          bgEl.addEventListener("transitionend", () => bgEl.classList.remove("animating"), { once: true });
        }
        prev.filter = newFilter;
      }

      // ── Overlay opacity ───────────────────────────────────────────
      const lightOn = this._hass.states[room.light_entity]?.state === "on";
      if (lightOn !== prev.lightOn) {
        const overlayEl = root.querySelector(`[data-room-overlay="${rid}"]`);
        if (overlayEl) overlayEl.style.opacity = lightOn ? "1" : "0";
        prev.lightOn = lightOn;
      }

      // ── Border ────────────────────────────────────────────────────
      const newBorder = lightOn
        ? "1px solid rgba(255,165,0,0.45)"
        : "1px solid rgba(255,255,255,0.1)";
      if (newBorder !== prev.border) {
        const roomEl = root.querySelector(`[data-room="${rid}"]`);
        if (roomEl) roomEl.style.border = newBorder;
        prev.border = newBorder;
      }

      // ── Temperature ───────────────────────────────────────────────
      if (room.temp_sensor) {
        const tempVal = this._hass.states[room.temp_sensor]?.state;
        if (tempVal !== prev.temp) {
          const tempEl = root.querySelector(`[data-room-temp="${rid}"]`);
          if (tempEl) tempEl.innerHTML = `<span style="color:${tempColor(tempVal)}">${tempVal ?? "--"}°</span>`;
          prev.temp = tempVal;
        }
      }

      // ── Humidity ──────────────────────────────────────────────────
      if (room.humidity_sensor) {
        const humVal = this._hass.states[room.humidity_sensor]?.state;
        if (humVal !== prev.hum) {
          const humEl = root.querySelector(`[data-room-hum="${rid}"]`);
          if (humEl) humEl.innerHTML = `<span style="color:${humColor(humVal)}">${humVal ?? "--"}%</span>`;
          prev.hum = humVal;
        }
      }

      this._prev[rid] = prev;
    }
  }

  // ------------------------------------------------------------------
  // Filter computation – server-side sensor takes priority
  // ------------------------------------------------------------------

  _computeFilter(room) {
    // Prefer pre-computed sensor from Python backend
    if (this._cardConfig?.config_id) {
      const sensorId = `sensor.${SENSOR_PREFIX}_${this._cardConfig.config_id}_${room.id}_filter`;
      const s = this._hass?.states[sensorId];
      if (s && s.state !== "unavailable" && s.state !== "unknown" && s.state) {
        return s.state;
      }
    }

    // JS fallback (inline mode or backend unavailable)
    if (!this._hass) return room.filter_off ?? "brightness(0.6)";

    const lightOn = this._hass.states[room.light_entity]?.state === "on";
    if (lightOn) return room.filter_on ?? "brightness(1.8) sepia(0.2)";

    return room.filter_off ?? "brightness(0.6)";
  }

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  _handleAction(room, action) {
    if (!action) return;

    switch (action.action) {
      case "navigate":
        navigate(action.navigation_path);
        break;

      case "call-service":
      case "perform-action": {
        const [domain, service] = (action.service ?? action.action_name ?? "").split(".");
        if (domain && service) {
          this._hass.callService(domain, service, action.service_data ?? action.data ?? {});
        }
        break;
      }

      case "more-info":
        fireEvent(this, "hass-more-info", { entityId: action.entity ?? room.light_entity });
        break;

      case "fire-dom-event":
        fireEvent(this, "ll-custom", action);
        break;

      case "url":
        window.open(action.url_path, action.new_tab ? "_blank" : "_self");
        break;

      case "toggle":
        if (room.light_entity) {
          this._hass.callService("homeassistant", "toggle", { entity_id: room.light_entity });
        }
        break;

      default:
        console.warn(`[RoomNavbar] Unknown action type: ${action.action}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Inline card editor – full GUI configuration editor
// ---------------------------------------------------------------------------

const ACTION_TYPES = [
  { value: "none",           label: "None" },
  { value: "navigate",       label: "Navigate" },
  { value: "more-info",      label: "More info" },
  { value: "toggle",         label: "Toggle light" },
  { value: "fire-dom-event", label: "Popup (browser_mod)" },
  { value: "call-service",   label: "Call service (JSON)" },
];

class RoomNavbarCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._cardConfig   = {};   // card YAML config (config_id)
    this._menuConfig   = null; // config loaded from backend { name, rooms[] }
    this._hass         = null;
    this._availConfigs = null; // list of existing configurations
    this._expanded     = new Set();
    this._saving       = false;
    this._saveStatus   = null; // null | "ok" | "err"
    this._backendOk    = true; // false if integration is not present
  }

  // ------------------------------------------------------------------
  // Lovelace lifecycle
  // ------------------------------------------------------------------

  set hass(hass) {
    this._hass = hass;
    // Update entity pickers without re-render
    this.shadowRoot.querySelectorAll("ha-entity-picker").forEach(p => { p.hass = hass; });
    if (this._availConfigs === null) this._fetchConfigs();
  }

  setConfig(cardConfig) {
    const prevId = this._cardConfig?.config_id;
    this._cardConfig = { ...cardConfig };
    const newId = cardConfig.config_id;

    if (newId && newId !== prevId) {
      this._menuConfig = null;
      if (this._hass) this._loadMenuConfig(newId);
    }
    this._render();
  }

  // ------------------------------------------------------------------
  // Backend communication
  // ------------------------------------------------------------------

  async _fetchConfigs() {
    try {
      const r = await this._hass.connection.sendMessagePromise({ type: "room_navbar/list_configs" });
      this._availConfigs = r.configs ?? [];
      this._backendOk = true;
    } catch {
      this._availConfigs = [];
      this._backendOk = false;
    }
    if (this._cardConfig.config_id && !this._menuConfig) {
      await this._loadMenuConfig(this._cardConfig.config_id);
    } else if (!this._menuConfig) {
      // Inline mode (rooms directly in YAML, no config_id) – initialize from them.
      // Also applies to a brand new card with nothing set.
      this._menuConfig = {
        name: "",
        rooms: this._cardConfig.rooms ? [...this._cardConfig.rooms] : [],
      };
      this._render();
    } else {
      this._render();
    }
  }

  async _loadMenuConfig(configId) {
    try {
      const r = await this._hass.connection.sendMessagePromise({
        type: "room_navbar/get_config",
        config_id: configId,
      });
      this._menuConfig = r;
    } catch {
      // Config doesn't exist yet → start empty
      this._menuConfig = { name: configId, rooms: [] };
    }
    this._render();
  }

  async _saveConfig() {
    if (this._saving || !this._menuConfig) return;
    const configId = this._cardConfig.config_id?.trim();
    if (!configId) { alert("Enter a Config ID first."); return; }

    // Validation: every room must have an id
    for (const r of this._menuConfig.rooms ?? []) {
      if (!r.id?.trim()) { alert("Every room must have an ID set."); return; }
    }

    this._saving = true;
    this._saveStatus = null;
    this._render();

    try {
      await this._hass.connection.sendMessagePromise({
        type: "room_navbar/save_config",
        config_id: configId,
        config_data: this._menuConfig,
      });
      this._saveStatus = "ok";
      await this._fetchConfigs();
      this._emitConfigChanged({ config_id: configId });
    } catch (e) {
      this._saveStatus = "err";
      console.error("[RoomNavbar editor] save failed", e);
      this._render();
    } finally {
      this._saving = false;
      this._render();
      setTimeout(() => { this._saveStatus = null; this._render(); }, 4000);
    }
  }

  // ------------------------------------------------------------------
  // Model manipulation
  // ------------------------------------------------------------------

  _ensureMenuConfig() {
    if (!this._menuConfig) {
      this._menuConfig = { name: this._cardConfig.config_id ?? "menu", rooms: [] };
    }
  }

  _addRoom() {
    this._ensureMenuConfig();
    const id = `room_${Date.now()}`;
    this._menuConfig.rooms.push({
      id,
      light_entity: "",
      image_url: "",
      overlay_image_url: "",
      temp_sensor: "",
      humidity_sensor: "",
      filter_off: "brightness(0.60) saturate(1.00)",
      filter_on:  "brightness(1.80) sepia(0.20) saturate(1.20)",
      filter_day: "brightness(1.30) saturate(1.05)",
      transition_filter: "1.5s",
      transition_overlay: "2.0s",
      tap_action: { action: "navigate", navigation_path: "" },
    });
    this._expanded.add(id);
    this._render();
  }

  _deleteRoom(roomId) {
    this._menuConfig.rooms = this._menuConfig.rooms.filter(r => r.id !== roomId);
    this._expanded.delete(roomId);
    this._render();
  }

  _toggleExpand(roomId) {
    this._expanded.has(roomId) ? this._expanded.delete(roomId) : this._expanded.add(roomId);
    this._render();
  }

  /** Update a field in a room WITHOUT re-render (called from change events). */
  _setField(roomId, field, value) {
    const room = this._menuConfig?.rooms.find(r => r.id === roomId);
    if (!room) return;
    if (field.includes(".")) {
      const [parent, child] = field.split(".");
      room[parent] = { ...(room[parent] ?? {}), [child]: value };
    } else {
      room[field] = value;
    }
  }

  _setActionType(roomId, actionKey, newType) {
    const room = this._menuConfig?.rooms.find(r => r.id === roomId);
    if (!room) return;
    if (newType === "none") {
      room[actionKey] = null;
    } else if (newType === "navigate") {
      room[actionKey] = { action: "navigate", navigation_path: room[actionKey]?.navigation_path ?? "" };
    } else if (newType === "more-info") {
      room[actionKey] = { action: "more-info", entity: room[actionKey]?.entity ?? "" };
    } else if (newType === "toggle") {
      room[actionKey] = { action: "toggle" };
    } else {
      room[actionKey] = { action: newType };
    }
    this._render(); // action changes structure → re-render
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  _render() {
    const configId    = this._cardConfig.config_id ?? "";
    const menuConfig  = this._menuConfig;
    const rooms       = menuConfig?.rooms ?? [];
    const availIds    = this._availConfigs?.map(c => c.id) ?? [];

    const S = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

    // ── Status banners ───────────────────────────────────────────────
    const backendBanner = !this._backendOk ? `
      <div class="banner warn">
        ⚠️ Integration <strong>Room Navbar</strong> is not installed or unavailable.<br>
        Add it via <em>Settings → Integrations</em> and restart HA.
      </div>` : "";

    const isNew = this._backendOk && configId && !availIds.includes(configId);
    const newBanner = isNew ? `
      <div class="banner info">
        ✨ Configuration <strong>${S(configId)}</strong> doesn't exist yet – fill in rooms and click <em>Save</em>.
      </div>` : "";

    // ── Config ID section ────────────────────────────────────────────
    const existingOptions = (this._availConfigs ?? [])
      .filter(c => c.id !== configId)
      .map(c => `<option value="${S(c.id)}">${S(c.name)} (${c.room_count})</option>`)
      .join("");

    const configSection = `
      <div class="section">
        <div class="section-title">Configuration</div>
        <div class="field-row">
          <label class="field-label">Config ID</label>
          <input id="inp-config-id" class="field-input" type="text"
                 value="${S(configId)}" placeholder="main_navbar"
                 title="Technical identifier (snake_case). Must be the same on all dashboards where you use the card.">
        </div>
        ${existingOptions ? `
        <div class="field-row">
          <label class="field-label">Load existing</label>
          <select id="sel-existing" class="field-input">
            <option value="">── select ──</option>
            ${existingOptions}
          </select>
        </div>` : ""}
        <div class="field-row">
          <label class="field-label">Menu name</label>
          <input id="inp-menu-name" class="field-input" type="text"
                 value="${S(menuConfig?.name ?? configId)}" placeholder="Main Navbar">
        </div>
      </div>`;

    // ── Rooms ────────────────────────────────────────────────────────
    const roomsHtml = rooms.map((room, idx) => this._renderRoom(room, idx)).join("");

    const roomsSection = `
      <div class="section">
        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>Rooms (${rooms.length})</span>
          <button id="btn-add-room" class="btn-secondary">+ Add room</button>
        </div>
        ${rooms.length === 0 ? `<div class="empty-rooms">No rooms. Click <em>Add room</em> to start.</div>` : ""}
        ${roomsHtml}
      </div>`;

    // ── Save ─────────────────────────────────────────────────────────
    const statusHtml = this._saveStatus === "ok"
      ? `<span class="status-ok">✓ Saved</span>`
      : this._saveStatus === "err"
      ? `<span class="status-err">✗ Error – check HA logs</span>`
      : "";

    const saveSection = `
      <div class="section save-row">
        <button id="btn-save" class="btn-primary" ${this._saving ? "disabled" : ""}>
          ${this._saving ? "Saving…" : "💾 Save configuration"}
        </button>
        ${statusHtml}
      </div>`;

    // ── CSS ──────────────────────────────────────────────────────────
    const css = `
      :host { display: block; font-family: var(--paper-font-body1_-_font-family, sans-serif); }
      * { box-sizing: border-box; }
      .section { margin-bottom: 20px; }
      .section-title { font-size: 13px; font-weight: 600; color: var(--primary-text-color);
                       text-transform: uppercase; letter-spacing: .5px; margin-bottom: 10px; }
      .banner { padding: 10px 14px; border-radius: 8px; font-size: 12px; margin-bottom: 14px; line-height: 1.5; }
      .banner.warn { background: rgba(255,152,0,.15); border: 1px solid rgba(255,152,0,.4); color: var(--primary-text-color); }
      .banner.info { background: rgba(33,150,243,.12); border: 1px solid rgba(33,150,243,.35); color: var(--primary-text-color); }
      .field-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
      .field-label { flex: 0 0 140px; font-size: 12px; color: var(--secondary-text-color); }
      .field-input { flex: 1; padding: 7px 10px; background: var(--input-fill-color, rgba(255,255,255,0.06));
                     color: var(--primary-text-color); border: 1px solid var(--divider-color, rgba(255,255,255,0.12));
                     border-radius: 6px; font-size: 13px; }
      .field-input:focus { outline: none; border-color: var(--primary-color); }
      textarea.field-input { resize: vertical; font-family: monospace; font-size: 11px; min-height: 80px; }
      .sub-title { font-size: 11px; font-weight: 600; color: var(--secondary-text-color);
                   text-transform: uppercase; letter-spacing: .4px;
                   margin: 14px 0 6px; padding-top: 10px; border-top: 1px solid var(--divider-color, rgba(255,255,255,0.08)); }
      .room-card { border: 1px solid var(--divider-color, rgba(255,255,255,0.1));
                   border-radius: 10px; margin-bottom: 8px; overflow: hidden; }
      .room-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px;
                     background: rgba(255,255,255,0.04); cursor: pointer; user-select: none; }
      .room-header:hover { background: rgba(255,255,255,0.07); }
      .room-chevron { font-size: 10px; color: var(--secondary-text-color); transition: transform .2s; }
      .room-chevron.open { transform: rotate(90deg); }
      .room-title { flex: 1; font-size: 13px; font-weight: 500; color: var(--primary-text-color); }
      .room-id-badge { font-size: 10px; color: var(--secondary-text-color);
                       background: rgba(255,255,255,0.07); border-radius: 4px; padding: 2px 6px; }
      .btn-delete { background: none; border: none; cursor: pointer; font-size: 14px;
                    color: var(--error-color, #cf6679); padding: 4px; border-radius: 4px; }
      .btn-delete:hover { background: rgba(207,102,121,0.15); }
      .room-body { padding: 14px; }
      .btn-primary { padding: 10px 20px; background: var(--primary-color); color: #fff;
                     border: none; border-radius: 8px; font-size: 14px; font-weight: 600;
                     cursor: pointer; transition: opacity .2s; }
      .btn-primary:hover { opacity: .88; }
      .btn-primary:disabled { opacity: .45; cursor: not-allowed; }
      .btn-secondary { padding: 6px 12px; background: rgba(255,255,255,0.07);
                       color: var(--primary-text-color); border: 1px solid var(--divider-color, rgba(255,255,255,0.12));
                       border-radius: 6px; font-size: 12px; cursor: pointer; }
      .btn-secondary:hover { background: rgba(255,255,255,0.12); }
      .save-row { display: flex; align-items: center; gap: 14px; }
      .status-ok  { font-size: 13px; color: var(--success-color, #4caf50); }
      .status-err { font-size: 13px; color: var(--error-color, #cf6679); }
      .empty-rooms { font-size: 13px; color: var(--secondary-text-color);
                     padding: 20px; text-align: center; border: 1px dashed var(--divider-color, rgba(255,255,255,0.1));
                     border-radius: 8px; }
      ha-entity-picker { flex: 1; }
      .action-block { padding: 10px; background: rgba(255,255,255,0.03);
                      border: 1px solid rgba(255,255,255,0.07); border-radius: 8px; margin-bottom: 8px; }
      .action-label { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 6px; }

      /* ── Filter editor ─────────────────────────────────────────── */
      .filter-panels { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
      .filter-block {
        flex: 1; min-width: 140px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        padding: 10px 12px;
      }
      .filter-title {
        font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px;
        color: var(--secondary-text-color); margin-bottom: 8px;
      }
      .filter-preview-bar {
        width: 100%; height: 32px; border-radius: 5px; margin-bottom: 10px;
        background: linear-gradient(135deg,
          #0d1b2a 0%, #1b3a5c 20%, #2e6da4 40%,
          #e8a045 60%, #f5d76e 80%, #ffffff 100%);
        transition: filter 0.4s ease;
      }
      .filter-slider-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
      .filter-prop { flex: 0 0 22px; font-size: 13px; text-align: center; }
      .filter-slider {
        flex: 1; height: 4px; cursor: pointer;
        accent-color: var(--primary-color);
      }
      .filter-val {
        flex: 0 0 36px; font-size: 10px; text-align: right;
        color: var(--primary-text-color); font-family: monospace;
      }
      .filter-raw {
        font-size: 9px; color: var(--secondary-text-color);
        font-family: monospace; margin-top: 7px;
        word-break: break-all; line-height: 1.4;
        padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.06);
      }
      .transition-row { display: flex; gap: 8px; }
      .transition-row .field-row { flex: 1; }
    `;

    this.shadowRoot.innerHTML = `
      <style>${css}</style>
      ${backendBanner}
      ${newBanner}
      ${configSection}
      ${menuConfig !== null ? roomsSection + saveSection : '<div class="empty-rooms">Loading…</div>'}
    `;

    this._attachDomListeners();
  }

  _renderRoom(room, idx) {
    const S = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const rid = room.id;
    const open = this._expanded.has(rid);

    const body = open ? `
      <div class="room-body">

        <!-- Basic -->
        <div class="sub-title">Basic</div>
        <div class="field-row">
          <label class="field-label">Room ID</label>
          <input class="field-input" type="text" data-r="${S(rid)}" data-f="id" value="${S(rid)}"
                 placeholder="bedroom" title="snake_case, unique within the configuration">
        </div>
        <div class="field-row">
          <label class="field-label">Light (entity)</label>
          <ha-entity-picker data-r="${S(rid)}" data-f="light_entity" allow-custom-entity></ha-entity-picker>
        </div>
        <div class="field-row">
          <label class="field-label">Background URL</label>
          <input class="field-input" type="text" data-r="${S(rid)}" data-f="image_url"
                 value="${S(room.image_url)}" placeholder="/local/Dashboards/Rooms/Bedroom.webp">
        </div>
        <div class="field-row">
          <label class="field-label">Overlay URL</label>
          <input class="field-input" type="text" data-r="${S(rid)}" data-f="overlay_image_url"
                 value="${S(room.overlay_image_url)}" placeholder="/local/.../overlay.webp (optional)">
        </div>

        <!-- Sensors -->
        <div class="sub-title">Sensors</div>
        <div class="field-row">
          <label class="field-label">Temperature</label>
          <ha-entity-picker data-r="${S(rid)}" data-f="temp_sensor" allow-custom-entity></ha-entity-picker>
        </div>
        <div class="field-row">
          <label class="field-label">Humidity</label>
          <ha-entity-picker data-r="${S(rid)}" data-f="humidity_sensor" allow-custom-entity></ha-entity-picker>
        </div>

        <!-- Filters -->
        <div class="sub-title">Image Filters & Transitions</div>
        <div class="filter-panels">
          ${this._renderFilterBlock(room, "filter_off",  "🌙 Night / Off")}
          ${this._renderFilterBlock(room, "filter_on",   "💡 Light ON")}
          ${this._renderFilterBlock(room, "filter_day",  "☀️ Day")}
        </div>
        <div class="transition-row">
          <div class="field-row">
            <label class="field-label">Filter transition</label>
            <input class="field-input" type="text" data-r="${S(rid)}" data-f="transition_filter"
                   value="${S(room.transition_filter ?? "1.5s")}" placeholder="1.5s">
          </div>
          <div class="field-row">
            <label class="field-label">Overlay transition</label>
            <input class="field-input" type="text" data-r="${S(rid)}" data-f="transition_overlay"
                   value="${S(room.transition_overlay ?? "2.0s")}" placeholder="2.0s">
          </div>
        </div>

        <!-- Actions -->
        <div class="sub-title">Actions</div>
        ${this._renderActionBlock(room, "tap_action",        "Tap")}
        ${this._renderActionBlock(room, "hold_action",       "Hold (>500ms)")}
        ${this._renderActionBlock(room, "double_tap_action", "Double tap")}
      </div>
    ` : "";

    return `
      <div class="room-card">
        <div class="room-header" data-toggle="${S(rid)}">
          <span class="room-chevron ${open ? "open" : ""}">▶</span>
          <span class="room-title">${S(rid)}</span>
          ${room.light_entity ? `<span class="room-id-badge">${S(room.light_entity)}</span>` : ""}
          <button class="btn-delete" data-delete-room="${S(rid)}" title="Delete room">🗑</button>
        </div>
        ${body}
      </div>`;
  }

  /**
   * Render a graphical filter editor panel for filter_off / filter_on / filter_day.
   * Uses sliders for brightness, saturation, sepia and hue-rotate.
   */
  _renderFilterBlock(room, filterKey, label) {
    const S = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const rid = room.id;
    const filterStr = room[filterKey] ?? "";
    const { brightness, saturate, sepia, hueRotate } = parseFilter(filterStr);
    const previewId = `${rid}-${filterKey}`;

    return `
      <div class="filter-block">
        <div class="filter-title">${label}</div>
        <div class="filter-preview-bar" data-preview="${S(previewId)}"
             style="filter:${S(filterStr)}"></div>

        <div class="filter-slider-row">
          <span class="filter-prop" title="Brightness">☀</span>
          <input type="range" class="filter-slider" min="0.10" max="3.00" step="0.05"
                 data-r="${S(rid)}" data-fk="${filterKey}" data-fc="brightness"
                 value="${brightness.toFixed(2)}">
          <span class="filter-val" data-val="${S(previewId)}-brightness">${brightness.toFixed(2)}</span>
        </div>

        <div class="filter-slider-row">
          <span class="filter-prop" title="Saturation">🎨</span>
          <input type="range" class="filter-slider" min="0.00" max="4.00" step="0.05"
                 data-r="${S(rid)}" data-fk="${filterKey}" data-fc="saturate"
                 value="${saturate.toFixed(2)}">
          <span class="filter-val" data-val="${S(previewId)}-saturate">${saturate.toFixed(2)}</span>
        </div>

        <div class="filter-slider-row">
          <span class="filter-prop" title="Sepia">🟫</span>
          <input type="range" class="filter-slider" min="0.00" max="1.00" step="0.05"
                 data-r="${S(rid)}" data-fk="${filterKey}" data-fc="sepia"
                 value="${sepia.toFixed(2)}">
          <span class="filter-val" data-val="${S(previewId)}-sepia">${sepia.toFixed(2)}</span>
        </div>

        <div class="filter-slider-row">
          <span class="filter-prop" title="Hue rotate">🌈</span>
          <input type="range" class="filter-slider" min="-180" max="180" step="1"
                 data-r="${S(rid)}" data-fk="${filterKey}" data-fc="hue"
                 value="${Math.round(hueRotate)}">
          <span class="filter-val" data-val="${S(previewId)}-hue">${Math.round(hueRotate)}°</span>
        </div>

        <div class="filter-raw" data-raw="${S(previewId)}">${S(filterStr) || "—"}</div>
      </div>`;
  }

  _renderActionBlock(room, actionKey, label) {
    const S = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const rid = room.id;
    const action = room[actionKey];
    const currentType = action?.action ?? "none";

    const options = ACTION_TYPES.map(t =>
      `<option value="${t.value}" ${currentType === t.value ? "selected" : ""}>${t.label}</option>`
    ).join("");

    let extra = "";
    if (currentType === "navigate") {
      extra = `
        <div class="field-row" style="margin-top:6px">
          <label class="field-label">Path</label>
          <input class="field-input" type="text" data-r="${S(rid)}" data-ak="${actionKey}" data-f="navigation_path"
                 value="${S(action?.navigation_path)}" placeholder="/dashboard-home/bedroom">
        </div>`;
    } else if (currentType === "more-info") {
      extra = `
        <div class="field-row" style="margin-top:6px">
          <label class="field-label">Entity</label>
          <ha-entity-picker data-r="${S(rid)}" data-ak="${actionKey}" data-f="entity" allow-custom-entity></ha-entity-picker>
        </div>`;
    } else if (currentType === "fire-dom-event" || currentType === "call-service") {
      const json = action ? JSON.stringify(action, null, 2) : "{}";
      extra = `
        <div style="margin-top:6px">
          <label class="field-label" style="display:block;margin-bottom:4px">Action JSON</label>
          <textarea class="field-input" rows="5" data-r="${S(rid)}" data-ak="${actionKey}" data-f="json"
                    placeholder='{"action":"fire-dom-event","browser_mod":{...}}'>${S(json)}</textarea>
        </div>`;
    }

    return `
      <div class="action-block">
        <div class="action-label">${label}</div>
        <div class="field-row">
          <label class="field-label">Action type</label>
          <select class="field-input" data-r="${S(rid)}" data-action-type="${actionKey}">
            ${options}
          </select>
        </div>
        ${extra}
      </div>`;
  }

  // ------------------------------------------------------------------
  // DOM event listeners (called after every _render)
  // ------------------------------------------------------------------

  _attachDomListeners() {
    const root = this.shadowRoot;

    // Config ID input
    root.querySelector("#inp-config-id")?.addEventListener("change", (e) => {
      const newId = e.target.value.trim();
      if (newId && newId !== this._cardConfig.config_id) {
        this._cardConfig = { ...this._cardConfig, config_id: newId };
        this._menuConfig = null;
        if (this._hass) this._loadMenuConfig(newId);
        this._emitConfigChanged({ config_id: newId });
      }
    });

    // Select existing configuration
    root.querySelector("#sel-existing")?.addEventListener("change", (e) => {
      const id = e.target.value;
      if (!id) return;
      this._cardConfig = { ...this._cardConfig, config_id: id };
      this._menuConfig = null;
      this._emitConfigChanged({ config_id: id });
      this._loadMenuConfig(id);
    });

    // Menu name
    root.querySelector("#inp-menu-name")?.addEventListener("change", (e) => {
      this._ensureMenuConfig();
      this._menuConfig.name = e.target.value.trim();
    });

    // Add room
    root.querySelector("#btn-add-room")?.addEventListener("click", () => this._addRoom());

    // Save
    root.querySelector("#btn-save")?.addEventListener("click", () => this._saveConfig());

    // Room headers (toggle expand)
    root.querySelectorAll("[data-toggle]").forEach(el => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-delete-room]")) return;
        this._toggleExpand(el.dataset.toggle);
      });
    });

    // Delete room buttons
    root.querySelectorAll("[data-delete-room]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`Delete room "${el.dataset.deleteRoom}"?`)) {
          this._deleteRoom(el.dataset.deleteRoom);
        }
      });
    });

    // Text / number fields – update without re-render
    root.querySelectorAll("input[data-r][data-f], textarea[data-r][data-f]").forEach(el => {
      el.addEventListener("change", (e) => {
        const { r, f, ak } = e.target.dataset;
        if (ak) {
          // Field belonging to an action (navigation_path, json)
          const room = this._menuConfig?.rooms.find(rm => rm.id === r);
          if (!room) return;
          if (f === "json") {
            try { room[ak] = JSON.parse(e.target.value); } catch { /* invalid JSON, ignore */ }
          } else {
            if (!room[ak] || typeof room[ak] !== "object") room[ak] = {};
            room[ak][f] = e.target.value.trim();
          }
        } else {
          const room = this._menuConfig?.rooms.find(rm => rm.id === r);
          if (!room) return;
          room[f] = e.target.value.trim();
        }
      });
    });

    // Action type selects
    root.querySelectorAll("select[data-r][data-ak]").forEach(el => {
      el.addEventListener("change", (e) => {
        const { r, ak } = e.target.dataset;
        const room = this._menuConfig?.rooms.find(rm => rm.id === r);
        if (!room) return;
        if (!room[ak] || typeof room[ak] !== "object") room[ak] = {};
        room[ak].action = e.target.value;
        this._renderEditorContent();
        this._attachDomListeners();
      });
    });

    // Filter sliders – live update without re-render
    root.querySelectorAll("input[data-fk][data-fc]").forEach(slider => {
      slider.addEventListener("input", () => {
        const { r, fk, fc } = slider.dataset;
        const room = this._menuConfig?.rooms.find(rm => rm.id === r);
        if (!room) return;
        const get = (comp) =>
          parseFloat(root.querySelector(`input[data-r="${r}"][data-fk="${fk}"][data-fc="${comp}"]`)?.value ?? 0);
        const brightness = get("brightness");
        const saturate   = get("saturate");
        const sepia      = get("sepia");
        const hueRotate  = get("hue");
        const newFilter = buildFilter({ brightness, saturate, sepia, hueRotate });
        room[fk] = newFilter;
        const previewId = `${r}-${fk}`;
        const valEl = root.querySelector(`[data-val="${previewId}-${fc}"]`);
        if (valEl) {
          const v = parseFloat(slider.value);
          valEl.textContent = fc === "hue" ? `${Math.round(v)}°` : v.toFixed(2);
        }
        const preview = root.querySelector(`[data-preview="${previewId}"]`);
        if (preview) preview.style.filter = newFilter;
        const rawEl = root.querySelector(`[data-raw="${previewId}"]`);
        if (rawEl) rawEl.textContent = newFilter;
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, RoomNavbarCard);
  console.info(`%c room-navbar-card %c v${VERSION} `, "background:#1976d2;color:#fff;font-weight:700", "background:#333;color:#fff");
}

if (!customElements.get(EDITOR_TAG)) {
  customElements.define(EDITOR_TAG, RoomNavbarCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG,
    name: "Room Navbar Card",
    description: "Shared navigation bar with per-room images, filters, temperature and humidity.",
    preview: true,
  });
}
