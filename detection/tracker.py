"""
Visitor Tracking Module
Tracks visitor count, session history, and manages greeting cooldowns.
"""

import time
import threading
import logging
from typing import Optional, Callable, Dict, List
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class VisitorSession:
    """Represents a single visitor detection session."""

    entry_time: float
    exit_time: Optional[float] = None
    peak_count: int = 1
    greeted: bool = False

    @property
    def duration(self) -> float:
        end = self.exit_time or time.time()
        return end - self.entry_time


class VisitorTracker:
    """
    Tracks visitor count and manages greeting logic.
    Features:
    - Total visitor count across sessions
    - Current visitor count
    - Greeting cooldown to prevent repeated greetings
    - Session history
    """

    def __init__(
        self,
        greeting_cooldown: float = 10.0,
        min_detection_duration: float = 1.0,
    ):
        """
        Args:
            greeting_cooldown: Minimum seconds between greetings
            min_detection_duration: Minimum seconds a person must be detected
                                     before triggering a greeting (reduces false positives)
        """
        self.greeting_cooldown = greeting_cooldown
        self.min_detection_duration = min_detection_duration

        self._lock = threading.Lock()

        # Counters
        self._total_visitors = 0
        self._current_count = 0
        self._session_count = 0

        # State
        self._last_greeting_time = 0.0
        self._current_session: Optional[VisitorSession] = None
        self._sessions: List[VisitorSession] = []
        self._person_first_seen: Optional[float] = None

        # Callbacks
        self._on_greeting_trigger: Optional[Callable] = None

    def set_greeting_callback(self, callback: Callable):
        """Set callback for when greeting should be triggered.
        Callback signature: callback(visitor_count: int, session: VisitorSession)
        """
        self._on_greeting_trigger = callback

    def person_entered(self, count: int, detections: List[Dict]):
        """Called when persons are detected in frame."""
        with self._lock:
            now = time.time()
            self._current_count = count

            # Start new session if not in one
            if self._current_session is None:
                self._person_first_seen = now
                self._current_session = VisitorSession(
                    entry_time=now, peak_count=count
                )
                self._session_count += 1
                logger.info(
                    f"[Tracker] New visitor session started "
                    f"(session #{self._session_count})"
                )
            else:
                # Update peak count
                if count > self._current_session.peak_count:
                    self._current_session.peak_count = count

            # Check if we should trigger greeting
            if self._should_greet(now):
                self._trigger_greeting(count, now)

    def person_exited(self):
        """Called when no persons are detected in frame."""
        with self._lock:
            self._current_count = 0
            self._person_first_seen = None

            if self._current_session is not None:
                self._current_session.exit_time = time.time()
                duration = self._current_session.duration
                self._total_visitors += self._current_session.peak_count
                self._sessions.append(self._current_session)
                logger.info(
                    f"[Tracker] Session ended. Duration: {duration:.1f}s, "
                    f"Peak count: {self._current_session.peak_count}, "
                    f"Total visitors: {self._total_visitors}"
                )
                self._current_session = None

    def _should_greet(self, now: float) -> bool:
        """Check if we should trigger a greeting."""
        # Already greeted this session
        if self._current_session and self._current_session.greeted:
            return False

        # Cooldown not elapsed
        if now - self._last_greeting_time < self.greeting_cooldown:
            return False

        # Person must be visible for minimum duration
        if self._person_first_seen is None:
            return False
        if now - self._person_first_seen < self.min_detection_duration:
            return False

        return True

    def _trigger_greeting(self, count: int, now: float):
        """Trigger the greeting callback."""
        self._last_greeting_time = now
        if self._current_session:
            self._current_session.greeted = True

        logger.info(f"[Tracker] Triggering greeting for {count} visitor(s)")

        if self._on_greeting_trigger:
            try:
                self._on_greeting_trigger(count, self._current_session)
            except Exception as e:
                logger.error(f"[Tracker] Greeting callback error: {e}")

    def reset_greeting_cooldown(self):
        """Force reset the greeting cooldown (allows immediate greeting)."""
        with self._lock:
            self._last_greeting_time = 0.0
            if self._current_session:
                self._current_session.greeted = False

    @property
    def total_visitors(self) -> int:
        with self._lock:
            return self._total_visitors

    @property
    def current_count(self) -> int:
        with self._lock:
            return self._current_count

    @property
    def session_count(self) -> int:
        with self._lock:
            return self._session_count

    @property
    def is_greeting_on_cooldown(self) -> bool:
        with self._lock:
            return time.time() - self._last_greeting_time < self.greeting_cooldown

    def get_stats(self) -> Dict:
        """Get current tracking statistics."""
        with self._lock:
            return {
                "total_visitors": self._total_visitors,
                "current_count": self._current_count,
                "session_count": self._session_count,
                "greeting_cooldown_remaining": max(
                    0,
                    self.greeting_cooldown
                    - (time.time() - self._last_greeting_time),
                ),
                "in_session": self._current_session is not None,
                "session_duration": self._current_session.duration
                if self._current_session
                else 0,
            }

    def reset(self):
        """Reset all tracking state."""
        with self._lock:
            self._total_visitors = 0
            self._current_count = 0
            self._session_count = 0
            self._last_greeting_time = 0.0
            self._current_session = None
            self._sessions.clear()
            self._person_first_seen = None
            logger.info("[Tracker] Reset all tracking state")


# Singleton
_tracker_instance: Optional[VisitorTracker] = None


def get_tracker(
    greeting_cooldown: float = 10.0,
    min_detection_duration: float = 1.0,
) -> VisitorTracker:
    global _tracker_instance
    if _tracker_instance is None:
        _tracker_instance = VisitorTracker(
            greeting_cooldown=greeting_cooldown,
            min_detection_duration=min_detection_duration,
        )
    return _tracker_instance
