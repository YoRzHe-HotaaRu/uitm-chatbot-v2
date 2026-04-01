"""
Human Detection Module
Provides YOLOv8-based person detection with zone tracking,
visitor counting, and MJPEG streaming for the AI Receptionist.
"""

from .detector import HumanDetector, get_detector, DetectionResult
from .zone import ZoneDetector, ZoneConfig, get_zone_detector
from .tracker import VisitorTracker, VisitorSession, get_tracker

__all__ = [
    "HumanDetector",
    "get_detector",
    "DetectionResult",
    "ZoneDetector",
    "ZoneConfig",
    "get_zone_detector",
    "VisitorTracker",
    "VisitorSession",
    "get_tracker",
]
