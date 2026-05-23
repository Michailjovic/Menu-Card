"""Konstanty pro Room Navbar Card integraci."""

DOMAIN = "room_navbar"

STORAGE_KEY = "room_navbar"
STORAGE_VERSION = 1

# Prefix pro generované sensory
SENSOR_PREFIX = "rnc"

# WS příkazy
WS_LIST_CONFIGS = "room_navbar/list_configs"
WS_GET_CONFIG = "room_navbar/get_config"
WS_SAVE_CONFIG = "room_navbar/save_config"
WS_DELETE_CONFIG = "room_navbar/delete_config"

# Výchozí hodnoty filtru
DEFAULT_FILTER_OFF = "brightness(0.6) saturate(1.0)"
DEFAULT_FILTER_ON = "brightness(1.8) sepia(0.2) saturate(1.2)"
DEFAULT_FILTER_DAY = "brightness(1.3) saturate(1.05)"
