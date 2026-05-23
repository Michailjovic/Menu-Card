"""Room Navbar Card - Home Assistant integrace."""
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

_CARD_URL = "/room_navbar_card/room-navbar-card.js"

_MANIFEST_PATH = Path(__file__).parent / "manifest.json"
with open(_MANIFEST_PATH, encoding="utf-8") as _f:
    _INTEGRATION_VERSION: str = json.load(_f).get("version", "0.0.0")


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Globalni setup - registruje staticku HTTP cestu pro JS kartu."""
    hass.data.setdefault(DOMAIN, {})

    js_path = Path(__file__).parent / "www" / "room-navbar-card.js"

    if not js_path.exists():
        _LOGGER.error(
            "Room Navbar: JS soubor nenalezen: %s - reinstaluj integraci pres HACS.",
            js_path,
        )
        return True

    try:
        await hass.http.async_register_static_paths([
            StaticPathConfig(_CARD_URL, str(js_path), cache_headers=True)
        ])
        _LOGGER.info("Room Navbar: JS dostupny na %s", _CARD_URL)
    except Exception:  # noqa: BLE001
        _LOGGER.exception("Room Navbar: chyba pri registraci staticke cesty")

    async def _handle_started(_event: Event | None = None) -> None:
        await _async_register_lovelace_resource(hass, _CARD_URL, _INTEGRATION_VERSION)

    if hass.state == CoreState.running:
        hass.async_create_task(_handle_started())
    else:
        hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _handle_started)

    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Nastavi Room Navbar po pridani integrace."""
    hass.data.setdefault(DOMAIN, {})

    store = RoomNavbarStore(hass)
    await store.async_load()
    hass.data[DOMAIN]["store"] = store

    async_register_websocket_commands(hass)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    _LOGGER.info(
        "Room Navbar: integrace aktivni, %d konfiguraci nacteno",
        len(store.get_configs()),
    )
    return True


async def _async_register_lovelace_resource(
    hass: HomeAssistant, url: str, version: str
) -> None:
    """Prida nebo aktualizuje JS kartu v Lovelace resources.

    Klic hass.data["lovelace"] je potvrzeny string - viz browser_mod, KipK guide.
    Dual-fallback pro atribut modu: starsi HA pouziva 'mode', novejsi 'resource_mode'.
    Explicitni async_load() pred kazdou operaci - workaround pro HA bug #165767.
    """
    # "lovelace" je hardcoded string klic - potvrzeno v HA zdrojovem kodu a
    # fungujicich integracich (browser_mod, marees_france, atd.)
    lovelace_data = hass.data.get("lovelace")

    if lovelace_data is None:
        _LOGGER.warning(
            "Room Navbar: hass.data['lovelace'] neni dostupne. "
            "Zkousim znovu za 10 s. Dostupne klice v hass.data: %s",
            [k for k in hass.data if isinstance(k, str)],
        )

        async def _retry(_now: Any) -> None:
            await _async_register_lovelace_resource(hass, url, version)

        async_call_later(hass, 10, _retry)
        return

    # Dual-fallback: HA 2026+ pouziva 'resource_mode', starsi 'mode'
    resource_mode = getattr(
        lovelace_data,
        "resource_mode",
        getattr(lovelace_data, "mode", "unknown"),
    )

    _LOGGER.debug("Room Navbar: lovelace resource_mode = %r", resource_mode)

    if resource_mode != "storage":
        _LOGGER.warning(
            "Room Navbar: Lovelace resources jsou v '%s' modu (ne storage). "
            "Resource prida rucne: Nastaveni -> Dashboardy -> Resources -> "
            "'%s?v=%s' jako JavaScript module.",
            resource_mode, url, version,
        )
        return

    resources = getattr(lovelace_data, "resources", None)
    if resources is None:
        _LOGGER.warning(
            "Room Navbar: lovelace_data.resources je None. "
            "Typ lovelace_data: %s, atributy: %s",
            type(lovelace_data).__name__,
            [a for a in dir(lovelace_data) if not a.startswith("_")],
        )
        return

    # Workaround pro HA bug #165767: async_items() a async_create_item()
    # nemaji lazy-load guard. Explicitni async_load() zajisti ze data jsou
    # v pameti pred jakoukoli operaci.
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
                "Room Navbar: resource '%s' je aktualni (v%s)", url, version
            )
            return
        await resources.async_update_item(
            resource["id"],
            {"res_type": "module", "url": versioned_url},
        )
        _LOGGER.info(
            "Room Navbar: Lovelace resource aktualizovan na v%s: %s "
            "- proved Ctrl+Shift+R v prohlizeci.",
            version, versioned_url,
        )
    else:
        await resources.async_create_item(
            {"res_type": "module", "url": versioned_url}
        )
        _LOGGER.info(
            "Room Navbar: Lovelace resource automaticky pridan: %s "
            "- proved Ctrl+Shift+R v prohlizeci.",
            versioned_url,
        )


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Odstrani integraci."""
    listener = hass.data[DOMAIN].pop("store_listener", None)
    if listener:
        store = hass.data[DOMAIN].get("store")
        if store:
            store.remove_listener(listener)

    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)

    if unload_ok:
        hass.data.pop(DOMAIN, None)

    return unload_ok
