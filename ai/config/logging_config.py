"""
Logging configuration for the ChainGuard AI service.

Deliberately mirrors backend/src/config/logger.js's shape (per the Phase 3A
design document, Step 4.7): leveled, timestamped, written both to the
console and to a rotating-by-run log file under logs/ (gitignored, same
convention as backend/logs/ and frontend's absence of logs — this is a
server-side-only concern).
"""
import logging
import sys
from pathlib import Path

from config.settings import get_settings


def configure_logging() -> logging.Logger:
    settings = get_settings()

    log_dir = Path(settings.log_dir)
    log_dir.mkdir(parents=True, exist_ok=True)

    logger = logging.getLogger("chainguard_ai")
    logger.setLevel(settings.log_level.upper())

    # Avoid duplicate handlers if configure_logging() is called more than
    # once (e.g. once by main.py, once by a test importing it directly).
    if logger.handlers:
        return logger

    formatter = logging.Formatter(
        fmt="[%(asctime)s] %(levelname)s %(name)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    file_handler = logging.FileHandler(log_dir / "ai_service.log")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    error_file_handler = logging.FileHandler(log_dir / "error.log")
    error_file_handler.setLevel(logging.ERROR)
    error_file_handler.setFormatter(formatter)
    logger.addHandler(error_file_handler)

    return logger


logger = configure_logging()
