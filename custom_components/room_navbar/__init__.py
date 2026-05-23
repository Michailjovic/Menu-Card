"""Room Navbar Card – Home Assistant integrace.

Poskytuje:
- Persistentní storage pro pojmenované konfigurace menu
- Dynamické dočasné template sensory (CSS filter per pokoj)
- WebSocket API pro CRUD operací nad konfiguracemi
- Automatická registrace Lovelace JS zdroje
"""
from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .storage import RoomNavbarStore
from .websocket_api import async_register_websocket_commands

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]

# URL k JS souboru po instalaci přes HACS
# (HACS kopíruje www/ obsah do /hacsfiles/{repo_name}/)
_JS_URL = "/hacsfiles/room-navbar-card/room-navbar-card.js"
_JS_URL_MANUAL = "/local/room-navbar-card.js"


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Globální setup – zajistí existenci datového slovníku."""
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Nastaví Room Navbar po přidání integrace.

    Pořadí:
    1. Načte config ze storage
    2. Zaregistruje WebSocket API
    3. Spustí sensor platformu (ta vytvoří dočasné filter sensory)
    4. Zaregistruje Lovelace JS zdroj
    """
    hass.data.setdefault(DOMAIN, {})

    # 1. Storage
    store = RoomNavbarStore(hass)
    await store.async_load()
    hass.data[DOMAIN]["store"] = store

    # 2. WebSocket API
    async_register_websocket_commands(hass)

    # 3. Sensor platforma
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # 4. Lovelace resource – přidáme JS kartu automaticky
    await _async_register_lovelace_resource(hass)

    _LOGGER.info(
        "Room Navbar: integrace aktivní, %d konfigurací načteno",
        len(store.get_configs()),
    )
    return True


async def _async_register_lovelace_resource(hass: HomeAssistant) -> None:
    """Zaregistruje JS soubor jako Lovelace resource (pokud ještě není)."""
    try:
        lovelace_data = hass.data.get("lovelace", {})
        resources = lovelace_data.get("resources")
        if resources is None:
            return

        existing_urls = {r.get("url", "") for r in resources.async_items()}
        if _JS_URL not in existing_urls and _JS_URL_MANUAL not in existing_urls:
            await resources.async_create_item(
                {"res_type": "module", "url": _JS_URL}
            )
            _LOGGER.info("Room Navbar: Lovelace resource zaregistrován: %s", _JS_URL)
    except Exception:  # noqa: BLE001
        # Lovelace API se může lišit verzí HA – neblokujeme setup
        _LOGGER.debug("Room Navbar: automatická registrace Lovelace resource se nezdařila, přidejte ručně.")


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Odstraní integraci – sensory zmizí automaticky s platformou."""
    # Odregistrujeme storage listener
    listener = hass.data[DOMAIN].pop("store_listener", None)
    if listener:
        store = hass.data[DOMAIN].get("store")
        if store:
            store.remove_listener(listener)

    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    if unload_ok:
        hass.data.pop(DOMAIN, None)

    return unload_ok
