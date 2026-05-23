# Room Navbar Card

Výkonnostně optimalizované sdílené navigační menu pro Home Assistant dashboardy.

## Co to řeší

Standardní přístup (button-card v každém dashboardu) znamená:
- Duplicitní YAML ve všech dashboardech
- JS výpočty (CSS filtry, barvy) při každé změně entity v prohlížeči
- Desítky WebSocket subscriptions (každá entita zvlášť)

Tato integrace to řeší:
- **Jeden centrální config** sdílený přes všechny dashboardy (`config_id`)
- **Dočasné template sensory** – filtr počítá HA server, do prohlížeče přijde WS zpráva jen při skutečné vizuální změně
- **Inkrementální DOM update** – `requestAnimationFrame` batching, `will-change` jen při animaci

---

## Instalace

### 1. Přes HACS (doporučeno)

1. HACS → Custom repositories → přidej URL tohoto repozitáře, kategorie **Integration**
2. Nainstaluj **Room Navbar Card**
3. Restartuj Home Assistant
4. **Nastavení → Integrace → + Přidat integraci → Room Navbar Card**

JS zdroj je zaregistrován automaticky z `/hacsfiles/room-navbar-card/room-navbar-card.js`.

### 2. Ruční instalace

1. Zkopíruj `custom_components/room_navbar/` do `/config/custom_components/`
2. Zkopíruj `www/room-navbar-card.js` do `/config/www/`
3. Přidej Lovelace resource: **Nastavení → Dashboardy → Resources → + Add resource**
   - URL: `/local/room-navbar-card.js`
   - Typ: JavaScript module
4. Restartuj HA a přidej integraci

---

## Použití

### Základní použití s config_id (doporučeno)

```yaml
type: custom:room-navbar-card
config_id: main_navbar
grid_options:
  columns: full
```

Konfigurace pokojů je uložena v backendu. Edituj přes tužku v dashboard editoru.

### Inline mód (bez backendu, jen jedna karta)

```yaml
type: custom:room-navbar-card
rooms:
  - id: bedroom
    light_entity: light.light_group_bedroom
    image_url: /local/Dashboards/Rooms/Bedroom-svetlo-off.webp
    overlay_image_url: /local/Dashboards/Rooms/Bedroom-overlay-SVETlo.webp
    temp_sensor: sensor.aqd_bedroom_temperature
    humidity_sensor: sensor.aqd_bedroom_humidity
    filter_off: "brightness(0.6) saturate(1.0)"
    filter_on: "brightness(2.6) sepia(0.35) saturate(0.9)"
    filter_day: "brightness(1.7) sepia(0.12) saturate(1.05)"
    blind_entity: number.roller_motor_bedroom_percent_control
    blind_threshold: 36
    transition_filter: "2.0s"
    transition_overlay: "2.0s"
    tap_action:
      action: navigate
      navigation_path: /dashboard-home/bedroom
    hold_action:
      action: navigate
      navigation_path: /dashboard-various/thermostat
    double_tap_action:
      action: fire-dom-event
      browser_mod:
        service: browser_mod.popup
        data:
          title: "🛏️ Ložnice – vzduch & topení"
          size: normal
          content:
            type: custom:air-comfort-card
            temperature_entity: sensor.aqd_bedroom_temperature
            humidity_entity: sensor.aqd_bedroom_humidity
```

---

## Schéma konfigurace pokoje

| Pole | Typ | Povinné | Popis |
|------|-----|---------|-------|
| `id` | string | ✅ | Unikátní ID pokoje (snake_case), použito v entity_id sensoru |
| `light_entity` | entity | ✅ | Entita světla – určuje stav (on/off) |
| `image_url` | string | ✅ | URL pozadí (`/local/...` nebo `/hacsfiles/...`) |
| `overlay_image_url` | string | – | URL překryvného obrázku (při světle zapnutém) |
| `temp_sensor` | entity | – | Sensor teploty |
| `humidity_sensor` | entity | – | Sensor vlhkosti |
| `filter_off` | string | – | CSS filter při vypnutém světle a noci |
| `filter_on` | string | – | CSS filter při zapnutém světle |
| `filter_day` | string | – | CSS filter při denním světle přes žaluzie |
| `blind_entity` | entity | – | Entita procent žaluzie (0–100) |
| `blind_threshold` | number | – | Pod tuto hodnotu jde žaluzie = den (výchozí: 36) |
| `transition_filter` | string | – | Délka CSS přechodu filtru (výchozí: `"1.5s"`) |
| `transition_overlay` | string | – | Délka CSS přechodu overlay (výchozí: `"2.0s"`) |
| `tap_action` | action | – | Akce na kliknutí |
| `hold_action` | action | – | Akce na přidržení (>500ms) |
| `double_tap_action` | action | – | Akce na dvojklik (<250ms) |

### Podporované typy akcí

- `navigate` – `navigation_path: /dashboard-home/room`
- `more-info` – `entity: light.bedroom`
- `call-service` / `perform-action` – `service: light.toggle`, `service_data: {entity_id: ...}`
- `fire-dom-event` – pro browser_mod popup
- `url` – `url_path: https://...`, `new_tab: true`
- `toggle` – přepne `light_entity` pokoje

---

## Generované sensory

Integrace automaticky vytvoří pro každý pokoj dočasný sensor:

```
sensor.rnc_{config_id}_{room_id}_filter
```

Například: `sensor.rnc_main_navbar_bedroom_filter`

Tyto sensory:
- **Nejsou** uloženy v entity registry (žádné unique_id)
- Zmizí při restartu HA, ale jsou automaticky znovu vytvořeny
- Viditelné v **Developer Tools → States** po dobu běhu HA
- Aktualizují se pouze při skutečné vizuální změně → prohlížeč dostane minimum WS zpráv

---

## WebSocket API

Pokud chceš konfiguraci spravovat programaticky (skript, applet):

```javascript
// Načtení konfigurace
hass.connection.sendMessagePromise({ type: "room_navbar/get_config", config_id: "main_navbar" })

// Uložení konfigurace
hass.connection.sendMessagePromise({
  type: "room_navbar/save_config",
  config_id: "main_navbar",
  config_data: { name: "Main Navbar", rooms: [...] }
})

// Seznam konfigurací
hass.connection.sendMessagePromise({ type: "room_navbar/list_configs" })

// Smazání konfigurace
hass.connection.sendMessagePromise({ type: "room_navbar/delete_config", config_id: "main_navbar" })
```

---

## Migrace z button-card / embedded-view-card

Tvůj původní navbar view v `dashboard-various/navbar` můžeš zachovat jako zálohu. Pro migraci:

1. Přidej integraci a vytvoř konfiguraci `main_navbar`
2. Nahraď kartu `custom:embedded-view-card` za `custom:room-navbar-card` s `config_id: main_navbar`
3. Inicializuj konfiguraci přes Developer Tools → WebSocket (viz API výše) nebo přes card editor
