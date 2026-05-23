/**
 * room-navbar-card  v0.1.1
 *
 * Pure Lovelace card – no Python backend, config stored in card YAML.
 *
 * RoomNavbarCard       – display card  (LitElement, shadow DOM)
 * RoomNavbarCardEditor – GUI editor    (LitElement, light DOM + ha-form)
 *
 * Gesture support:
 *   tap            → tap_action
 *   double-tap     → double_tap_action
 *   hold (500 ms)  → hold_action
 */

import { LitElement, html, css, nothing } from 'lit';

const VERSION    = '0.1.1';
const CARD_TAG   = 'room-navbar-card';
const EDITOR_TAG = 'room-navbar-card-editor';

const DEFAULT_OFF = 'brightness(0.6) saturate(1.0)';
const DEFAULT_ON  = 'brightness(1.8) sepia(0.2) saturate(1.2)';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fireEvent(node, type, detail = {}) {
  const ev = new Event(type, { bubbles: true, cancelable: false, composed: true });
  ev.detail = detail;
  node.dispatchEvent(ev);
}

function navigate(path) {
  window.history.pushState(null, '', path);
  fireEvent(window, 'location-changed', { replace: false });
}

function tempColor(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return 'rgba(255,255,255,0.85)';
  return n > 25 ? '#ff4d4f' : n < 18 ? '#40a9ff' : '#52c41a';
}

function humColor(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return 'rgba(255,255,255,0.85)';
  return n >= 60 ? '#ff4d4f' : n >= 55 ? '#faad14' : '#52c41a';
}

function parseFilter(str = '') {
  const get = fn => {
    const m = str.match(new RegExp(fn + '\\(([^)]+)\\)'));
    return m ? parseFloat(m[1]) : null;
  };
  const hr = str.match(/hue-rotate\(([^)]+)deg\)/);
  return {
    brightness: get('brightness') ?? 1.0,
    saturate:   get('saturate')   ?? 1.0,
    sepia:      get('sepia')      ?? 0.0,
    hueRotate:  hr ? parseFloat(hr[1]) : 0.0,
  };
}

function buildFilter({ brightness, saturate, sepia, hueRotate }) {
  const parts = [
    `brightness(${brightness.toFixed(2)})`,
    `saturate(${saturate.toFixed(2)})`,
  ];
  if (sepia)     parts.push(`sepia(${sepia.toFixed(2)})`);
  if (hueRotate) parts.push(`hue-rotate(${Math.round(hueRotate)}deg)`);
  return parts.join(' ');
}

// ── Display card ──────────────────────────────────────────────────────────────

class RoomNavbarCard extends LitElement {

  static properties = {
    hass:    { attribute: false },
    _config: { state: true },
  };

  static styles = css`
    :host { display: block; }

    .navbar {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      scrollbar-width: none;
      padding: 4px 2px;
    }
    .navbar::-webkit-scrollbar { display: none; }

    .room-btn {
      flex: 0 0 auto;
      position: relative;
      width: 90px;
      height: 90px;
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }

    .room-bg {
      position: absolute;
      inset: 0;
      background-size: cover;
      background-position: center;
      transition-property: filter;
      transition-timing-function: ease;
    }

    .room-overlay {
      position: absolute;
      inset: 0;
      background-size: cover;
      background-position: center;
    }

    /* Gradient overlay – bottom fade for label readability */
    .room-gradient {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to bottom,
        transparent 40%,
        rgba(0,0,0,0.55) 100%
      );
      pointer-events: none;
    }

    /* Temperature – top-left corner */
    .sensor-temp {
      position: absolute;
      top: 6px;
      left: 7px;
      font-size: 10px;
      font-weight: 800;
      line-height: 1;
      text-shadow: 0 1px 3px rgba(0,0,0,0.9);
      pointer-events: none;
    }

    /* Humidity – bottom-left corner */
    .sensor-hum {
      position: absolute;
      bottom: 6px;
      left: 7px;
      font-size: 10px;
      font-weight: 800;
      line-height: 1;
      text-shadow: 0 1px 3px rgba(0,0,0,0.9);
      pointer-events: none;
    }

    /* Room label – bottom-right corner */
    .room-label {
      position: absolute;
      bottom: 6px;
      right: 6px;
      font-size: 10px;
      font-weight: 600;
      color: #fff;
      text-shadow: 0 1px 3px rgba(0,0,0,0.9);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 70%;
      text-align: right;
      pointer-events: none;
    }
  `;

  constructor() {
    super();
    // Gesture state (per room-id)
    this._holdTimers = new Map(); // roomId → timer
    this._held       = new Set(); // rooms where hold just fired
    this._clicks     = new Map(); // roomId → { count, timer }
  }

  setConfig(config) {
    if (!config.rooms) throw new Error('room-navbar-card: "rooms" is required');
    this._config = config;
  }

  static getConfigElement() {
    return document.createElement(EDITOR_TAG);
  }

  static getStubConfig() {
    return {
      rooms: [{
        id:               'bedroom',
        label:            'Bedroom',
        image_url:        '/local/Dashboards/Rooms/Bedroom.webp',
        light_entity:     '',
        temp_sensor:      '',
        humidity_sensor:  '',
        filter_off:       DEFAULT_OFF,
        filter_on:        DEFAULT_ON,
        transition_filter:'1.5s',
        tap_action:        { action: 'navigate', navigation_path: '/lovelace/0' },
        double_tap_action: { action: 'none' },
        hold_action:       { action: 'none' },
      }],
    };
  }

  // ── Gesture handlers ─────────────────────────────────────────────────────

  _onPointerDown(room) {
    const ha = room.hold_action;
    if (!ha || ha.action === 'none') return;
    const t = setTimeout(() => {
      this._holdTimers.delete(room.id);
      this._held.add(room.id);
      this._handleAction(room, ha);
    }, 500);
    this._holdTimers.set(room.id, t);
  }

  _onPointerUp(room) {
    const t = this._holdTimers.get(room.id);
    if (t) { clearTimeout(t); this._holdTimers.delete(room.id); }
  }

  _onClick(room) {
    // If hold already fired for this room, swallow the click
    if (this._held.has(room.id)) {
      this._held.delete(room.id);
      return;
    }

    const dta = room.double_tap_action;
    const hasDt = dta && dta.action !== 'none';

    if (!hasDt) {
      // No double-tap configured → immediate tap action
      this._handleAction(room, room.tap_action);
      return;
    }

    // Double-tap detection
    const state = this._clicks.get(room.id) ?? { count: 0, timer: null };
    clearTimeout(state.timer);
    state.count++;

    if (state.count >= 2) {
      this._clicks.delete(room.id);
      this._handleAction(room, dta);
    } else {
      state.timer = setTimeout(() => {
        this._clicks.delete(room.id);
        this._handleAction(room, room.tap_action);
      }, 300);
      this._clicks.set(room.id, state);
    }
  }

  // ── Action dispatch ───────────────────────────────────────────────────────

  _handleAction(room, cfg) {
    if (!cfg || cfg.action === 'none') return;
    switch (cfg.action) {
      case 'navigate':
        navigate(cfg.navigation_path ?? '/');
        break;
      case 'more-info':
        fireEvent(this, 'hass-more-info', {
          entityId: cfg.entity ?? room.light_entity ?? '',
        });
        break;
      case 'toggle':
        if (room.light_entity && this.hass)
          this.hass.callService('homeassistant', 'toggle', {
            entity_id: room.light_entity,
          });
        break;
      case 'fire-dom-event':
        fireEvent(window, 'll-custom', cfg.browser_mod ?? {});
        break;
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    if (!this._config) return nothing;
    return html`
      <div class="navbar">
        ${this._config.rooms.map(r => this._renderRoom(r))}
      </div>
    `;
  }

  _renderRoom(room) {
    const filter  = this._computeFilter(room);
    const tempVal = room.temp_sensor
      ? this.hass?.states[room.temp_sensor]?.state : null;
    const humVal  = room.humidity_sensor
      ? this.hass?.states[room.humidity_sensor]?.state : null;
    const label   = room.label ?? '';

    const lightOn  = room.light_entity
      ? this.hass?.states[room.light_entity]?.state === 'on' : false;
    const border   = lightOn
      ? (room.border_on  ?? '1px solid rgba(255,165,0,0.45)')
      : (room.border_off ?? '1px solid rgba(255,255,255,0.1)');
    const overlayOpacity = (room.overlay_image_url && lightOn) ? '1' : '0';

    return html`
      <div class="room-btn"
        style="border:${border};"
        @click=${() => this._onClick(room)}
        @pointerdown=${() => this._onPointerDown(room)}
        @pointerup=${() => this._onPointerUp(room)}
        @pointercancel=${() => this._onPointerUp(room)}>

        <!-- Background image with filter -->
        <div class="room-bg" style="
          background-image: url('${room.image_url ?? ''}');
          filter: ${filter};
          transition-duration: ${room.transition_filter ?? '1.5s'};
        "></div>

        <!-- Optional overlay image (opacity transition on light state) -->
        ${room.overlay_image_url ? html`
          <div class="room-overlay" style="
            background-image:url('${room.overlay_image_url}');
            opacity:${overlayOpacity};
            transition:opacity ${room.transition_filter ?? '1.5s'} ease;
          "></div>
        ` : nothing}

        <!-- Bottom gradient -->
        <div class="room-gradient"></div>

        <!-- Temperature – top-left -->
        ${tempVal != null ? html`
          <div class="sensor-temp" style="color:${tempColor(tempVal)}">
            ${parseFloat(tempVal).toFixed(1)}°
          </div>
        ` : nothing}

        <!-- Humidity – bottom-left -->
        ${humVal != null ? html`
          <div class="sensor-hum" style="color:${humColor(humVal)}">
            ${Math.round(parseFloat(humVal))}%
          </div>
        ` : nothing}

        <!-- Label – bottom-right -->
        ${label ? html`<div class="room-label">${label}</div>` : nothing}

      </div>
    `;
  }

  _computeFilter(room) {
    if (!this.hass) return room.filter_off ?? DEFAULT_OFF;
    const ls = room.light_entity
      ? this.hass.states[room.light_entity] : null;
    if (ls?.state === 'on') return room.filter_on ?? DEFAULT_ON;

    // Day condition: sun entity + optional blind threshold
    if (room.filter_day) {
      const sunState  = room.sun_entity
        ? this.hass.states[room.sun_entity]?.state : null;
      const wantedSun = room.sun_state ?? 'above_horizon';
      const sunOk     = sunState === wantedSun;

      let blindOk = true;
      if (room.blind_entity != null) {
        const blindVal = parseFloat(
          this.hass.states[room.blind_entity]?.state ?? '100'
        );
        const threshold = room.blind_threshold ?? 50;
        blindOk = blindVal < threshold;
      }

      if (sunOk && blindOk) return room.filter_day;
    }

    return room.filter_off ?? DEFAULT_OFF;
  }
}

// ── Editor ────────────────────────────────────────────────────────────────────

const ENTITY_SCHEMA = [
  { name: 'light_entity',    label: 'Light entity',       selector: { entity: {} } },
  { name: 'temp_sensor',     label: 'Temperature sensor', selector: { entity: { domain: 'sensor' } } },
  { name: 'humidity_sensor', label: 'Humidity sensor',    selector: { entity: { domain: 'sensor' } } },
];

const ACTION_TYPES = [
  { value: 'none',      label: 'None' },
  { value: 'navigate',  label: 'Navigate to path' },
  { value: 'more-info', label: 'More info' },
  { value: 'toggle',    label: 'Toggle light' },
];

const MORE_INFO_SCHEMA = [
  { name: 'entity', label: 'Entity', selector: { entity: {} } },
];

class RoomNavbarCardEditor extends LitElement {

  static properties = {
    hass:      { attribute: false },
    _config:   { state: true },
    _expanded: { state: true },
  };

  // Light DOM – ha-form must not be inside a shadow root
  createRenderRoot() { return this; }

  constructor() {
    super();
    this._config   = { rooms: [] };
    this._expanded = new Set();
  }

  setConfig(config) {
    this._config = { rooms: [], ...config };
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  _emit() {
    fireEvent(this, 'config-changed', { config: this._config });
  }

  _updateRoom(roomId, patch) {
    this._config = {
      ...this._config,
      rooms: this._config.rooms.map(r =>
        r.id === roomId ? { ...r, ...patch } : r
      ),
    };
    this._emit();
  }

  _addRoom() {
    const id = `room_${Date.now()}`;
    this._config = {
      ...this._config,
      rooms: [...this._config.rooms, {
        id,
        label:            '',
        image_url:        '',
        overlay_image_url:'',
        light_entity:     '',
        temp_sensor:      '',
        humidity_sensor:  '',
        filter_off:        DEFAULT_OFF,
        filter_on:         DEFAULT_ON,
        transition_filter: '1.5s',
        tap_action:        { action: 'navigate', navigation_path: '/lovelace/0' },
        double_tap_action: { action: 'none' },
        hold_action:       { action: 'none' },
      }],
    };
    this._expanded = new Set([...this._expanded, id]);
    this._emit();
  }

  _deleteRoom(roomId) {
    if (!confirm(`Delete room "${roomId}"?`)) return;
    this._config = {
      ...this._config,
      rooms: this._config.rooms.filter(r => r.id !== roomId),
    };
    this._emit();
  }

  _toggleExpand(roomId) {
    const s = new Set(this._expanded);
    s.has(roomId) ? s.delete(roomId) : s.add(roomId);
    this._expanded = s;
  }

  _changeRoomId(oldId, newId) {
    newId = newId.trim();
    if (!newId || newId === oldId) return;
    this._config = {
      ...this._config,
      rooms: this._config.rooms.map(r =>
        r.id === oldId ? { ...r, id: newId } : r
      ),
    };
    const s = new Set(this._expanded);
    s.delete(oldId); s.add(newId);
    this._expanded = s;
    this._emit();
  }

  _updateFilter(roomId, filterKey, component, value) {
    const room = this._config.rooms.find(r => r.id === roomId);
    if (!room) return;
    const parsed = parseFilter(room[filterKey] ?? '');
    parsed[component] = value;
    this._updateRoom(roomId, { [filterKey]: buildFilter(parsed) });
  }

  _setAction(roomId, actionKey, type, room) {
    const cur = room[actionKey] ?? {};
    let action;
    if (type === 'navigate') {
      action = { action: 'navigate', navigation_path: cur.navigation_path ?? '/lovelace/0' };
    } else if (type === 'more-info') {
      action = { action: 'more-info', entity: cur.entity ?? '' };
    } else {
      action = { action: type };
    }
    this._updateRoom(roomId, { [actionKey]: action });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    return html`
      ${this._styles()}
      <div class="rnc-editor">
        <div class="rnc-header">
          <span class="rnc-title">Rooms (${this._config.rooms.length})</span>
          <button class="rnc-btn-add" @click=${() => this._addRoom()}>+ Add room</button>
        </div>

        ${this._config.rooms.length === 0 ? html`
          <div class="rnc-empty">No rooms yet – click <em>+ Add room</em> to start.</div>
        ` : nothing}

        ${this._config.rooms.map(room => this._renderRoomCard(room))}
      </div>
    `;
  }

  _renderRoomCard(room) {
    const open = this._expanded.has(room.id);
    return html`
      <div class="rnc-room-card">
        <div class="rnc-room-header" @click=${e => {
          if (e.target.closest('[data-del]')) return;
          this._toggleExpand(room.id);
        }}>
          <span class="rnc-chevron ${open ? 'open' : ''}">▶</span>
          <span class="rnc-room-name">${room.label || room.id || '(unnamed)'}</span>
          <button class="rnc-btn-delete" data-del="1"
            @click=${e => { e.stopPropagation(); this._deleteRoom(room.id); }}>🗑</button>
        </div>
        ${open ? this._renderBody(room) : nothing}
      </div>
    `;
  }

  _renderBody(room) {
    return html`
      <div class="rnc-body">

        <!-- Room ID (internal key) -->
        <div class="rnc-row">
          <label class="rnc-lbl">Room ID</label>
          <input class="rnc-inp" type="text" .value=${room.id}
            placeholder="bedroom"
            @change=${e => this._changeRoomId(room.id, e.target.value)}>
        </div>

        <!-- Display label -->
        <div class="rnc-row">
          <label class="rnc-lbl">Label <span class="rnc-hint">(shown on card)</span></label>
          <input class="rnc-inp" type="text" .value=${room.label ?? ''}
            placeholder="Bedroom (leave empty to hide)"
            @input=${e => this._updateRoom(room.id, { label: e.target.value })}>
        </div>

        <!-- Images -->
        <div class="rnc-row">
          <label class="rnc-lbl">Background URL</label>
          <input class="rnc-inp" type="text" .value=${room.image_url ?? ''}
            placeholder="/local/Dashboards/Rooms/Bedroom.webp"
            @input=${e => this._updateRoom(room.id, { image_url: e.target.value })}>
        </div>
        <div class="rnc-row">
          <label class="rnc-lbl">Overlay URL</label>
          <input class="rnc-inp" type="text" .value=${room.overlay_image_url ?? ''}
            placeholder="/local/.../overlay.webp (optional)"
            @input=${e => this._updateRoom(room.id, { overlay_image_url: e.target.value })}>
        </div>

        <!-- Entity pickers via ha-form -->
        <div class="rnc-sub">Entities</div>
        <ha-form
          .hass=${this.hass}
          .data=${{
            light_entity:    room.light_entity    ?? '',
            temp_sensor:     room.temp_sensor     ?? '',
            humidity_sensor: room.humidity_sensor ?? '',
          }}
          .schema=${ENTITY_SCHEMA}
          .computeLabel=${s => s.label}
          @value-changed=${e => this._updateRoom(room.id, e.detail.value)}>
        </ha-form>

        <!-- Filter sliders -->
        <div class="rnc-sub">Image filters</div>
        <div class="rnc-filters">
          ${this._renderFilter(room, 'filter_off', '🌙 Off / Night')}
          ${this._renderFilter(room, 'filter_on',  '💡 Light ON')}
        </div>
        <div class="rnc-row" style="margin-top:6px">
          <label class="rnc-lbl">Filter transition</label>
          <input class="rnc-inp" type="text" style="max-width:80px"
            .value=${room.transition_filter ?? '1.5s'}
            @input=${e => this._updateRoom(room.id, { transition_filter: e.target.value })}>
        </div>

        <!-- Tap action -->
        <div class="rnc-sub">Tap action</div>
        ${this._renderActionSection(room, 'tap_action')}

        <!-- Double-tap action -->
        <div class="rnc-sub">Double-tap action</div>
        ${this._renderActionSection(room, 'double_tap_action')}

        <!-- Hold action -->
        <div class="rnc-sub">Hold action <span class="rnc-hint">(500 ms)</span></div>
        ${this._renderActionSection(room, 'hold_action')}

      </div>
    `;
  }

  _renderActionSection(room, actionKey) {
    const cfg  = room[actionKey] ?? { action: 'none' };
    const type = cfg.action ?? 'none';
    return html`
      <div class="rnc-row">
        <label class="rnc-lbl">Action</label>
        <select class="rnc-inp"
          @change=${e => this._setAction(room.id, actionKey, e.target.value, room)}>
          ${ACTION_TYPES.map(t => html`
            <option value="${t.value}" ?selected=${t.value === type}>${t.label}</option>
          `)}
        </select>
      </div>

      ${type === 'navigate' ? html`
        <div class="rnc-row">
          <label class="rnc-lbl">Path</label>
          <input class="rnc-inp" type="text"
            .value=${cfg.navigation_path ?? ''}
            placeholder="/lovelace/bedroom"
            @input=${e => this._updateRoom(room.id, {
              [actionKey]: { ...cfg, navigation_path: e.target.value },
            })}>
        </div>
      ` : nothing}

      ${type === 'more-info' ? html`
        <ha-form
          .hass=${this.hass}
          .data=${{ entity: cfg.entity ?? '' }}
          .schema=${MORE_INFO_SCHEMA}
          .computeLabel=${s => s.label}
          @value-changed=${e => this._updateRoom(room.id, {
            [actionKey]: { ...cfg, ...e.detail.value },
          })}>
        </ha-form>
      ` : nothing}
    `;
  }

  _renderFilter(room, filterKey, label) {
    const str = room[filterKey] ?? '';
    const { brightness, saturate, sepia, hueRotate } = parseFilter(str);
    const sliders = [
      { icon: '☀',  key: 'brightness', min: 0.1,  max: 3,   step: 0.05, val: brightness },
      { icon: '🎨', key: 'saturate',   min: 0,    max: 4,   step: 0.05, val: saturate   },
      { icon: '🟫', key: 'sepia',      min: 0,    max: 1,   step: 0.05, val: sepia       },
      { icon: '🌈', key: 'hueRotate',  min: -180, max: 180, step: 1,    val: hueRotate   },
    ];
    return html`
      <div class="rnc-filter-block">
        <div class="rnc-filter-title">${label}</div>
        <div class="rnc-preview" style="filter:${str}"></div>
        ${sliders.map(({ icon, key, min, max, step, val }) => html`
          <div class="rnc-slider-row">
            <span class="rnc-icon">${icon}</span>
            <input type="range" class="rnc-slider" min=${min} max=${max} step=${step}
              .value=${String(val)}
              @input=${e => this._updateFilter(room.id, filterKey, key, parseFloat(e.target.value))}>
            <span class="rnc-val">
              ${key === 'hueRotate' ? `${Math.round(val)}°` : val.toFixed(2)}
            </span>
          </div>
        `)}
        <div class="rnc-raw">${str || '—'}</div>
      </div>
    `;
  }

  // ── Styles (injected into light DOM) ─────────────────────────────────────

  _styles() {
    return html`<style>
      room-navbar-card-editor { display: block; }
      .rnc-editor { font-family: var(--paper-font-body1_-_font-family, sans-serif); }

      .rnc-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 10px;
      }
      .rnc-title {
        font-size: 13px; font-weight: 600; text-transform: uppercase;
        letter-spacing: .5px; color: var(--primary-text-color);
      }
      .rnc-btn-add {
        padding: 6px 12px;
        background: rgba(255,255,255,0.07);
        color: var(--primary-text-color);
        border: 1px solid var(--divider-color, rgba(255,255,255,0.12));
        border-radius: 6px; font-size: 12px; cursor: pointer;
      }
      .rnc-btn-add:hover { background: rgba(255,255,255,0.12); }
      .rnc-empty {
        font-size: 13px; color: var(--secondary-text-color);
        padding: 20px; text-align: center;
        border: 1px dashed var(--divider-color, rgba(255,255,255,0.15));
        border-radius: 8px; margin-bottom: 8px;
      }
      .rnc-room-card {
        border: 1px solid var(--divider-color, rgba(255,255,255,0.1));
        border-radius: 10px; margin-bottom: 8px; overflow: hidden;
      }
      .rnc-room-header {
        display: flex; align-items: center; gap: 8px;
        padding: 10px 14px; cursor: pointer; user-select: none;
        background: rgba(255,255,255,0.04);
      }
      .rnc-room-header:hover { background: rgba(255,255,255,0.07); }
      .rnc-chevron { font-size: 10px; color: var(--secondary-text-color); transition: transform .2s; flex-shrink: 0; }
      .rnc-chevron.open { transform: rotate(90deg); }
      .rnc-room-name { flex: 1; font-size: 13px; font-weight: 500; }
      .rnc-btn-delete { background: none; border: none; cursor: pointer; font-size: 14px; color: var(--error-color, #cf6679); padding: 4px; }
      .rnc-body { padding: 14px; }
      .rnc-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
      .rnc-lbl { flex: 0 0 140px; font-size: 12px; color: var(--secondary-text-color); }
      .rnc-hint { font-size: 10px; opacity: .7; font-style: italic; }
      .rnc-inp {
        flex: 1; padding: 7px 10px;
        background: var(--input-fill-color, rgba(255,255,255,0.06));
        color: var(--primary-text-color);
        border: 1px solid var(--divider-color, rgba(255,255,255,0.12));
        border-radius: 6px; font-size: 13px;
      }
      .rnc-inp:focus { outline: none; border-color: var(--primary-color); }
      .rnc-sub {
        font-size: 11px; font-weight: 600; text-transform: uppercase;
        letter-spacing: .4px; color: var(--secondary-text-color);
        margin: 14px 0 6px; padding-top: 10px;
        border-top: 1px solid var(--divider-color, rgba(255,255,255,0.08));
      }
      .rnc-filters { display: flex; gap: 8px; flex-wrap: wrap; }
      .rnc-filter-block {
        flex: 1; min-width: 140px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px; padding: 10px 12px;
      }
      .rnc-filter-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--secondary-text-color); margin-bottom: 8px; }
      .rnc-preview {
        width: 100%; height: 30px; border-radius: 4px; margin-bottom: 10px;
        background: linear-gradient(135deg, #0d1b2a 0%, #1b3a5c 20%, #2e6da4 40%, #e8a045 60%, #f5d76e 80%, #fff 100%);
      }
      .rnc-slider-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
      .rnc-icon  { flex: 0 0 20px; font-size: 12px; text-align: center; }
      .rnc-slider { flex: 1; height: 4px; cursor: pointer; accent-color: var(--primary-color); }
      .rnc-val { flex: 0 0 36px; font-size: 10px; text-align: right; color: var(--primary-text-color); font-family: monospace; }
      .rnc-raw { font-size: 9px; color: var(--secondary-text-color); font-family: monospace; margin-top: 6px; word-break: break-all; line-height: 1.4; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.06); }
    </style>`;
  }
}

// ── Registration ──────────────────────────────────────────────────────────────

if (!customElements.get(CARD_TAG)) {
  customElements.define(CARD_TAG, RoomNavbarCard);
  console.info(
    `%c room-navbar-card %c v${VERSION} `,
    'background:#1976d2;color:#fff;font-weight:700',
    'background:#333;color:#fff',
  );
}

if (!customElements.get(EDITOR_TAG)) {
  customElements.define(EDITOR_TAG, RoomNavbarCardEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.find(c => c.type === CARD_TAG)) {
  window.customCards.push({
    type:        CARD_TAG,
    name:        'Room Navbar Card',
    description: 'Scrollable navigation bar with per-room images, filters, temperature and humidity.',
    preview:     true,
  });
}
