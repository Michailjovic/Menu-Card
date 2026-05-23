"""Perzistence konfigurace menu do HA storage."""
from __future__ import annotations

import logging
from typing import Any, Callable

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION

_LOGGER = logging.getLogger(__name__)

DEFAULT_DATA: dict[str, Any] = {"configs": {}}


class RoomNavbarStore:
    """Spravuje načítání a ukládání konfigurace menu.

    Data jsou uložena v .storage/room_navbar jako JSON.
    Struktura:
        {
          "configs": {
            "main_navbar": {
              "name": "Main Navbar",
              "rooms": [ { ...room config... }, ... ]
            }
          }
        }
    """

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._data: dict[str, Any] = {"configs": {}}
        self._listeners: list[Callable[[str], None]] = []

    # ------------------------------------------------------------------
    # Načítání / ukládání
    # ------------------------------------------------------------------

    async def async_load(self) -> None:
        """Načte data ze storage. Volat při async_setup_entry."""
        stored = await self._store.async_load()
        if stored and isinstance(stored, dict):
            self._data = stored
            _LOGGER.debug("Room Navbar: načteno %d konfigurací", len(self._data.get("configs", {})))
        else:
            self._data = {"configs": {}}
            _LOGGER.debug("Room Navbar: storage prázdný, začínám s výchozím stavem")

    async def _async_persist(self) -> None:
        """Uloží aktuální data na disk."""
        await self._store.async_save(self._data)

    # ------------------------------------------------------------------
    # CRUD
    # ------------------------------------------------------------------

    def get_configs(self) -> dict[str, Any]:
        """Vrátí slovník všech konfigurací {config_id: config_data}."""
        return self._data.get("configs", {})

    def get_config(self, config_id: str) -> dict[str, Any] | None:
        """Vrátí konkrétní konfiguraci nebo None pokud neexistuje."""
        return self._data.get("configs", {}).get(config_id)

    async def async_save_config(self, config_id: str, config_data: dict[str, Any]) -> None:
        """Vytvoří nebo aktualizuje konfiguraci a uloží na disk."""
        if "configs" not in self._data:
            self._data["configs"] = {}
        self._data["configs"][config_id] = config_data
        await self._async_persist()
        _LOGGER.info("Room Navbar: konfigurace '%s' uložena (%d pokojů)", config_id, len(config_data.get("rooms", [])))
        self._notify_listeners(config_id)

    async def async_delete_config(self, config_id: str) -> bool:
        """Smaže konfiguraci. Vrátí True pokud existovala."""
        configs = self._data.get("configs", {})
        if config_id not in configs:
            return False
        del configs[config_id]
        await self._async_persist()
        _LOGGER.info("Room Navbar: konfigurace '%s' smazána", config_id)
        self._notify_listeners(config_id)
        return True

    # ------------------------------------------------------------------
    # Listenery pro reaktivní aktualizaci sensorů
    # ------------------------------------------------------------------

    def add_listener(self, listener: Callable[[str], None]) -> None:
        """Přidá listener volaný při každé změně konfigurace.

        Args:
            listener: callback(config_id) - volá se po uložení nebo smazání
        """
        self._listeners.append(listener)

    def remove_listener(self, listener: Callable[[str], None]) -> None:
        """Odebere listener."""
        if listener in self._listeners:
            self._listeners.remove(listener)

    def _notify_listeners(self, config_id: str) -> None:
        for listener in self._listeners:
            try:
                listener(config_id)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Room Navbar: chyba v listeneru")
