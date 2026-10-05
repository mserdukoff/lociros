from __future__ import annotations

import functools
import threading
from typing import Callable, TypeVar

T = TypeVar("T")


def load_once(fn: Callable[[], T]) -> Callable[[], T]:
    """Run a zero-argument loader once per process, even under concurrent first calls.

    lru_cache lets every thread that arrives before the first result is stored
    run the loader too. For the language models that meant a cold replica could
    build several copies of a 1 GB analyzer at once and run out of memory.
    """
    lock = threading.Lock()
    done = False
    value: T

    @functools.wraps(fn)
    def wrapper() -> T:
        nonlocal done, value
        if not done:
            with lock:
                if not done:
                    value = fn()
                    done = True
        return value

    def cache_clear() -> None:
        nonlocal done
        with lock:
            done = False

    wrapper.cache_clear = cache_clear  # type: ignore[attr-defined]
    return wrapper
