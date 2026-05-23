"""Config flow pro Room Navbar Card – jednoduchý jednokrokový setup."""
from __future__ import annotations

from homeassistant import config_entries
from homeassistant.core import callback

from .const import DOMAIN


class RoomNavbarConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Jednoduchý config flow – integrace nemá žádné uživatelské parametry."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Krok pro ruční přidání integrace přes UI."""
        # Povolíme pouze jednu instanci
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(title="Room Navbar", data={})

        return self.async_show_form(step_id="user")

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return RoomNavbarOptionsFlow(config_entry)


class RoomNavbarOptionsFlow(config_entries.OptionsFlow):
    """Options flow – zatím prázdný, pro budoucí rozšíření."""

    def __init__(self, config_entry):
        self._config_entry = config_entry

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)
        return self.async_show_form(step_id="init")
