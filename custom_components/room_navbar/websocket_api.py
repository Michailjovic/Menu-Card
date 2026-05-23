"""WebSocket API pro Room Navbar Card.

Příkazy:
  room_navbar/list_configs   – seznam všech pojmenovaných konfigurací
  room_navbar/get_config     – detail jedné konfigurace
  room_navbar/save_config    – vytvoření / aktualizace konfigurace
  room_navbar/delete_config  – smazání konfigurace
"""
from __future__ import annotations

import logging

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


def async_register_websocket_commands(hass: HomeAssistant) -> None:
    """Zaregistruje všechny WS příkazy."""
    websocket_api.async_register_command(hass, ws_list_configs)
    websocket_api.async_register_command(hass, ws_get_config)
    websocket_api.async_register_command(hass, ws_save_config)
    websocket_api.async_register_command(hass, ws_delete_config)


# ---------------------------------------------------------------------------
# list_configs
# ---------------------------------------------------------------------------

@websocket_api.websocket_command(
    {vol.Required("type"): "room_navbar/list_configs"}
)
@websocket_api.async_response
async def ws_list_configs(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Vrátí seznam ID a názvů všech uložených konfigurací."""
    store = hass.data[DOMAIN]["store"]
    configs = store.get_configs()
    connection.send_result(
        msg["id"],
        {
            "configs": [
                {"id": cid, "name": cdata.get("name", cid), "room_count": len(cdata.get("rooms", []))}
                for cid, cdata in configs.items()
            ]
        },
    )


# ---------------------------------------------------------------------------
# get_config
# ---------------------------------------------------------------------------

@websocket_api.websocket_command(
    {
        vol.Required("type"): "room_navbar/get_config",
        vol.Required("config_id"): str,
    }
)
@websocket_api.async_response
async def ws_get_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Vrátí kompletní data jedné konfigurace."""
    store = hass.data[DOMAIN]["store"]
    config = store.get_config(msg["config_id"])
    if config is None:
        connection.send_error(
            msg["id"],
            "not_found",
            f"Konfigurace '{msg['config_id']}' neexistuje.",
        )
        return
    connection.send_result(msg["id"], config)


# ---------------------------------------------------------------------------
# save_config
# ---------------------------------------------------------------------------

@websocket_api.websocket_command(
    {
        vol.Required("type"): "room_navbar/save_config",
        vol.Required("config_id"): str,
        vol.Required("config_data"): dict,
    }
)
@websocket_api.async_response
async def ws_save_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Uloží (vytvoří nebo aktualizuje) konfiguraci a obnoví sensory."""
    config_id: str = msg["config_id"]
    config_data: dict = msg["config_data"]

    # Základní validace – config_data musí mít rooms seznam
    if not isinstance(config_data.get("rooms"), list):
        connection.send_error(
            msg["id"],
            "invalid_data",
            "config_data musí obsahovat klíč 'rooms' jako seznam.",
        )
        return

    # Každý pokoj musí mít 'id'
    for room in config_data["rooms"]:
        if not room.get("id"):
            connection.send_error(
                msg["id"],
                "invalid_data",
                "Každý pokoj musí mít neprázdné pole 'id'.",
            )
            return

    store = hass.data[DOMAIN]["store"]
    await store.async_save_config(config_id, config_data)
    # Listener v sensor.py automaticky zavolá SensorManager.refresh_for_config

    _LOGGER.info("Room Navbar WS: konfigurace '%s' uložena", config_id)
    connection.send_result(msg["id"], {"success": True, "config_id": config_id})


# ---------------------------------------------------------------------------
# delete_config
# ---------------------------------------------------------------------------

@websocket_api.websocket_command(
    {
        vol.Required("type"): "room_navbar/delete_config",
        vol.Required("config_id"): str,
    }
)
@websocket_api.async_response
async def ws_delete_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict,
) -> None:
    """Smaže konfiguraci a označí příslušné sensory jako unavailable."""
    store = hass.data[DOMAIN]["store"]
    deleted = await store.async_delete_config(msg["config_id"])

    if not deleted:
        connection.send_error(
            msg["id"],
            "not_found",
            f"Konfigurace '{msg['config_id']}' neexistuje.",
        )
        return

    _LOGGER.info("Room Navbar WS: konfigurace '%s' smazána", msg["config_id"])
    connection.send_result(msg["id"], {"success": True})
