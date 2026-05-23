"""Room Navbar Card – Home Assistant integrace."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CoreState, Event, HomeAssistant
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.typing import ConfigType

from .const import DOMAIN
from .storage import RoomNavbarStore
from .websocket_api import async_register_websocket_commands

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]

# URL pod kterou integrace servuje JS soubor přes vlastní statický endpoint
_CARD_URL = "/room_navbar_card/room-navbar-card.js"

# Verze z manifestu – pro cache-busting (?v=X.X.X v Lovelace resource URL)
_MANIFEST_PATH = Path(__file__).parent / "manifest.json"
with open(_MANIFEST_PATH, encoding="utf-8") as _f:
    _INTEGRATION_VERSION: str = json.load(_f).get("version", "0.0.0")


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Globální setup – zaregistruje statický HTTP endpoint pro JS kartu.

    Volá se při každém startu HA, PŘED nastavením config entries.
    Registrace Lovelace resource probíhá zde (jednou za integraci,
    ne jednou za config entry).
    """
    hass.data.setdefault(DOMAIN, {})

    js_path = Path(__file__).parent / "www" / "room-navbar-card.js"

    if not js_path.exists():
        _LOGGER.error(
            "Room Navbar: JS soubor nenalezen: %s – reinstaluj integraci přes HACS.",
            js_path,
        )
        return True

    try:
        await hass.http.async_register_static_paths([
            StaticPathConfig(_CARD_URL, str(js_path), cache_headers=True)
        ])
        _LOGGER.info("Room Navbar: JS dostupný na %s", _CARD_URL)
    except Exception:  # noqa: BLE001
        _LOGGER.exception("Room Navbar: chyba při registraci statické cesty")

    # Registrace Lovelace resource – až po plném startu HA
    async def _handle_started(_event: Event | None = None) -> None:
        await _async_register_lovelace_resource(hass, _CARD_URL, _INTEGRATION_VERSION)

    if hass.state == CoreState.running:
        hass.async_create_task(_handle_started())
    else:
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _handle_started)

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

    # Sensor platforma
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    _LOGGER.info(
        "Room Navbar: integrace aktivní, %d konfigurací načteno",
        len(store.get_configs()),
    )
    return True


async def _async_register_lovelace_resource(
    hass: HomeAssistant, url: str, version: str
) -> None:
    """Přidá/aktualizuje JS kartu v Lovelace resources (storage mód).

    Importujeme LOVELACE_DATA a MODE_STORAGE až zde (uvnitř funkce),
    aby import neselhal pokud by lovelace komponenta nebyla ještě inicializovaná.

    Workaround pro HA bug #165767: async_create_item() / async_items() nemají
    lazy-load guard → MUSÍME explicitně volat await resources.async_load()
    před jakoukoliv operací, jinak hrozí přepsání celého storage souboru.
    """
    try:
        # Import uvnitř funkce – lovelace je zaručeně načteno až po
        # EVENT_HOMEASSISTANT_STARTED, takže import je v tuto chvíli bezpečný
        from homeassistant.components.lovelace import LOVELACE_DATA  # noqa: PLC0415
        from homeassistant.components.lovelace.const import MODE_STORAGE  # noqa: PLC0415
    except ImportError:
        _LOGGER.warning(
            "Room Navbar: Nepodařilo se importovat lovelace konstanty. "
            "Přidej resource ručně: '%s?v=%s' (JavaScript module).",
            url, version,
        )
        return

    lovelace_data = hass.data.get(LOVELACE_DATA)
    if lovelace_data is None:
        _LOGGER.debug(
            "Room Navbar: hass.data[LOVELACE_DATA] není dostupné "
            "(LOVELACE_DATA=%r). Zkouším znovu za 10 s.",
            LOVELACE_DATA,
        )
        async def _retry_no_data(_now: Any) -> None:
            await _async_register_lovelace_resource(hass, url, version)
        async_call_later(hass, 10, _retry_no_data)
        return

    # LovelaceData dataclass má 'resource_mode', NE 'mode'
    resource_mode = getattr(lovelace_data, "resource_mode", None)
    if resource_mode != MODE_STORAGE:
        _LOGGER.debug(
            "Room Navbar: Lovelace resources jsou v '%s' módu (ne storage) – "
            "resource přidej ručně do ui-lovelace.yaml",
            resource_mode,
        )
        return

    resources = getattr(lovelace_data, "resources", None)
    if resources is None:
        _LOGGER.debug("Room Navbar: lovelace_data.resources je None")
        return

    # KRITICKÉ: explicitní async_load() před jakoukoliv operací.
    # Workaround pro HA bug #165767 – async_items() a async_create_item()
    # nemají lazy-load guard; bez tohoto volání hrozí přepsání storage souboru.
    await resources.async_load()

    versioned_url = f"{url}?v={version}"

    existing = [
        r for r in resources.async_items()
        if r["url"].split("?")[0] == url
    ]

    if existing:
        resource = existing[0]
        current_version = (
            resource["url"].split("?v=")[-1]
            if "?v=" in resource["url"]
            else "0"
        )
        if current_version == version:
            _LOGGER.debug(
                "Room Navbar: resource '%s' je aktuální (v%s)", url, version
            )
            return
        # Aktualizuj URL na novou verzi
        await resources.async_update_item(
            resource["id"],
            {"res_type": "module", "url": versioned_url},
        )
        _LOGGER.info(
            "Room Navbar: Lovelace resource aktualizován na v%s: %s "
            "– proveď Ctrl+Shift+R v prohlížeči.",
            version, versioned_url,
        )
    else:
        await resources.async_create_item(
            {"res_type": "module", "url": versioned_url}
        )
        _LOGGER.info(
            "Room Navbar: Lovelace resource automaticky přidán: %s "
            "– proveď Ctrl+Shift+R v prohlížeči.",
            versioned_url,
        )


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
