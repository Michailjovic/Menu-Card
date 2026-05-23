"""Dynamické template sensory pro Room Navbar Card.

Klíčové vlastnosti:
- Žádné unique_id → nejsou uloženy v entity registry
- Automaticky znovu vytvořeny při každém startu HA (integrace přečte config ze storage)
- State se aktualizuje POUZE pokud se výsledný CSS filter skutečně změní
  → HA nevysílá state_changed event zbytečně → prohlížeč nedostane WS zprávu
"""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback, Event
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_state_change_event

from .const import (
    DOMAIN,
    SENSOR_PREFIX,
    DEFAULT_FILTER_OFF,
    DEFAULT_FILTER_ON,
    DEFAULT_FILTER_DAY,
)

_LOGGER = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Platform setup
# ---------------------------------------------------------------------------

async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Nastaví sensor platformu a vytvoří sensory pro všechny uložené konfigurace."""
    store = hass.data[DOMAIN]["store"]

    manager = SensorManager(hass, async_add_entities)
    hass.data[DOMAIN]["sensor_manager"] = manager

    # Vytvoří sensory pro všechny již uložené konfigurace
    for config_id, config_data in store.get_configs().items():
        manager.create_for_config(config_id, config_data)

    # Reaguje na změny konfigurace (uložení / smazání přes WS API)
    def on_config_changed(config_id: str) -> None:
        config_data = store.get_config(config_id)
        if config_data is None:
            manager.remove_for_config(config_id)
        else:
            manager.refresh_for_config(config_id, config_data)

    store.add_listener(on_config_changed)
    hass.data[DOMAIN]["store_listener"] = on_config_changed


# ---------------------------------------------------------------------------
# Správce sensorů
# ---------------------------------------------------------------------------

class SensorManager:
    """Spravuje sadu RoomFilterSensor instancí.

    Umožňuje dynamické přidávání a aktualizaci sensorů bez restartu HA.
    Odebrání sensoru: sensor se označí jako unavailable (HA nemá API
    pro odebrání entity bez unique_id za běhu).
    """

    def __init__(self, hass: HomeAssistant, async_add_entities: AddEntitiesCallback) -> None:
        self._hass = hass
        self._async_add_entities = async_add_entities
        # {config_id: {room_id: RoomFilterSensor}}
        self._sensors: dict[str, dict[str, RoomFilterSensor]] = {}

    def create_for_config(self, config_id: str, config_data: dict[str, Any]) -> None:
        """Vytvoří sensory pro všechny pokoje v dané konfiguraci."""
        new_sensors: list[RoomFilterSensor] = []
        room_map: dict[str, RoomFilterSensor] = {}

        for room in config_data.get("rooms", []):
            room_id = room.get("id", "").strip()
            if not room_id:
                continue

            sensor = RoomFilterSensor(self._hass, config_id, room_id, room)
            # Nastavíme entity_id před přidáním do HA
            sensor.entity_id = _sensor_entity_id(config_id, room_id)
            new_sensors.append(sensor)
            room_map[room_id] = sensor

        self._sensors[config_id] = room_map

        if new_sensors:
            self._async_add_entities(new_sensors)
            _LOGGER.debug(
                "Room Navbar: přidáno %d sensorů pro config '%s'",
                len(new_sensors),
                config_id,
            )

    def refresh_for_config(self, config_id: str, config_data: dict[str, Any]) -> None:
        """Aktualizuje nebo přidá sensory po změně konfigurace.

        - Existující sensor dostane novou room konfiguraci a okamžitě přepočítá state.
        - Nové pokoje dostanou nový sensor.
        - Odebrané pokoje jsou označeny unavailable.
        """
        existing = self._sensors.get(config_id, {})
        new_room_ids = {r.get("id", "").strip() for r in config_data.get("rooms", [])}
        new_sensors: list[RoomFilterSensor] = []
        updated_map: dict[str, RoomFilterSensor] = {}

        for room in config_data.get("rooms", []):
            room_id = room.get("id", "").strip()
            if not room_id:
                continue

            if room_id in existing:
                # Aktualizace existujícího sensoru
                existing[room_id].update_room_config(room)
                updated_map[room_id] = existing[room_id]
            else:
                # Nový pokoj → nový sensor
                sensor = RoomFilterSensor(self._hass, config_id, room_id, room)
                sensor.entity_id = _sensor_entity_id(config_id, room_id)
                new_sensors.append(sensor)
                updated_map[room_id] = sensor

        # Pokoje co zmizely z konfigurace → unavailable
        for room_id, sensor in existing.items():
            if room_id not in new_room_ids:
                sensor.mark_unavailable()

        self._sensors[config_id] = updated_map

        if new_sensors:
            self._async_add_entities(new_sensors)

    def remove_for_config(self, config_id: str) -> None:
        """Označí všechny sensory dané konfigurace jako unavailable."""
        for sensor in self._sensors.pop(config_id, {}).values():
            sensor.mark_unavailable()


# ---------------------------------------------------------------------------
# Samotný sensor
# ---------------------------------------------------------------------------

class RoomFilterSensor(SensorEntity):
    """Sensor počítající CSS filter string pro jeden pokoj.

    Výhody oproti button-card JS výpočtu:
    - Výpočet běží v Pythonu na HA serveru, ne v prohlížeči
    - async_write_ha_state() se volá POUZE pokud se výsledek změní
    - Prohlížeč dostane WS zprávu jen při skutečném vizuálním přechodu
      (světlo on/off, příchod dne), ne při každé změně jiné entity
    """

    # Bez unique_id → není uložen v entity registry → dočasný
    _attr_unique_id = None
    _attr_should_poll = False
    _attr_icon = "mdi:image-filter"

    def __init__(
        self,
        hass: HomeAssistant,
        config_id: str,
        room_id: str,
        room_config: dict[str, Any],
    ) -> None:
        # _hass_ref is our own reference used before async_added_to_hass runs.
        # self.hass is the HA framework property – it is None until the platform
        # finishes adding the entity, so we cannot rely on it inside __init__
        # or inside update_room_config called from a storage listener.
        self._hass_ref = hass
        self._config_id = config_id
        self._room_id = room_id
        self._room_config = room_config
        self._available = True

        # Friendly name viditelný v developer tools
        self._attr_name = f"RNC {config_id} {room_id} filter"

        # Počáteční state (přepočítá se po async_added_to_hass)
        self._attr_native_value: str = room_config.get("filter_off", DEFAULT_FILTER_OFF)

    # ------------------------------------------------------------------
    # Životní cyklus
    # ------------------------------------------------------------------

    async def async_added_to_hass(self) -> None:
        """Zaregistruje tracking relevantních entit."""
        # Přepočítáme hned po přidání (hass je teď plně dostupný)
        self._attr_native_value = self._compute_filter()
        self.async_write_ha_state()

        tracked = self._build_tracked_entities()
        if tracked:
            self.async_on_remove(
                async_track_state_change_event(
                    self.hass,
                    tracked,
                    self._handle_state_change,
                )
            )
            _LOGGER.debug(
                "RNC sensor %s sleduje: %s",
                self.entity_id,
                ", ".join(tracked),
            )

    @callback
    def _handle_state_change(self, event: Event) -> None:
        """Zavoláno kdykoli se změní jedna ze sledovaných entit.

        Přepočítá filter a POUZE pokud se výsledek změnil,
        zapíše nový state do HA (→ WS zpráva do prohlížeče).
        """
        new_value = self._compute_filter()
        if new_value != self._attr_native_value:
            self._attr_native_value = new_value
            self.async_write_ha_state()

    # ------------------------------------------------------------------
    # Veřejné API pro SensorManager
    # ------------------------------------------------------------------

    @property
    def room_id(self) -> str:
        return self._room_id

    def update_room_config(self, new_config: dict[str, Any]) -> None:
        """Aktualizuje konfiguraci pokoje a přepočítá state."""
        self._room_config = new_config
        # Guard: hass may not be set yet if async_added_to_hass hasn't run
        if not self._effective_hass:
            return
        new_value = self._compute_filter()
        if new_value != self._attr_native_value:
            self._attr_native_value = new_value
            self.async_write_ha_state()

    def mark_unavailable(self) -> None:
        """Označí sensor jako nedostupný (pokoj byl odebrán z konfigurace)."""
        self._available = False
        self.async_write_ha_state()

    @property
    def available(self) -> bool:
        return self._available

    # ------------------------------------------------------------------
    # Výpočet filtru
    # ------------------------------------------------------------------

    @property
    def _effective_hass(self) -> HomeAssistant | None:
        """Vrátí hass – přednostně HA framework property, jinak vlastní referenci."""
        return self.hass if self.hass is not None else self._hass_ref

    def _build_tracked_entities(self) -> list[str]:
        """Vrátí seznam entit, na jejichž změnu sensor reaguje."""
        entities: list[str] = []

        light = self._room_config.get("light_entity")
        if light:
            entities.append(light)

        blind = self._room_config.get("blind_entity")
        if blind:
            entities.append(blind)
            entities.append("sun.sun")  # potřeba jen pokud máme žaluzie

        return entities

    def _compute_filter(self) -> str:
        """Vypočítá CSS filter string z aktuálních stavů HA entit."""
        cfg = self._room_config
        hass = self._effective_hass
        if hass is None:
            return cfg.get("filter_off", DEFAULT_FILTER_OFF)

        # 1. Světlo zapnuto?
        light_entity = cfg.get("light_entity")
        if light_entity:
            light_state = hass.states.get(light_entity)
            if light_state and light_state.state == "on":
                return cfg.get("filter_on", DEFAULT_FILTER_ON)

        # 2. Denní světlo přes žaluzie?
        blind_entity = cfg.get("blind_entity")
        if blind_entity:
            blind_state = hass.states.get(blind_entity)
            sun_state = hass.states.get("sun.sun")
            try:
                blind_pct = float(blind_state.state) if blind_state else 100.0
            except (ValueError, TypeError):
                blind_pct = 100.0

            threshold = float(cfg.get("blind_threshold", 36))
            if (
                blind_pct < threshold
                and sun_state is not None
                and sun_state.state == "above_horizon"
            ):
                return cfg.get("filter_day", DEFAULT_FILTER_DAY)

        # 3. Výchozí (noc / světlo vypnuto)
        return cfg.get("filter_off", DEFAULT_FILTER_OFF)


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _sensor_entity_id(config_id: str, room_id: str) -> str:
    """Vrátí deterministické entity_id pro filter sensor."""
    return f"sensor.{SENSOR_PREFIX}_{config_id}_{room_id}_filter"
