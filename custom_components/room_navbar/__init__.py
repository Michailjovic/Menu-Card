"""Room Navbar Card – Home Assistant integrace."""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .storage import RoomNavbarStore
from .websocket_api import async_register_websocket_commands

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]

_CARD_URL = "/room_navbar_card/room-navbar-card.js"


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Globální setup – registruje JS soubor do frontendu.

    Voláno jednou při startu HA, před nastavením config entries.
    add_extra_js_url() přidá URL přímo do HTML stránky frontendu –
    karta je dostupná bez nutnosti přidávat Lovelace resource ručně.
    """
    hass.data.setdefault(DOMAIN, {})

    js_path = Path(__file__).parent / "www" / "room-navbar-card.js"

    if not js_path.exists():
        _LOGGER.error(
            "Room Navbar: JS soubor nenalezen: %s. "
            "Reinstaluj integraci přes HACS.",
            js_path,
        )
        return True  # Neblokujeme setup kvůli chybějícímu JS

    try:
        await hass.http.async_register_static_paths([
            StaticPathConfig(_CARD_URL, str(js_path), cache_headers=True)
        ])
        # Přidá URL přímo do <head> HA frontendu – žádná ruční konfigurace
        add_extra_js_url(hass, _CARD_URL)
        _LOGGER.info("Room Navbar: JS karta dostupná na %s", _CARD_URL)
    except Exception:  # noqa: BLE001
        _LOGGER.exception("Room Navbar: chyba při registraci JS souboru")

    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Nastaví Room Navbar po přidání integrace."""
    hass.data.setdefault(DOMAIN, {})

    # Storage
    store = RoomNavbarStore(hass)
    await store.async_load()
    hass.data[DOMAIN]["store"] = store

    # WebSocket API
    async_register_websocket_commands(hass)

    # Sensor platforma (vytvoří dočasné filter sensory)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    _LOGGER.info(
        "Room Navbar: integrace aktivní, %d konfigurací načteno",
        len(store.get_configs()),
    )
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Odstraní integraci."""
    listener = hass.data[DOMAIN].pop("store_listener", None)
    if listener:
        store = hass.data[DOMAIN].get("store")
        if store:
            store.remove_listener(listener)

    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    if unload_ok:
        hass.data.pop(DOMAIN, None)

    return unload_ok
