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
// Inline card editor
// ---------------------------------------------------------------------------

class RoomNavbarCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._availableConfigs = null;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._availableConfigs) {
      this._fetchConfigs();
    }
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  async _fetchConfigs() {
    try {
      const result = await this._hass.connection.sendMessagePromise({
        type: "room_navbar/list_configs",
      });
      this._availableConfigs = result.configs ?? [];
    } catch {
      this._availableConfigs = [];
    }
    this._render();
  }

  _render() {
    const configs = this._availableConfigs;
    const currentId = this._config.config_id ?? "";

    let configSelect = "";
    if (configs === null) {
      configSelect = `<p style="color:var(--secondary-text-color);font-size:12px">Načítám konfigurace…</p>`;
    } else if (configs.length === 0) {
      configSelect = `
        <p style="color:var(--warning-color);font-size:12px">
          ⚠️ Integrace Room Navbar není nainstalována nebo neobsahuje žádné konfigurace.<br>
          Přidej integraci přes <em>Nastavení → Integrace → Room Navbar</em> a vytvoř první konfiguraci.
        </p>
      `;
    } else {
      const options = configs.map(
        (c) => `<option value="${c.id}" ${c.id === currentId ? "selected" : ""}>${c.name} (${c.room_count} pokojů)</option>`
      ).join("");
      configSelect = `
        <label style="display:block;margin-bottom:4px;font-size:12px;color:var(--secondary-text-color)">
          Konfigurace menu
        </label>
        <select id="config-select" style="
          width:100%;padding:8px;
          background:var(--card-background-color);
          color:var(--primary-text-color);
          border:1px solid rgba(255,255,255,0.15);
          border-radius:8px;font-size:14px;
        ">
          ${options}
        </select>
      `;
    }

    // Přepínač: inline nebo backend mód
    const isInline = Array.isArray(this._config.rooms);
    const modeNote = isInline
      ? `<p style="font-size:11px;color:var(--warning-color)">
          Inline mód – konfigurace je uložena přímo v YAML karty.<br>
          Pro sdílení přes dashboardy přidej konfiguraci do backendu a použij <code>config_id</code>.
         </p>`
      : `<p style="font-size:11px;color:var(--success-color)">
          Backend mód – konfigurace sdílena přes všechny dashboardy.
         </p>`;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: var(--paper-font-body1_-_font-family); }
        .section { margin-bottom: 16px; }
        code { background: rgba(255,255,255,0.08); padding: 2px 5px; border-radius: 4px; font-size: 11px; }
      </style>
      <div class="section">
        ${configSelect}
        ${modeNote}
      </div>
      <div class="section" style="font-size:12px;color:var(--secondary-text-color)">
        <strong>Schéma konfigurace pokoje:</strong><br>
        <code>id</code>, <code>light_entity</code>, <code>image_url</code>,
        <code>temp_sensor</code>, <code>humidity_sensor</code>,
        <code>filter_off/on/day</code>, <code>tap_action</code>, <code>hold_action</code>, <code>double_tap_action</code>
      </div>
    `;

    this.shadowRoot.querySelector("#config-select")?.addEventListener("change", (e) => {
      this._fireConfigChanged({ ...this._config, config_id: e.target.value, rooms: undefined });
    });
  }

  _fireConfigChanged(config) {
    // Odstraníme undefined klíče
    const clean = Object.fromEntries(Object.entries(config).filter(([, v]) => v !== undefined));
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
