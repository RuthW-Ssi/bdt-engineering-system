import os
import re

_SAFE_ID_PATTERN = re.compile(r'^[A-Za-z0-9_-]+\Z')


def sanitize_identifier(value):
    """Reject any value not safe to use as a path segment (path traversal guard)."""
    if not value or not _SAFE_ID_PATTERN.match(value):
        raise ValueError(f"Invalid identifier: {value!r}")
    return value


def safe_filename(filename):
    """Reject any filename not safe to use as a single path component
    (path traversal guard for direct file uploads, no zip involved)."""
    if not filename or filename in ('.', '..'):
        raise ValueError(f"Invalid filename: {filename!r}")
    if os.path.basename(filename) != filename:
        raise ValueError(f"Invalid filename: {filename!r}")
    return filename
