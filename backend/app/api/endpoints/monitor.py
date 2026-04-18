from fastapi import APIRouter, Request, Body
import logging
import os

router = APIRouter()

# Setup a dedicated logger for frontend errors
LOG_DIR = "logs"
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)

fe_logger = logging.getLogger("frontend_errors")
fe_logger.setLevel(logging.ERROR)
fh = logging.FileHandler(os.path.join(LOG_DIR, "frontend_errors.log"))
formatter = logging.Formatter('%(asctime)s - %(message)s')
fh.setFormatter(formatter)
fe_logger.addHandler(fh)

@router.post("/log")
async def receive_frontend_log(
    request: Request,
    data: dict = Body(...)
):
    """Receive and log errors from the frontend browser console."""
    msg = data.get("message", "Unknown Error")
    stack = data.get("stack", "")
    url = data.get("url", "")
    
    log_entry = f"URL: {url} | MSG: {msg} | STACK: {stack}"
    fe_logger.error(log_entry)
    
    # Also print to stdout so I can see it in real-time logs
    print(f"!!! [FRONTEND_ERROR] {msg}")
    return {"status": "logged"}
