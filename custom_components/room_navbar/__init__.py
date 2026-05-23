"""Room Navbar Card – Home Assistant integrace.

Poskytuje:
- Persistentní storage pro pojmenované konfigurace menu
- Dynamické dočasné template sensory (CSS filter per pokoj)
- WebSocket API pro CRUD operací nad konfiguracemi
- Automatické servování JS karty + registrace Lovelace resource
"""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .storage import RoomNavbarStore
from .websocket_api import async_register_websocket_commands

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]

# URL pod kterou integrace servuje JS soubor
# (nezávisí na HACS ani na manuální instalaci)
_CARD_URL = "/room_navbar_card/room-navbar-card.js"
_CARD_URL_LEGACY = "/local/room-navbar-card.js"  # ručně nainstalovaná verze


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Globální setup – zajistí existenci datového slovníku."""
    hass.data.setdefault(DOMAIN, {})
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Nastaví Room Navbar po přidání integrace.

    Pořadí:
    1. Zaregistruje statický HTTP endpoint pro JS soubor
    2. Načte config ze storage
    3. Zaregistruje WebSocket API
    4. Spustí sensor platformu
    5. Zaregistruje Lovelace resource
    """
    hass.data.setdefault(DOMAIN, {})

    # 1. Statický HTTP endpoint – JS soubor servujeme přímo z integrace.
    #    Tím není třeba žádná ruční instalace do /config/www/
    js_path = Path(__file__).parent / "www" / "room-navbar-card.js"
    if js_path.exists():
        await hass.http.async_register_static_paths([
            StaticPathConfig(_CARD_URL, str(js_path), cache_headers=True)
        ])
        _LOGGER.debug("Room Navbar: JS servován z %s", js_path)
    else:
        _LOGGER.warning(
            "Room Navbar: JS soubor nenalezen v %s. "
            "Zkontroluj instalaci – soubor custom_components/room_navbar/www/room-navbar-card.js musí existovat.",
            js_path,
        )

    # 2. Storage
    store = RoomNavbarStore(hass)
    await store.async_load()
    hass.data[DOMAIN]["store"] = store

    # 3. WebSocket API
    async_register_websocket_commands(hass)

    # 4. Sensor platforma
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    # 5. Lovelace resource
    await _async_register_lovelace_resource(hass)

    _LOGGER.info(
        "Room Navbar: integrace aktivní, %d konfigurací načteno",
        len(store.get_configs()),
    )
    return True


async def _async_register_lovelace_resource(hass: HomeAssistant) -> None:
    """Přidá JS kartu do Lovelace resources (pokud tam ještě není).

    Kontroluje jak náš _CARD_URL tak případnou legacy /local/ cestu,
    aby nedošlo k duplicitní registraci při přechodu z ruční instalace.
    """
    try:
        lovelace_data = hass.data.get("lovelace", {})
        resources = lovelace_data.get("resources")
        if resources is None:
            _LOGGER.debug("Room Navbar: Lovelace resources API nedostupné, přeskakuji auto-registraci.")
            return

        existing_urls = {item.get("url", "") for item in resources.async_items()}

        if _CARD_URL in existing_urls or _CARD_URL_LEGACY in existing_urls:
            _LOGGER.debug("Room Navbar: Lovelace resource již existuje, nepřidávám.")
            return

        await resources.async_create_item({"res_type": "module", "url": _CARD_URL})
        _LOGGER.info("Room Navbar: Lovelace resource automaticky zaregistrován: %s", _CARD_URL)

    except Exception:  # noqa: BLE001
        _LOGGER.warning(
            "Room Navbar: Automatická registrace Lovelace resource se nezdařila. "
            "Přidej ručně: Nastavení → Dashboardy → Resources → %s (JavaScript module).",
            _CARD_URL,
        )


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Odstraní integraci – sensory zmizí automaticky s platformou."""
    listener = hass.data[DOMAIN].pop("store_listener", None)
    if listener:
        store = hass.data[DOMAIN].get("store")
        if store:
            store.remove_listener(listener)

    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    if unload_ok:
        hass.data.pop(DOMAIN, None)

    return unload_ok
