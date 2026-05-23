/**
 * room-navbar-card  v0.0.15
 *
 * LitElement rewrite – proper HA custom card with GUI editor.
 *
 * Architecture:
 *   - RoomNavbarCard      : display card, renders navbar with room images + filters
 *   - RoomNavbarCardEditor: LitElement editor with ha-entity-picker, sliders, actions
 *
 * Filter: Python backend sensor (sensor.rnc_{config_id}_{room_id}_filter) takes
 *   priority; JS fallback used when sensor is unavailable.
 */

import { LitElement, html, css, nothing } from 'lit';

const VERSION      = '0.0.15';
const CARD_TAG     = 'room-navbar-card';
const EDITOR_TAG   = 'room-navbar-card-editor';
const SENSOR_PFX   = 'rnc';

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  if (isNaN(n)) return 'rgba(255,255,255,0.7)';
  return n > 25 ? '#ff4d4f' : n < 18 ? '#40a9ff' : '#52c41a';
}

function humColor(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return 'rgba(255,255,255,0.7)';
  return n >= 60 ? '#ff4d4f' : n >= 55 ? '#faad14' : '#52c41a';
}

function parseFilter(str = '') {
  const get = fn => {
    const m = str.match(new RegExp(fn + '\\(([^)]+)\\)'));
    return m ? parseFloat(m[1]) : null;
  };
  return {
    brightness: get('brightness') ?? 1.0,
    saturate:   get('saturate')   ?? 1.0,
    sepia:      get('sepia')      ?? 0.0,
    hueRotate:  get('hue-rotate') ?? 0.0,
  };
}

function buildFilter({ brightness, saturate, sepia, hueRotate }) {
  const p = [`brightness(${brightness.toFixed(2)})`];
  if (sepia > 0.005)                p.push(`sepia(${sepia.toFixed(2)})`);
  if (Math.abs(saturate - 1) > 0.01) p.push(`saturate(${saturate.toFixed(2)})`);
  if (Math.abs(hueRotate) > 0.5)   p.push(`hue-rotate(${Math.round(hueRotate)}deg)`);
  return p.join(' ');
}

function slugify(s = '') {
  return s.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

// ── Tap / Hold / Double-tap ───────────────────────────────────────────────────

class ActionHandler {
  constructor(el, cb) {
    this._el = el; this._cb = cb;
    this._timer = null; this._tapCount = 0; this._tapTimer = null; this._fired = false;
    this._bind();
  }
  _bind() {
    const onDown = e => {
      e.preventDefault(); this._fired = false;
      this._timer = setTimeout(() => { this._fired = true; this._cb.hold?.(); }, 500);
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
    const onCancel = () => { clearTimeout(this._timer); this._fired = true; };
    this._el.addEventListener('mousedown', onDown);
    this._el.addEventListener('mouseup', onUp);
    this._el.addEventListener('touchstart', onDown, { passive: false });
    this._el.addEventListener('touchend', onUp);
    this._el.addEventListener('touchmove', onCancel, { passive: true });
  }
}

// ── Main card ─────────────────────────────────────────────────────────────────

class RoomNavbarCard extends LitElement {
  static properties = {
    hass:        { attribute: false },
    _menuConfig: { state: true },
  };

  _cardConfig    = null;
  _configLoaded  = false;
  _actionHandlers = [];

  static getConfigElement() { return document.createElement(EDITOR_TAG); }
  static getStubConfig()    { return { config_id: 'main_navbar' }; }
  getCardSize()             { return 1; }

  setConfig(config) {
    if (!config) throw new Error('room-navbar-card: missing config');
    this._cardConfig   = config;
    this._configLoaded = false;
    if (config.rooms?.length) {
      this._menuConfig = { rooms: config.rooms };
    } else if (this.hass) {
      this._loadConfig();
    }
  }

  updated(changed) {
    if (changed.has('hass') && this.hass && !this._configLoaded && this._cardConfig?.config_id) {
      this._loadConfig();
    }
    if (changed.has('_menuConfig')) {
      this._bindActions();
    }
  }

  async _loadConfig() {
    this._configLoaded = true;
    try {
      this._menuConfig = await this.hass.connection.sendMessagePromise({
        type: 'room_navbar/get_config',
        config_id: this._cardConfig.config_id,
      });
    } catch {
      this._menuConfig = null;
    }
  }

  _computeFilter(room) {
    if (this._cardConfig?.config_id && this.hass) {
      const id = `sensor.${SENSOR_PFX}_${slugify(this._cardConfig.config_id)}_${slugify(room.id)}_filter`;
      const s  = this.hass.states[id];
      if (s && s.state && s.state !== 'unavailable' && s.state !== 'unknown') return s.state;
    }
    if (!this.hass) return room.filter_off ?? 'brightness(0.6)';
    const on = this.hass.states[room.light_entity]?.state === 'on';
    return on ? (room.filter_on ?? 'brightness(1.8) sepia(0.2)') : (room.filter_off ?? 'brightness(0.6)');
  }

  _handleAction(room, action) {
    if (!action || action.action === 'none') return;
    switch (action.action) {
      case 'navigate':
        navigate(action.navigation_path ?? '/');
        break;
      case 'more-info':
        fireEvent(this, 'hass-more-info', { entityId: action.entity ?? room.light_entity });
        break;
      case 'toggle':
        if (room.light_entity) this.hass.callService('homeassistant', 'toggle', { entity_id: room.light_entity });
        break;
      case 'fire-dom-event':
        fireEvent(this, 'll-custom', action);
        break;
      case 'call-service': {
        const [domain, service] = (action.service ?? '').split('.');
        if (domain && service) this.hass.callService(domain, service, action.service_data ?? {});
        break;
      }
    }
  }

  _bindActions() {
    this._actionHandlers.forEach(h => h._el.remove?.());
    this._actionHandlers = [];
    this.shadowRoot?.querySelectorAll('.room-btn').forEach(el => {
      const roomId = el.dataset.room;
      const room   = this._menuConfig?.rooms.find(r => r.id === roomId);
      if (!room) return;
      this._actionHandlers.push(new ActionHandler(el, {
        tap:        () => this._handleAction(room, room.tap_action),
        hold:       () => this._handleAction(room, room.hold_action),
        double_tap: () => this._handleAction(room, room.double_tap_action),
      }));
    });
  }

  static styles = css`
    :host { display: block; }
    .navbar {
      display: flex;
      gap: 6px;
      padding: 6px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .navbar::-webkit-scrollbar { display: none; }
    .room-btn {
      flex: 0 0 auto;
      width: 72px;
      height: 90px;
      border-radius: 12px;
      overflow: hidden;
      position: relative;
      cursor: pointer;
      user-select: none;
    }
    .room-bg {
      position: absolute; inset: 0;
      background-size: cover;
      background-position: center;
      transition: filter 1.5s ease;
    }
    .room-overlay {
      position: absolute; inset: 0;
      background-size: cover;
      background-position: center;
      transition: opacity 2s ease;
    }
    .room-info {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      justify-content: flex-end;
      padding: 4px;
      background: linear-gradient(to top, rgba(0,0,0,.5) 0%, transparent 60%);
    }
    .room-label {
      font-size: 9px; font-weight: 600;
      color: #fff; text-align: center;
      text-shadow: 0 1px 3px rgba(0,0,0,.8);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .room-sensors {
      display: flex; justify-content: center; gap: 3px;
      font-size: 8px; color: rgba(255,255,255,.85);
    }
    .placeholder {
      padding: 16px; font-size: 13px;
      color: var(--secondary-text-color);
      white-space: pre-line;
    }
  `;

  render() {
    const rooms = this._menuConfig?.rooms;
    if (!rooms?.length) {
      return html`<div class="placeholder">${
        this._menuConfig === null
          ? 'Loading configuration…'
          : this._menuConfig
            ? 'No rooms in configuration.'
            : `⚠️ Configuration '${this._cardConfig?.config_id}' not found.`
      }</div>`;
    }
    return html`
      <div class="navbar">
        ${rooms.map(room => this._renderRoom(room))}
      </div>
    `;
  }

  _renderRoom(room) {
    const filter   = this._computeFilter(room);
    const lightOn  = this.hass?.states[room.light_entity]?.state === 'on';
    const tempVal  = this.hass?.states[room.temp_sensor]?.state;
    const humVal   = this.hass?.states[room.humidity_sensor]?.state;
    const overlayOpacity = lightOn ? 0 : 1;

    return html`
      <div class="room-btn" data-room="${room.id}">
        <div class="room-bg" style="
          background-image: url('${room.image_url ?? ''}');
          filter: ${filter};
          transition: filter ${room.transition_filter ?? '1.5s'} ease;
        "></div>
        ${room.overlay_image_url ? html`
          <div class="room-overlay" style="
            background-image: url('${room.overlay_image_url}');
            opacity: ${overlayOpacity};
            transition: opacity ${room.transition_overlay ?? '2s'} ease;
          "></div>
        ` : nothing}
        <div class="room-info">
          ${(tempVal || humVal) ? html`
            <div class="room-sensors">
              ${tempVal ? html`<span style="color:${tempColor(tempVal)}">${parseFloat(tempVal).toFixed(1)}°</span>` : nothing}
              ${humVal  ? html`<span style="color:${humColor(humVal)}">${Math.round(parseFloat(humVal))}%</span>` : nothing}
            </div>
          ` : nothing}
          <div class="room-label">${room.id}</div>
        </div>
      </div>
    `;
  }
}

// ── Editor ───────────────────────────────────────────────────────────────────

const ACTION_TYPES = [
  { value: 'none',           label: 'None' },
  { value: 'navigate',       label: 'Navigate' },
  { value: 'more-info',      label: 'More info' },
  { value: 'toggle',         label: 'Toggle light' },
  { value: 'fire-dom-event', label: 'Popup (browser_mod)' },
  { value: 'call-service',   label: 'Call service' },
];

class RoomNavbarCardEditor extends LitElement {
  static properties = {
    hass:          { attribute: false },
    _config:       { state: true },
    _menuConfig:   { state: true },
    _availConfigs: { state: true },
    _saving:       { state: true },
    _saveStatus:   { state: true },
    _expanded:     { state: true },
    _backendOk:    { state: true },
  };

  // Disable Shadow DOM – ha-entity-picker and other HA lazy-loaded elements
  // must live in the light DOM to be properly upgraded and styled by HA.
  createRenderRoot() { return this; }

  constructor() {
    super();
    this._config       = {};
    this._menuConfig   = null;
    this._availConfigs = null;
    this._saving       = false;
    this._saveStatus   = null;
    this._expanded     = new Set();
    this._backendOk    = true;
  }

  setConfig(config) {
    const prevId = this._config?.config_id;
    this._config = { ...config };
    if (config.config_id && config.config_id !== prevId) {
      this._menuConfig = null;
      if (this.hass) this._loadMenuConfig(config.config_id);
    }
  }

  updated(changed) {
    if (changed.has('hass') && this.hass && this._availConfigs === null) {
      this._fetchConfigs();
    }
  }

  // ── Backend ───────────────────────────────────────────────────────────────

  async _fetchConfigs() {
    try {
      const r = await this.hass.connection.sendMessagePromise({ type: 'room_navbar/list_configs' });
      this._availConfigs = r.configs ?? [];
      this._backendOk    = true;
    } catch {
      this._availConfigs = [];
      this._backendOk    = false;
    }
    if (this._config.config_id && !this._menuConfig) {
      await this._loadMenuConfig(this._config.config_id);
    } else if (!this._menuConfig) {
      this._menuConfig = { name: '', rooms: this._config.rooms ? [...this._config.rooms] : [] };
    }
  }

  async _loadMenuConfig(configId) {
    try {
      this._menuConfig = await this.hass.connection.sendMessagePromise({
        type: 'room_navbar/get_config',
        config_id: configId,
      });
    } catch {
      this._menuConfig = { name: configId, rooms: [] };
    }
  }

  async _saveConfig() {
    if (this._saving || !this._menuConfig) return;
    const configId = this._config.config_id?.trim();
    if (!configId) { alert('Enter a Config ID first.'); return; }
    for (const r of this._menuConfig.rooms ?? []) {
      if (!r.id?.trim()) { alert('Every room must have an ID.'); return; }
    }
    this._saving    = true;
    this._saveStatus = null;
    try {
      await this.hass.connection.sendMessagePromise({
        type:        'room_navbar/save_config',
        config_id:   configId,
        config_data: this._menuConfig,
      });
      this._saveStatus = 'ok';
      await this._fetchConfigs();
      fireEvent(this, 'config-changed', { config: { ...this._config, config_id: configId } });
    } catch (e) {
      this._saveStatus = 'err';
      console.error('[RoomNavbar editor] save failed', e);
    } finally {
      this._saving = false;
      setTimeout(() => { this._saveStatus = null; this.requestUpdate(); }, 4000);
    }
  }

  // ── Model helpers ─────────────────────────────────────────────────────────

  _addRoom() {
    if (!this._menuConfig) this._menuConfig = { name: '', rooms: [] };
    const id = `room_${Date.now()}`;
    this._menuConfig = {
      ...this._menuConfig,
      rooms: [...this._menuConfig.rooms, {
        id,
        light_entity: '',
        image_url: '',
        overlay_image_url: '',
        temp_sensor: '',
        humidity_sensor: '',
        filter_off:  'brightness(0.60) saturate(1.00)',
        filter_on:   'brightness(1.80) sepia(0.20) saturate(1.20)',
        filter_day:  'brightness(1.30) saturate(1.05)',
        transition_filter:  '1.5s',
        transition_overlay: '2.0s',
        tap_action: { action: 'navigate', navigation_path: '' },
      }],
    };
    this._expanded = new Set([...this._expanded, id]);
  }

  _deleteRoom(roomId) {
    this._menuConfig = {
      ...this._menuConfig,
      rooms: this._menuConfig.rooms.filter(r => r.id !== roomId),
    };
    this._expanded.delete(roomId);
    this._expanded = new Set(this._expanded);
  }

  _toggleExpand(roomId) {
    const s = new Set(this._expanded);
    s.has(roomId) ? s.delete(roomId) : s.add(roomId);
    this._expanded = s;
  }

  _updateRoom(roomId, patch) {
    this._menuConfig = {
      ...this._menuConfig,
      rooms: this._menuConfig.rooms.map(r => r.id === roomId ? { ...r, ...patch } : r),
    };
  }

  _updateAction(roomId, actionKey, patch) {
    const room = this._menuConfig.rooms.find(r => r.id === roomId);
    if (!room) return;
    this._updateRoom(roomId, { [actionKey]: { ...(room[actionKey] ?? {}), ...patch } });
  }

  _setActionType(roomId, actionKey, type) {
    if (type === 'none') {
      this._updateRoom(roomId, { [actionKey]: { action: 'none' } });
    } else if (type === 'navigate') {
      const cur = this._menuConfig.rooms.find(r => r.id === roomId)?.[actionKey];
      this._updateRoom(roomId, { [actionKey]: { action: 'navigate', navigation_path: cur?.navigation_path ?? '' } });
    } else if (type === 'more-info') {
      const cur = this._menuConfig.rooms.find(r => r.id === roomId)?.[actionKey];
      this._updateRoom(roomId, { [actionKey]: { action: 'more-info', entity: cur?.entity ?? '' } });
    } else {
      this._updateRoom(roomId, { [actionKey]: { action: type } });
    }
  }

  _updateFilter(roomId, filterKey, component, value) {
    const room = this._menuConfig.rooms.find(r => r.id === roomId);
    if (!room) return;
    const parsed = parseFilter(room[filterKey] ?? '');
    parsed[component] = value;
    this._updateRoom(roomId, { [filterKey]: buildFilter(parsed) });
  }

  // ── CSS ───────────────────────────────────────────────────────────────────
  // No static styles – we use light DOM (createRenderRoot returns this),
  // so styles are injected as a <style> tag inside render().
  // All selectors are prefixed with room-navbar-card-editor to avoid leaking.

  _editorStyles() {
    return html`<style>
      room-navbar-card-editor { display: block; }
      room-navbar-card-editor *, room-navbar-card-editor *::before, room-navbar-card-editor *::after { box-sizing: border-box; }
      room-navbar-card-editor .rnc-section { margin-bottom: 20px; }
      room-navbar-card-editor .rnc-section-title {
        font-size: 13px; font-weight: 600; color: var(--primary-text-color);
        text-transform: uppercase; letter-spacing: .5px; margin-bottom: 10px;
      }
      room-navbar-card-editor .rnc-banner { padding: 10px 14px; border-radius: 8px; font-size: 12px; margin-bottom: 14px; line-height: 1.5; }
      room-navbar-card-editor .rnc-banner.rnc-banner--warn { background: rgba(255,152,0,.15); border: 1px solid rgba(255,152,0,.4); }
      room-navbar-card-editor .rnc-banner.rnc-banner--info { background: rgba(33,150,243,.12); border: 1px solid rgba(33,150,243,.35); }
      room-navbar-card-editor .rnc-field-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
      room-navbar-card-editor .rnc-field-label { flex: 0 0 140px; font-size: 12px; color: var(--secondary-text-color); }
      room-navbar-card-editor .rnc-field-input {
        flex: 1; padding: 7px 10px;
        background: var(--input-fill-color, rgba(255,255,255,0.06));
        color: var(--primary-text-color);
        border: 1px solid var(--divider-color, rgba(255,255,255,0.12));
        border-radius: 6px; font-size: 13px;
      }
      room-navbar-card-editor .rnc-field-input:focus { outline: none; border-color: var(--primary-color); }
      room-navbar-card-editor textarea.rnc-field-input { resize: vertical; font-family: monospace; font-size: 11px; min-height: 80px; }
      room-navbar-card-editor .rnc-sub-title {
        font-size: 11px; font-weight: 600; color: var(--secondary-text-color);
        text-transform: uppercase; letter-spacing: .4px;
        margin: 14px 0 6px; padding-top: 10px;
        border-top: 1px solid var(--divider-color, rgba(255,255,255,0.08));
      }
      room-navbar-card-editor .rnc-room-card {
        border: 1px solid var(--divider-color, rgba(255,255,255,0.1));
        border-radius: 10px; margin-bottom: 8px; overflow: hidden;
      }
      room-navbar-card-editor .rnc-room-header {
        display: flex; align-items: center; gap: 8px; padding: 10px 14px;
        background: rgba(255,255,255,0.04); cursor: pointer; user-select: none;
      }
      room-navbar-card-editor .rnc-room-header:hover { background: rgba(255,255,255,0.07); }
      room-navbar-card-editor .rnc-room-chevron { font-size: 10px; color: var(--secondary-text-color); transition: transform .2s; }
      room-navbar-card-editor .rnc-room-chevron.open { transform: rotate(90deg); }
      room-navbar-card-editor .rnc-room-title { flex: 1; font-size: 13px; font-weight: 500; }
      room-navbar-card-editor .rnc-room-badge {
        font-size: 10px; color: var(--secondary-text-color);
        background: rgba(255,255,255,0.07); border-radius: 4px; padding: 2px 6px;
      }
      room-navbar-card-editor .rnc-btn-delete {
        background: none; border: none; cursor: pointer; font-size: 14px;
        color: var(--error-color, #cf6679); padding: 4px; border-radius: 4px;
      }
      room-navbar-card-editor .rnc-room-body { padding: 14px; }
      room-navbar-card-editor .rnc-btn-primary {
        padding: 10px 20px; background: var(--primary-color); color: #fff;
        border: none; border-radius: 8px; font-size: 14px; font-weight: 600;
        cursor: pointer;
      }
      room-navbar-card-editor .rnc-btn-primary:disabled { opacity: .45; cursor: not-allowed; }
      room-navbar-card-editor .rnc-btn-secondary {
        padding: 6px 12px; background: rgba(255,255,255,0.07);
        color: var(--primary-text-color);
        border: 1px solid var(--divider-color, rgba(255,255,255,0.12));
        border-radius: 6px; font-size: 12px; cursor: pointer;
      }
      room-navbar-card-editor .rnc-save-row { display: flex; align-items: center; gap: 14px; }
      room-navbar-card-editor .rnc-status-ok  { font-size: 13px; color: var(--success-color, #4caf50); }
      room-navbar-card-editor .rnc-status-err { font-size: 13px; color: var(--error-color, #cf6679); }
      room-navbar-card-editor .rnc-empty-rooms {
        font-size: 13px; color: var(--secondary-text-color);
        padding: 20px; text-align: center;
        border: 1px dashed var(--divider-color, rgba(255,255,255,0.1)); border-radius: 8px;
      }
      room-navbar-card-editor ha-entity-picker { display: block; flex: 1; }
      room-navbar-card-editor .rnc-transition-row { display: flex; gap: 8px; }
      room-navbar-card-editor .rnc-transition-row .rnc-field-row { flex: 1; }
      room-navbar-card-editor .rnc-action-block {
        padding: 10px; background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.07); border-radius: 8px; margin-bottom: 8px;
      }
      room-navbar-card-editor .rnc-action-label { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 6px; }
      room-navbar-card-editor .rnc-filter-panels { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
      room-navbar-card-editor .rnc-filter-block {
        flex: 1; min-width: 140px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px; padding: 10px 12px;
      }
      room-navbar-card-editor .rnc-filter-title {
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        letter-spacing: .5px; color: var(--secondary-text-color); margin-bottom: 8px;
      }
      room-navbar-card-editor .rnc-filter-preview-bar {
        width: 100%; height: 32px; border-radius: 5px; margin-bottom: 10px;
        background: linear-gradient(135deg,
          #0d1b2a 0%, #1b3a5c 20%, #2e6da4 40%, #e8a045 60%, #f5d76e 80%, #fff 100%);
        transition: filter .4s ease;
      }
      room-navbar-card-editor .rnc-filter-slider-row { display: flex; align-items: center; gap: 6px; margin-bottom: 3px; }
      room-navbar-card-editor .rnc-filter-prop { flex: 0 0 22px; font-size: 13px; text-align: center; }
      room-navbar-card-editor .rnc-filter-slider { flex: 1; height: 4px; cursor: pointer; accent-color: var(--primary-color); }
      room-navbar-card-editor .rnc-filter-val {
        flex: 0 0 38px; font-size: 10px; text-align: right;
        color: var(--primary-text-color); font-family: monospace;
      }
      room-navbar-card-editor .rnc-filter-raw {
        font-size: 9px; color: var(--secondary-text-color); font-family: monospace;
        margin-top: 7px; word-break: break-all; line-height: 1.4;
        padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.06);
      }
    </style>`;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  render() {
    const configId   = this._config.config_id ?? '';
    const menu       = this._menuConfig;
    const availIds   = (this._availConfigs ?? []).map(c => c.id);
    const otherConfs = (this._availConfigs ?? []).filter(c => c.id !== configId);

    return html`
      ${this._editorStyles()}
      ${!this._backendOk ? html`
        <div class="rnc-banner rnc-banner--warn">
          ⚠️ Integration <strong>Room Navbar</strong> not found.
          Add it via <em>Settings → Integrations</em>.
        </div>
      ` : nothing}

      ${this._backendOk && configId && !availIds.includes(configId) ? html`
        <div class="rnc-banner rnc-banner--info">
          ✨ Config <strong>${configId}</strong> doesn't exist yet – fill in rooms and click Save.
        </div>
      ` : nothing}

      <!-- Config ID -->
      <div class="rnc-section">
        <div class="rnc-section-title">Configuration</div>
        <div class="rnc-field-row">
          <label class="rnc-field-label">Config ID</label>
          <input class="rnc-field-input" type="text"
            .value=${configId}
            placeholder="main_navbar"
            @change=${e => this._onConfigIdChange(e.target.value.trim())}>
        </div>

        ${otherConfs.length ? html`
          <div class="rnc-field-row">
            <label class="rnc-field-label">Load existing</label>
            <select class="rnc-field-input"
              @change=${e => { if (e.target.value) this._onLoadExisting(e.target.value); e.target.value = ''; }}>
              <option value="">── select ──</option>
              ${otherConfs.map(c => html`<option value="${c.id}">${c.name} (${c.room_count})</option>`)}
            </select>
          </div>
        ` : nothing}

        <div class="rnc-field-row">
          <label class="rnc-field-label">Menu name</label>
          <input class="rnc-field-input" type="text"
            .value=${menu?.name ?? configId}
            placeholder="Main Navbar"
            @input=${e => { if (this._menuConfig) this._menuConfig = { ...this._menuConfig, name: e.target.value }; }}>
        </div>
      </div>

      ${menu !== null ? html`
        <!-- Rooms -->
        <div class="rnc-section">
          <div class="rnc-section-title" style="display:flex;justify-content:space-between;align-items:center">
            <span>Rooms (${menu.rooms.length})</span>
            <button class="rnc-btn-secondary" @click=${() => this._addRoom()}>+ Add room</button>
          </div>
          ${menu.rooms.length === 0 ? html`
            <div class="rnc-empty-rooms">No rooms. Click <em>Add room</em> to start.</div>
          ` : nothing}
          ${menu.rooms.map((room, i) => this._renderRoom(room, i))}
        </div>

        <!-- Save -->
        <div class="rnc-section rnc-save-row">
          <button class="rnc-btn-primary"
            ?disabled=${this._saving}
            @click=${() => this._saveConfig()}>
            ${this._saving ? 'Saving…' : '💾 Save configuration'}
          </button>
          ${this._saveStatus === 'ok' ? html`<span class="rnc-status-ok">✓ Saved</span>` : nothing}
          ${this._saveStatus === 'err' ? html`<span class="rnc-status-err">✗ Error – check browser console</span>` : nothing}
        </div>
      ` : html`<div class="rnc-empty-rooms">Loading…</div>`}
    `;
  }

  _renderRoom(room) {
    const open = this._expanded.has(room.id);
    return html`
      <div class="rnc-room-card">
        <div class="rnc-room-header" @click=${e => {
          if (e.target.closest('[data-delete]')) return;
          this._toggleExpand(room.id);
        }}>
          <span class="rnc-room-chevron ${open ? 'open' : ''}">▶</span>
          <span class="rnc-room-title">${room.id || '(unnamed)'}</span>
          ${room.light_entity ? html`<span class="rnc-room-badge">${room.light_entity}</span>` : nothing}
          <button class="rnc-btn-delete" data-delete="1"
            @click=${e => { e.stopPropagation(); if (confirm(`Delete room "${room.id}"?`)) this._deleteRoom(room.id); }}>
            🗑
          </button>
        </div>
        ${open ? this._renderRoomBody(room) : nothing}
      </div>
    `;
  }

  _renderRoomBody(room) {
    return html`
      <div class="rnc-room-body">

        <!-- Basic -->
        <div class="rnc-sub-title">Basic</div>
        <div class="rnc-field-row">
          <label class="rnc-field-label">Room ID</label>
          <input class="rnc-field-input" type="text" .value=${room.id}
            placeholder="bedroom"
            @input=${e => this._updateRoom(room.id, { id: e.target.value })}>
        </div>
        <div class="rnc-field-row">
          <label class="rnc-field-label">Light (entity)</label>
          <ha-entity-picker
            .hass=${this.hass}
            .value=${room.light_entity ?? ''}
            allow-custom-entity
            @value-changed=${e => this._updateRoom(room.id, { light_entity: e.detail.value ?? '' })}>
          </ha-entity-picker>
        </div>
        <div class="rnc-field-row">
          <label class="rnc-field-label">Background URL</label>
          <input class="rnc-field-input" type="text" .value=${room.image_url ?? ''}
            placeholder="/local/Dashboards/Rooms/Bedroom.webp"
            @input=${e => this._updateRoom(room.id, { image_url: e.target.value })}>
        </div>
        <div class="rnc-field-row">
          <label class="rnc-field-label">Overlay URL</label>
          <input class="rnc-field-input" type="text" .value=${room.overlay_image_url ?? ''}
            placeholder="/local/.../overlay.webp (optional)"
            @input=${e => this._updateRoom(room.id, { overlay_image_url: e.target.value })}>
        </div>

        <!-- Sensors -->
        <div class="rnc-sub-title">Sensors</div>
        <div class="rnc-field-row">
          <label class="rnc-field-label">Temperature</label>
          <ha-entity-picker
            .hass=${this.hass}
            .value=${room.temp_sensor ?? ''}
            allow-custom-entity
            @value-changed=${e => this._updateRoom(room.id, { temp_sensor: e.detail.value ?? '' })}>
          </ha-entity-picker>
        </div>
        <div class="rnc-field-row">
          <label class="rnc-field-label">Humidity</label>
          <ha-entity-picker
            .hass=${this.hass}
            .value=${room.humidity_sensor ?? ''}
            allow-custom-entity
            @value-changed=${e => this._updateRoom(room.id, { humidity_sensor: e.detail.value ?? '' })}>
          </ha-entity-picker>
        </div>

        <!-- Filters -->
        <div class="rnc-sub-title">Image Filters &amp; Transitions</div>
        <div class="rnc-filter-panels">
          ${this._renderFilterBlock(room, 'filter_off', '🌙 Night / Off')}
          ${this._renderFilterBlock(room, 'filter_on',  '💡 Light ON')}
          ${this._renderFilterBlock(room, 'filter_day', '☀️ Day')}
        </div>
        <div class="rnc-transition-row">
          <div class="rnc-field-row">
            <label class="rnc-field-label">Filter transition</label>
            <input class="rnc-field-input" type="text" .value=${room.transition_filter ?? '1.5s'}
              @input=${e => this._updateRoom(room.id, { transition_filter: e.target.value })}>
          </div>
          <div class="rnc-field-row">
            <label class="rnc-field-label">Overlay transition</label>
            <input class="rnc-field-input" type="text" .value=${room.transition_overlay ?? '2.0s'}
              @input=${e => this._updateRoom(room.id, { transition_overlay: e.target.value })}>
          </div>
        </div>

        <!-- Actions -->
        <div class="rnc-sub-title">Actions</div>
        ${this._renderActionBlock(room, 'tap_action',        'Tap')}
        ${this._renderActionBlock(room, 'hold_action',       'Hold (>500ms)')}
        ${this._renderActionBlock(room, 'double_tap_action', 'Double tap')}
      </div>
    `;
  }

  _renderFilterBlock(room, filterKey, label) {
    const filterStr  = room[filterKey] ?? '';
    const { brightness, saturate, sepia, hueRotate } = parseFilter(filterStr);

    return html`
      <div class="rnc-filter-block">
        <div class="rnc-filter-title">${label}</div>
        <div class="rnc-filter-preview-bar" style="filter:${filterStr}"></div>

        <div class="rnc-filter-slider-row">
          <span class="rnc-filter-prop" title="Brightness">☀</span>
          <input type="range" class="rnc-filter-slider" min="0.1" max="3" step="0.05"
            .value=${String(brightness)}
            @input=${e => this._updateFilter(room.id, filterKey, 'brightness', parseFloat(e.target.value))}>
          <span class="rnc-filter-val">${brightness.toFixed(2)}</span>
        </div>
        <div class="rnc-filter-slider-row">
          <span class="rnc-filter-prop" title="Saturation">🎨</span>
          <input type="range" class="rnc-filter-slider" min="0" max="4" step="0.05"
            .value=${String(saturate)}
            @input=${e => this._updateFilter(room.id, filterKey, 'saturate', parseFloat(e.target.value))}>
          <span class="rnc-filter-val">${saturate.toFixed(2)}</span>
        </div>
        <div class="rnc-filter-slider-row">
          <span class="rnc-filter-prop" title="Sepia">🟫</span>
          <input type="range" class="rnc-filter-slider" min="0" max="1" step="0.05"
            .value=${String(sepia)}
            @input=${e => this._updateFilter(room.id, filterKey, 'sepia', parseFloat(e.target.value))}>
          <span class="rnc-filter-val">${sepia.toFixed(2)}</span>
        </div>
        <div class="rnc-filter-slider-row">
          <span class="rnc-filter-prop" title="Hue rotate">🌈</span>
          <input type="range" class="rnc-filter-slider" min="-180" max="180" step="1"
            .value=${String(Math.round(hueRotate))}
            @input=${e => this._updateFilter(room.id, filterKey, 'hueRotate', parseFloat(e.target.value))}>
          <span class="rnc-filter-val">${Math.round(hueRotate)}°</span>
        </div>

        <div class="rnc-filter-raw">${filterStr || '—'}</div>
      </div>
    `;
  }

  _renderActionBlock(room, actionKey, label) {
    const action    = room[actionKey] ?? { action: 'none' };
    const curType   = action.action ?? 'none';

    return html`
      <div class="rnc-action-block">
        <div class="rnc-action-label">${label}</div>
        <div class="rnc-field-row">
          <label class="rnc-field-label">Action type</label>
          <select class="rnc-field-input"
            .value=${curType}
            @change=${e => this._setActionType(room.id, actionKey, e.target.value)}>
            ${ACTION_TYPES.map(t => html`
              <option value="${t.value}" ?selected=${t.value === curType}>${t.label}</option>
            `)}
          </select>
        </div>

        ${curType === 'navigate' ? html`
          <div class="rnc-field-row">
            <label class="rnc-field-label">Path</label>
            <input class="rnc-field-input" type="text"
              .value=${action.navigation_path ?? ''}
              placeholder="/lovelace/bedroom"
              @input=${e => this._updateAction(room.id, actionKey, { navigation_path: e.target.value })}>
          </div>
        ` : nothing}

        ${curType === 'more-info' ? html`
          <div class="rnc-field-row">
            <label class="rnc-field-label">Entity</label>
            <ha-entity-picker
              .hass=${this.hass}
              .value=${action.entity ?? ''}
              allow-custom-entity
              @value-changed=${e => this._updateAction(room.id, actionKey, { entity: e.detail.value ?? '' })}>
            </ha-entity-picker>
          </div>
        ` : nothing}

        ${curType === 'call-service' ? html`
          <div class="rnc-field-row">
            <label class="rnc-field-label">Service JSON</label>
            <textarea class="rnc-field-input" rows="4"
              .value=${JSON.stringify(action, null, 2)}
              @change=${e => { try { this._updateRoom(room.id, { [actionKey]: JSON.parse(e.target.value) }); } catch {} }}>
            </textarea>
          </div>
        ` : nothing}
      </div>
    `;
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  _onConfigIdChange(newId) {
    if (!newId || newId === this._config.config_id) return;
    this._config     = { ...this._config, config_id: newId };
    this._menuConfig = null;
    if (this.hass) this._loadMenuConfig(newId);
    fireEvent(this, 'config-changed', { config: { ...this._config } });
  }

  _onLoadExisting(id) {
    this._config     = { ...this._config, config_id: id };
    this._menuConfig = null;
    this._loadMenuConfig(id);
    fireEvent(this, 'config-changed', { config: { ...this._config } });
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
    description: 'Shared navigation bar with per-room images, filters, temperature and humidity.',
    preview:     true,
  });
}
