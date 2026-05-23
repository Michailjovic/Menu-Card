/**
 * room-navbar-card  v1.0.0
 *
 * Výkonnostně optimalizované sdílené navigační menu pro HA dashboardy.
 *
 * Architektura:
 *   - _fullRender()    → staví DOM jednou při načtení konfigurace
 *   - _updateStates()  → mění POUZE atributy které se lišší od předchozího stavu
 *                        (voláno přes requestAnimationFrame – max 1× per frame)
 *
 * Optimalizace filtru:
 *   Karta nejprve hledá sensor.rnc_{config_id}_{room_id}_filter vytvořený
 *   Python backendem. Pokud sensor existuje, použije jeho stav (server-side výpočet,
 *   prohlížeč nedostane WS zprávu dokud se filtr skutečně nezmění).
 *   Pokud sensor neexistuje, padne zpět na lokální JS výpočet.
 */

const VERSION = "1.0.0";
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
      this._fired = true; // potlačí tap při scroll
    };

    this._el.addEventListener("mousedown", onDown);
    this._el.addEventListener("mouseup", onUp);
    this._el.addEventListener("touchstart", onDown, { passive: false });
    this._el.addEventListener("touchend", onUp);
    this._el.addEventListener("touchmove", onCancel, { passive: true });
  }
}

// ---------------------------------------------------------------------------
// Hlavní karta
// ---------------------------------------------------------------------------

class RoomNavbarCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this._cardConfig = null;   // konfigurace z card YAML (config_id nebo rooms)
    this._menuConfig = null;   // načtená menu konfigurace (rooms array)
    this._hass = null;
    this._configLoaded = false;

    // Cache předchozích hodnot pro inkrementální update
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
    if (!config) throw new Error("room-navbar-card: chybí konfigurace");
    this._cardConfig = config;
    this._configLoaded = false; // Reset – při změně config_id znovu načteme

    if (config.rooms && Array.isArray(config.rooms)) {
      // Inline mód (bez backendu)
      this._applyMenuConfig({ rooms: config.rooms });
    } else if (this._hass) {
      // hass je již nastaven (např. editor změnil config_id) → načteme hned
      this._loadConfigFromBackend();
    } else {
      // Čekáme na první set hass
      this._renderPlaceholder("Načítám konfiguraci…");
    }
  }

  set hass(hass) {
    const firstSet = !this._hass;
    this._hass = hass;

    if (firstSet && this._cardConfig?.config_id && !this._configLoaded) {
      // První nastavení hass → načteme config z backendu
      this._loadConfigFromBackend();
    } else if (this._menuConfig) {
      // Běžný update stavů
      this._scheduleUpdate();
    }
  }

  getCardSize() {
    return 1;
  }

  // ------------------------------------------------------------------
  // Načítání konfigurace z backendu
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
      console.warn(`[RoomNavbar] Backend nedostupný nebo config '${this._cardConfig.config_id}' neexistuje:`, err);
      this._renderPlaceholder(
        `⚠️ Konfigurace '${this._cardConfig?.config_id}' nenalezena.\nNainstalujte integraci a vytvořte konfiguraci.`
      );
    }
  }

  _applyMenuConfig(config) {
    this._menuConfig = config;
    this._prev = {};
    this._fullRender();
  }

  // ------------------------------------------------------------------
  // Plný render (volá se jen při změně konfigurace)
  // ------------------------------------------------------------------

  _fullRender() {
    const rooms = this._menuConfig?.rooms ?? [];
    if (!rooms.length) {
      this._renderPlaceholder("Žádné pokoje v konfiguraci.");
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
        /* Žádné will-change tady – zapneme jen při animaci */
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

    // Inicializace prev cache a action handlerů
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
  // Inkrementální update (voláno přes rAF)
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
          // Zapneme will-change jen na dobu animace
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

      // ── Teplota ───────────────────────────────────────────────────
      if (room.temp_sensor) {
        const tempVal = this._hass.states[room.temp_sensor]?.state;
        if (tempVal !== prev.temp) {
          const tempEl = root.querySelector(`[data-room-temp="${rid}"]`);
          if (tempEl) tempEl.innerHTML = `<span style="color:${tempColor(tempVal)}">${tempVal ?? "--"}°</span>`;
          prev.temp = tempVal;
        }
      }

      // ── Vlhkost ───────────────────────────────────────────────────
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
  // Výpočet filtru – server-side sensor má přednost
  // ------------------------------------------------------------------

  _computeFilter(room) {
    // Preferujeme pre-computed sensor z Python backendu
    if (this._cardConfig?.config_id) {
      const sensorId = `sensor.${SENSOR_PREFIX}_${this._cardConfig.config_id}_${room.id}_filter`;
      const s = this._hass?.states[sensorId];
      if (s && s.state !== "unavailable" && s.state !== "unknown" && s.state) {
        return s.state;
      }
    }

    // JS fallback (inline mód nebo backend není dostupný)
    if (!this._hass) return room.filter_off ?? "brightness(0.6)";

    const lightOn = this._hass.states[room.light_entity]?.state === "on";
    if (lightOn) return room.filter_on ?? "brightness(1.8) sepia(0.2)";

    if (room.blind_entity) {
      const blind = this._hass.states[room.blind_entity];
      const sun = this._hass.states["sun.sun"];
      const blindPct = parseFloat(blind?.state ?? "100");
      if (blindPct < (room.blind_threshold ?? 36) && sun?.state === "above_horizon") {
        return room.filter_day ?? "brightness(1.3)";
      }
    }

    return room.filter_off ?? "brightness(0.6)";
  }

  // ------------------------------------------------------------------
  // Akce
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
        // browser_mod.popup a další ll-custom eventy
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
        console.warn(`[RoomNavbar] Neznámý typ akce: ${action.action}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Inline card editor – plný GUI editor konfigurace
// ---------------------------------------------------------------------------

const ACTION_TYPES = [
  { value: "none",           label: "žádná" },
  { value: "navigate",       label: "Navigace" },
  { value: "more-info",      label: "Více informací" },
  { value: "toggle",         label: "Přepnout světlo" },
  { value: "fire-dom-event", label: "Popup (browser_mod)" },
  { value: "call-service",   label: "Volat službu (JSON)" },
];

class RoomNavbarCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._cardConfig   = {};   // YAML config karty (config_id)
    this._menuConfig   = null; // config načtená z backendu { name, rooms[] }
    this._hass         = null;
    this._availConfigs = null; // seznam existujících konfigurací
    this._expanded     = new Set();
    this._saving       = false;
    this._saveStatus   = null; // null | "ok" | "err"
    this._backendOk    = true; // false pokud integrace není přítomna
  }

  // ------------------------------------------------------------------
  // Lovelace lifecycle
  // ------------------------------------------------------------------

  set hass(hass) {
    this._hass = hass;
    // Aktualizujeme entity pickery bez re-renderu
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
  // Backend komunikace
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
    // Pokud máme config_id ale menuConfig ještě není, načteme z backendu
    if (this._cardConfig.config_id && !this._menuConfig) {
      await this._loadMenuConfig(this._cardConfig.config_id);
    } else if (!this._menuConfig) {
      // Inline mód (rooms přímo v YAML, bez config_id) – inicializujeme z nich.
      // Taky sem dopadne zcela nová karta bez ničeho.
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
      // Konfigurace ještě neexistuje → začneme prázdnou
      this._menuConfig = { name: configId, rooms: [] };
    }
    this._render();
  }

  async _saveConfig() {
    if (this._saving || !this._menuConfig) return;
    const configId = this._cardConfig.config_id?.trim();
    if (!configId) { alert("Zadej Config ID."); return; }

    // Validace: každý pokoj musí mít id
    for (const r of this._menuConfig.rooms ?? []) {
      if (!r.id?.trim()) { alert("Každý pokoj musí mít vyplněné ID."); return; }
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
      // Aktualizujeme seznam konfigurací
      await this._fetchConfigs();
      // Informujeme HA editor že config_id se (možná) změnil
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
  // Model manipulace
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
      filter_off: "brightness(0.6) saturate(1.0)",
      filter_on:  "brightness(1.8) sepia(0.2) saturate(1.2)",
      filter_day: "brightness(1.3) saturate(1.05)",
      blind_entity: "",
      blind_threshold: 36,
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

  /** Aktualizuje pole v pokoji BEZ re-renderu (volá se z change eventů). */
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
    this._render(); // akce mění strukturu → re-render
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  _render() {
    const configId    = this._cardConfig.config_id ?? "";
    const menuConfig  = this._menuConfig;
    const rooms       = menuConfig?.rooms ?? [];
    const availIds    = this._availConfigs?.map(c => c.id) ?? [];

    const S = (s) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

    // ── Stavová záhlaví ──────────────────────────────────────────────
    const backendBanner = !this._backendOk ? `
      <div class="banner warn">
        ⚠️ Integrace <strong>Room Navbar</strong> není nainstalována nebo nedostupná.<br>
        Přidej ji přes <em>Nastavení → Integrace</em> a restartuj HA.
      </div>` : "";

    const isNew = this._backendOk && configId && !availIds.includes(configId);
    const newBanner = isNew ? `
      <div class="banner info">
        ✨ Konfigurace <strong>${S(configId)}</strong> ještě neexistuje – vyplň pokoje a klikni <em>Uložit</em>.
      </div>` : "";

    // ── Config ID sekce ──────────────────────────────────────────────
    const existingOptions = (this._availConfigs ?? [])
      .filter(c => c.id !== configId)
      .map(c => `<option value="${S(c.id)}">${S(c.name)} (${c.room_count})</option>`)
      .join("");

    const configSection = `
      <div class="section">
        <div class="section-title">Konfigurace</div>
        <div class="field-row">
          <label class="field-label">Config ID</label>
          <input id="inp-config-id" class="field-input" type="text"
                 value="${S(configId)}" placeholder="main_navbar"
                 title="Technický identifikátor (snake_case). Musí být stejný na všech dashboardech kde kartu použiješ.">
        </div>
        ${existingOptions ? `
        <div class="field-row">
          <label class="field-label">Načíst existující</label>
          <select id="sel-existing" class="field-input">
            <option value="">── vybrat ──</option>
            ${existingOptions}
          </select>
        </div>` : ""}
        <div class="field-row">
          <label class="field-label">Název menu</label>
          <input id="inp-menu-name" class="field-input" type="text"
                 value="${S(menuConfig?.name ?? configId)}" placeholder="Main Navbar">
        </div>
      </div>`;

    // ── Pokoje ───────────────────────────────────────────────────────
    const roomsHtml = rooms.map((room, idx) => this._renderRoom(room, idx)).join("");

    const roomsSection = `
      <div class="section">
        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>Pokoje (${rooms.length})</span>
          <button id="btn-add-room" class="btn-secondary">+ Přidat pokoj</button>
        </div>
        ${rooms.length === 0 ? `<div class="empty-rooms">Žádné pokoje. Klikni <em>Přidat pokoj</em> pro začátek.</div>` : ""}
        ${roomsHtml}
      </div>`;

    // ── Uložit ───────────────────────────────────────────────────────
    const statusHtml = this._saveStatus === "ok"
      ? `<span class="status-ok">✓ Uloženo</span>`
      : this._saveStatus === "err"
      ? `<span class="status-err">✗ Chyba – zkontroluj HA logy</span>`
      : "";

    const saveSection = `
      <div class="section save-row">
        <button id="btn-save" class="btn-primary" ${this._saving ? "disabled" : ""}>
          ${this._saving ? "Ukládám…" : "💾 Uložit konfiguraci"}
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
    `;

    this.shadowRoot.innerHTML = `
      <style>${css}</style>
      ${backendBanner}
      ${newBanner}
      ${configSection}
      ${menuConfig !== null ? roomsSection + saveSection : '<div class="empty-rooms">Načítám…</div>'}
    `;

    this._attachDomListeners();
  }

  _renderRoom(room, idx) {
    const S = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const rid = room.id;
    const open = this._expanded.has(rid);

    const body = open ? `
      <div class="room-body">
        <!-- Základní -->
        <div class="sub-title">Základní</div>
        <div class="field-row">
          <label class="field-label">ID místnosti</label>
          <input class="field-input" type="text" data-r="${S(rid)}" data-f="id" value="${S(rid)}"
                 placeholder="bedroom" title="snake_case, unikátní v rámci konfigurace">
        </div>
        <div class="field-row">
          <label class="field-label">Světlo (entita)</label>
          <ha-entity-picker data-r="${S(rid)}" data-f="light_entity" allow-custom-entity></ha-entity-picker>
        </div>
        <div class="field-row">
          <label class="field-label">URL pozadí</label>
          <input class="field-input" type="text" data-r="${S(rid)}" data-f="image_url"
                 value="${S(room.image_url)}" placeholder="/local/Dashboards/Rooms/Bedroom.webp">
        </div>
        <div class="field-row">
          <label class="field-label">URL overlay</label>
          <input class="field-input" type="text" data-r="${S(rid)}" data-f="overlay_image_url"
                 value="${S(room.overlay_image_url)}" placeholder="/local/.../overlay.webp (volitelné)">
        </div>

        <!-- Senzory -->
        <div class="sub-title">Senzory</div>
        <div class="field-row">
          <label class="field-label">Teplota</label>
          <ha-entity-picker data-r="${S(rid)}" data-f="temp_sensor" allow-custom-entity></ha-entity-picker>
        </div>
        <div class="field-row">
          <label class="field-label">Vlhkost</label>
          <ha-entity-picker data-r="${S(rid)}" data-f="humidity_sensor" allow-custom-entity></ha-entity-picker>
        </div>

        <!-- Filtry -->
        <div class="sub-title">CSS filtry & přechody</div>
        <div class="field-row">
          <label class="field-label">Filter – noc/vypnuto</label>
          <input class="field-input" type="text" data-r="${S(rid)}" data-f="filter_off"
                 value="${S(room.filter_off)}" placeholder="brightness(0.6) saturate(1.0)">
        </div>
        <div class="field-row">
          <label class="field-label">Filter – světlo ON</label>
          <input class="field-input" type="text" data-r="${S(rid)}" data-f="filter_on"
                 value="${S(room.filter_on)}" placeholder="brightness(2.6) sepia(0.35) saturate(0.9)">
        </div>
        <div class="field-row">
          <label class="field-label">Filter – den</label>
          <input class="field-input" type="text" data-r="${S(rid)}" data-f="filter_day"
                 value="${S(room.filter_day)}" placeholder="brightness(1.7) sepia(0.12) saturate(1.05)">
        </div>
        <div class="field-row">
          <label class="field-label">Žaluzie (entita %)</label>
          <ha-entity-picker data-r="${S(rid)}" data-f="blind_entity" allow-custom-entity></ha-entity-picker>
        </div>
        <div class="field-row">
          <label class="field-label">Práh žaluzie</label>
          <input class="field-input" type="number" min="0" max="100" data-r="${S(rid)}" data-f="blind_threshold"
                 value="${S(room.blind_threshold ?? 36)}" title="Pod tuto % hodnotu = den (žaluzie otevřeny)">
        </div>
        <div class="field-row">
          <label class="field-label">Přechod filtru</label>
          <input class="field-input" type="text" data-r="${S(rid)}" data-f="transition_filter"
                 value="${S(room.transition_filter ?? "1.5s")}" placeholder="1.5s">
        </div>
        <div class="field-row">
          <label class="field-label">Přechod overlay</label>
          <input class="field-input" type="text" data-r="${S(rid)}" data-f="transition_overlay"
                 value="${S(room.transition_overlay ?? "2.0s")}" placeholder="2.0s">
        </div>

        <!-- Akce -->
        <div class="sub-title">Akce</div>
        ${this._renderActionBlock(room, "tap_action", "Kliknutí")}
        ${this._renderActionBlock(room, "hold_action", "Přidržení (>500ms)")}
        ${this._renderActionBlock(room, "double_tap_action", "Dvojklik")}
      </div>
    ` : "";

    return `
      <div class="room-card">
        <div class="room-header" data-toggle="${S(rid)}">
          <span class="room-chevron ${open ? "open" : ""}">▶</span>
          <span class="room-title">${S(rid)}</span>
          ${room.light_entity ? `<span class="room-id-badge">${S(room.light_entity)}</span>` : ""}
          <button class="btn-delete" data-delete-room="${S(rid)}" title="Smazat pokoj">🗑</button>
        </div>
        ${body}
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
          <label class="field-label">Cesta</label>
          <input class="field-input" type="text" data-r="${S(rid)}" data-ak="${actionKey}" data-f="navigation_path"
                 value="${S(action?.navigation_path)}" placeholder="/dashboard-home/bedroom">
        </div>`;
    } else if (currentType === "more-info") {
      extra = `
        <div class="field-row" style="margin-top:6px">
          <label class="field-label">Entita</label>
          <ha-entity-picker data-r="${S(rid)}" data-ak="${actionKey}" data-f="entity" allow-custom-entity></ha-entity-picker>
        </div>`;
    } else if (currentType === "fire-dom-event" || currentType === "call-service") {
      const json = action ? JSON.stringify(action, null, 2) : "{}";
      extra = `
        <div style="margin-top:6px">
          <label class="field-label" style="display:block;margin-bottom:4px">JSON akce</label>
          <textarea class="field-input" rows="5" data-r="${S(rid)}" data-ak="${actionKey}" data-f="json"
                    placeholder='{"action":"fire-dom-event","browser_mod":{...}}'>${S(json)}</textarea>
        </div>`;
    }

    return `
      <div class="action-block">
        <div class="action-label">${label}</div>
        <div class="field-row">
          <label class="field-label">Typ akce</label>
          <select class="field-input" data-r="${S(rid)}" data-action-type="${actionKey}">
            ${options}
          </select>
        </div>
        ${extra}
      </div>`;
  }

  // ------------------------------------------------------------------
  // DOM event listeners (voláno po každém _render)
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

    // Select existující konfigurace
    root.querySelector("#sel-existing")?.addEventListener("change", (e) => {
      const id = e.target.value;
      if (!id) return;
      this._cardConfig = { ...this._cardConfig, config_id: id };
      this._menuConfig = null;
      this._emitConfigChanged({ config_id: id });
      this._loadMenuConfig(id);
    });

    // Název menu
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
        // Neklikli jsme na delete button?
        if (e.target.closest("[data-delete-room]")) return;
        this._toggleExpand(el.dataset.toggle);
      });
    });

    // Delete room buttons
    root.querySelectorAll("[data-delete-room]").forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`Smazat pokoj "${el.dataset.deleteRoom}"?`)) {
          this._deleteRoom(el.dataset.deleteRoom);
        }
      });
    });

    // Textová pole pokojů – update bez re-renderu
    root.querySelectorAll("input[data-r][data-f], textarea[data-r][data-f]").forEach(el => {
      el.addEventListener("change", (e) => {
        const { r, f, ak } = e.target.dataset;
        if (ak) {
          // Pole patřící akci (navigation_path, json)
          const room = this._menuConfig?.rooms.find(rm => rm.id === r);
          if (!room) return;
          if (f === "json") {
            try { room[ak] = JSON.parse(e.target.value); } catch { /* nevalidní JSON, ignorujeme */ }
          } else {
            room[ak] = { ...(room[ak] ?? {}), [f]: e.target.value };
          }
        } else {
          // ID místnosti – speciální případ (musíme aktualizovat expanded set)
          if (f === "id") {
            const old = r;
            const newId = e.target.value.trim();
            const room = this._menuConfig?.rooms.find(rm => rm.id === old);
            if (room && newId && newId !== old) {
              room.id = newId;
              if (this._expanded.has(old)) { this._expanded.delete(old); this._expanded.add(newId); }
              this._render();
              return;
            }
          }
          this._setField(r, f, f === "blind_threshold" ? Number(e.target.value) : e.target.value);
        }
      });
    });

    // Action type selecty
    root.querySelectorAll("[data-action-type]").forEach(el => {
      el.addEventListener("change", (e) => {
        this._setActionType(e.target.dataset.r, e.target.dataset.actionType, e.target.value);
      });
    });

    // Entity pickery – základní pole pokoje
    root.querySelectorAll("ha-entity-picker[data-r][data-f]").forEach(picker => {
      if (this._hass) picker.hass = this._hass;
      const { r, f, ak } = picker.dataset;
      // Nastavíme aktuální hodnotu
      const room = this._menuConfig?.rooms.find(rm => rm.id === r);
      if (room) {
        picker.value = ak ? (room[ak]?.[f] ?? "") : (room[f] ?? "");
      }
      picker.addEventListener("value-changed", (e) => {
        const val = e.detail.value;
        if (ak) {
          const rm = this._menuConfig?.rooms.find(rm => rm.id === r);
          if (rm) rm[ak] = { ...(rm[ak] ?? {}), [f]: val };
        } else {
          this._setField(r, f, val);
        }
      });
    });
  }

  // ------------------------------------------------------------------
  // HA config-changed event
  // ------------------------------------------------------------------

  _emitConfigChanged(partialConfig) {
    const merged = { ...this._cardConfig, ...partialConfig };
    // Odstraníme undefined / null
    const clean = Object.fromEntries(Object.entries(merged).filter(([, v]) => v != null));
    fireEvent(this, "config-changed", { config: clean });
  }
}

// ---------------------------------------------------------------------------
// Registrace
// ---------------------------------------------------------------------------

customElements.define(CARD_TAG, RoomNavbarCard);
customElements.define(EDITOR_TAG, RoomNavbarCardEditor);

// Registrace v HA card picku
window.customCards = window.customCards ?? [];
window.customCards.push({
  type: CARD_TAG,
  name: "Room Navbar Card",
  description: "Sdílené navigační menu s výkonovými optimalizacemi. Sdílí se přes dashboardy pomocí config_id.",
  preview: true,
  documentationURL: "https://github.com/michals-home/room-navbar-card",
});

console.info(
  `%c ROOM-NAVBAR-CARD %c v${VERSION} `,
  "color:#fff;background:#1a73e8;font-weight:bold;padding:2px 4px;border-radius:3px 0 0 3px",
  "color:#1a73e8;background:#e8f0fe;font-weight:bold;padding:2px 4px;border-radius:0 3px 3px 0"
);
