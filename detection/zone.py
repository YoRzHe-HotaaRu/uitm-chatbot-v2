"""
Zone Detection Module
Supports virtual line crossing detection for triggering events
when a person enters a defined zone.
"""

import numpy as np
from typing import List, Tuple, Optional, Dict
import logging

logger = logging.getLogger(__name__)


class ZoneConfig:
    """Configuration for a detection zone."""

    def __init__(
        self,
        zone_type: str = "line",
        points: Optional[List[Tuple[int, int]]] = None,
        name: str = "default",
    ):
        """
        Args:
            zone_type: 'line' for virtual line crossing, 'polygon' for area detection
            points: List of (x, y) points defining the zone.
                    For 'line': exactly 2 points [(x1,y1), (x2,y2)]
                    For 'polygon': 3+ points forming a closed polygon
            name: Human-readable zone name
        """
        self.zone_type = zone_type
        self.name = name
        self.points = points or []
        self.enabled = True

        # State tracking for line crossing
        self._previous_positions: Dict[int, Tuple[int, int]] = {}
        self._crossed_ids: set = set()

    def to_dict(self) -> Dict:
        return {
            "zone_type": self.zone_type,
            "name": self.name,
            "points": self.points,
            "enabled": self.enabled,
        }

    @classmethod
    def from_dict(cls, data: Dict) -> "ZoneConfig":
        zone = cls(
            zone_type=data.get("zone_type", "line"),
            points=[tuple(p) for p in data.get("points", [])],
            name=data.get("name", "default"),
        )
        zone.enabled = data.get("enabled", True)
        return zone


class ZoneDetector:
    """
    Detects when persons cross a virtual line or enter a polygon zone.
    Used to trigger greetings only when someone enters a specific area.
    """

    def __init__(self):
        self.zones: List[ZoneConfig] = []
        self._cross_callbacks: List = []

    def add_zone(self, zone: ZoneConfig):
        """Add a detection zone."""
        self.zones.append(zone)
        logger.info(
            f"[Zone] Added zone '{zone.name}' ({zone.zone_type}) "
            f"with {len(zone.points)} points"
        )

    def remove_zone(self, name: str):
        """Remove a zone by name."""
        self.zones = [z for z in self.zones if z.name != name]

    def clear_zones(self):
        """Remove all zones."""
        self.zones.clear()

    def set_default_line(self, frame_width: int, frame_height: int):
        """
        Set a default horizontal line at the bottom third of the frame.
        This triggers when someone 'crosses' into the reception area.
        """
        y_line = int(frame_height * 0.65)
        zone = ZoneConfig(
            zone_type="line",
            points=[(0, y_line), (frame_width, y_line)],
            name="reception_line",
        )
        self.clear_zones()
        self.add_zone(zone)
        logger.info(f"[Zone] Default line set at y={y_line}")

    def on_cross(self, callback):
        """Register a callback for zone crossing events."""
        self._cross_callbacks.append(callback)

    def check_detections(
        self, detections: List[Dict]
    ) -> List[Dict]:
        """
        Check detections against all zones.
        Returns list of crossing events.
        """
        events = []

        for zone in self.zones:
            if not zone.enabled or len(zone.points) < 2:
                continue

            if zone.zone_type == "line":
                crossing = self._check_line_crossing(detections, zone)
                if crossing:
                    events.append(crossing)
            elif zone.zone_type == "polygon":
                inside = self._check_polygon_inside(detections, zone)
                if inside:
                    events.append(inside)

        return events

    def _check_line_crossing(
        self, detections: List[Dict], zone: ZoneConfig
    ) -> Optional[Dict]:
        """
        Check if any detected person crossed the virtual line.
        Uses center-point tracking with simple position comparison.
        """
        if len(zone.points) < 2:
            return None

        p1, p2 = zone.points[0], zone.points[1]

        for i, det in enumerate(detections):
            cx, cy = det["center_x"], det["center_y"]

            # Use detection index as a simple tracker ID
            det_id = i

            if det_id in zone._previous_positions:
                prev_cx, prev_cy = zone._previous_positions[det_id]

                # Check if the person crossed the line
                # Simple approach: check if y-coordinate crossed the line y
                if p1[1] == p2[1]:  # Horizontal line
                    line_y = p1[1]
                    crossed_down = prev_cy < line_y <= cy  # Approaching from top
                    crossed_up = prev_cy > line_y >= cy  # Leaving from bottom

                    if crossed_down and det_id not in zone._crossed_ids:
                        zone._crossed_ids.add(det_id)
                        event = {
                            "type": "line_cross",
                            "direction": "enter",
                            "zone_name": zone.name,
                            "position": (cx, cy),
                            "confidence": det.get("confidence", 0),
                        }
                        # Fire callbacks
                        for cb in self._cross_callbacks:
                            try:
                                cb(event)
                            except Exception as e:
                                logger.error(f"[Zone] Callback error: {e}")
                        return event

                    elif crossed_up and det_id in zone._crossed_ids:
                        zone._crossed_ids.discard(det_id)
                        event = {
                            "type": "line_cross",
                            "direction": "exit",
                            "zone_name": zone.name,
                            "position": (cx, cy),
                            "confidence": det.get("confidence", 0),
                        }
                        for cb in self._cross_callbacks:
                            try:
                                cb(event)
                            except Exception as e:
                                logger.error(f"[Zone] Callback error: {e}")
                        return event

                else:  # Non-horizontal line - use point-to-line distance
                    crossed = self._line_side_test(
                        prev_cx, prev_cy, cx, cy, p1, p2
                    )
                    if crossed == "crossed_enter" and det_id not in zone._crossed_ids:
                        zone._crossed_ids.add(det_id)
                        event = {
                            "type": "line_cross",
                            "direction": "enter",
                            "zone_name": zone.name,
                            "position": (cx, cy),
                            "confidence": det.get("confidence", 0),
                        }
                        for cb in self._cross_callbacks:
                            try:
                                cb(event)
                            except Exception as e:
                                logger.error(f"[Zone] Callback error: {e}")
                        return event

            zone._previous_positions[det_id] = (cx, cy)

        return None

    def _check_polygon_inside(
        self, detections: List[Dict], zone: ZoneConfig
    ) -> Optional[Dict]:
        """Check if any person is inside the polygon zone."""
        if len(zone.points) < 3:
            return None

        polygon = np.array(zone.points, dtype=np.int32)

        for det in detections:
            cx, cy = det["center_x"], det["center_y"]
            inside = cv2_point_in_polygon(cx, cy, polygon)
            if inside:
                return {
                    "type": "zone_enter",
                    "zone_name": zone.name,
                    "position": (cx, cy),
                    "confidence": det.get("confidence", 0),
                }
        return None

    def _line_side_test(
        self,
        px: int,
        py: int,
        cx: int,
        cy: int,
        p1: Tuple[int, int],
        p2: Tuple[int, int],
    ) -> Optional[str]:
        """Test if a point crossed from one side of a line to the other."""
        side_prev = self._point_side_of_line(px, py, p1, p2)
        side_curr = self._point_side_of_line(cx, cy, p1, p2)

        if side_prev * side_curr < 0:  # Different sides = crossed
            if side_curr > 0:
                return "crossed_enter"
            else:
                return "crossed_exit"
        return None

    @staticmethod
    def _point_side_of_line(
        px: int, py: int, p1: Tuple[int, int], p2: Tuple[int, int]
    ) -> float:
        """Determine which side of a line a point is on.
        Returns positive/negative value, 0 if on the line."""
        return (p2[0] - p1[0]) * (py - p1[1]) - (p2[1] - p1[1]) * (px - p1[0])

    def draw_zones(self, frame: np.ndarray) -> np.ndarray:
        """Draw all active zones on the frame."""
        import cv2

        for zone in self.zones:
            if not zone.enabled or len(zone.points) < 2:
                continue

            color = (0, 255, 255)  # Yellow for zones

            if zone.zone_type == "line":
                pt1 = tuple(zone.points[0])
                pt2 = tuple(zone.points[1])
                cv2.line(frame, pt1, pt2, color, 2)
                # Label
                mid_x = (pt1[0] + pt2[0]) // 2
                mid_y = (pt1[1] + pt2[1]) // 2 - 10
                cv2.putText(
                    frame,
                    f"Zone: {zone.name}",
                    (mid_x, mid_y),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    color,
                    1,
                )
            elif zone.zone_type == "polygon":
                pts = np.array(zone.points, dtype=np.int32)
                cv2.polylines(frame, [pts], True, color, 2)

        return frame


def cv2_point_in_polygon(px: int, py: int, polygon: np.ndarray) -> bool:
    """Check if a point is inside a polygon using OpenCV."""
    import cv2

    return cv2.pointPolygonTest(polygon, (float(px), float(py)), False) >= 0


# Singleton
_zone_detector: Optional[ZoneDetector] = None


def get_zone_detector() -> ZoneDetector:
    global _zone_detector
    if _zone_detector is None:
        _zone_detector = ZoneDetector()
    return _zone_detector
