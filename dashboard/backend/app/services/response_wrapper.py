import time
from typing import Any, Optional

def wrap_response(data: Any = None, error_code: int = 0, error_message: str = ""):
    return {
        "error_code": error_code,
        "error_message": error_message,
        "server_time": int(time.time() * 1000),
        "data": data if data is not None else {}
    }
