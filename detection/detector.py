"""
Human Detection Module using YOLOv8
Detects people using webcam and provides annotated frames with bounding boxes.
"""

import cv2
import numpy as np
import threading
import time
import logging
from typing import Optional, Callable, List, Tuple, Dict

logger = logging.getLogger(__name__)

# Lazy import to avoid slow startup
YOLO = None


def _load_yolo():
    global YOLO
    if YOLO is None:
        from ultralytics import YOLO as _YOLO

        YOLO = _YOLO
    return YOLO


class DetectionResult:
    """Result of a single detection frame."""

    def __init__(self, frame: np.ndarray, detections: List[Dict], timestamp: float):
        self.frame = frame
        self.detections = detections
        self.timestamp = timestamp
        self.person_count = len(detections)

    @property
    def person_centers(self) -> List[Tuple[int, int]]:
        """Get center points of all detected persons."""
        return [
            (d["center_x"], d["center_y"])
            for d in self.detections
            if d["class"] == 0
        ]


class HumanDetector:
    """
    YOLOv8-based human detector with webcam support.
    Runs detection in a background thread and provides annotated frames.
    """

    def __init__(
        self,
        model_path: str = "yolov8n.pt",
        camera_index: int = 0,
        confidence_threshold: float = 0.5,
        target_class: int = 0,  # 0 = person
        frame_width: int = 640,
        frame_height: int = 480,
        target_fps: int = 24,
    ):
        self.model_path = model_path
        self.camera_index = camera_index
        self.confidence_threshold = confidence_threshold
        self.target_class = target_class
        self.frame_width = frame_width
        self.frame_height = frame_height
        self.target_fps = target_fps
        self._frame_interval = 1.0 / target_fps

        self._model = None
        self._cap = None
        self._running = False
        self._thread = None
        self._lock = threading.Lock()

        # Latest detection state
        self._latest_frame: Optional[np.ndarray] = None
        self._latest_annotated: Optional[np.ndarray] = None
        self._latest_detections: List[Dict] = []
        self._person_count = 0
        self._fps = 0.0

        # Callbacks
        self._on_person_enter: Optional[Callable] = None
        self._on_person_exit: Optional[Callable] = None
        self._on_count_change: Optional[Callable] = None

        # State tracking for enter/exit events
        self._was_person_present = False

    def initialize(self):
        """Load the YOLO model. Call this once before starting."""
        logger.info(f"[Detector] Loading YOLOv8 model: {self.model_path}")
        YOLO_cls = _load_yolo()
        self._model = YOLO_cls(self.model_path)
        logger.info("[Detector] Model loaded successfully")

    def set_callbacks(
        self,
        on_person_enter: Optional[Callable] = None,
        on_person_exit: Optional[Callable] = None,
        on_count_change: Optional[Callable] = None,
    ):
        """Set event callbacks for person detection events."""
        self._on_person_enter = on_person_enter
        self._on_person_exit = on_person_exit
        self._on_count_change = on_count_change

    def _open_camera(self, camera_index: int):
        """Try to open camera with multiple backends. Returns cv2.VideoCapture or None."""
        backends = []

        # Build backend list based on platform
        if hasattr(cv2, "CAP_DSHOW"):
            backends.append((cv2.CAP_DSHOW, "DirectShow"))
        if hasattr(cv2, "CAP_MSMF"):
            backends.append((cv2.CAP_MSMF, "MSMF"))
        if hasattr(cv2, "CAP_V4L2"):
            backends.append((cv2.CAP_V4L2, "V4L2"))
        backends.append((cv2.CAP_ANY, "auto"))

        for backend, name in backends:
            cap = None
            try:
                cap = cv2.VideoCapture(camera_index, backend)
                if not cap.isOpened():
                    cap.release()
                    continue

                # Set a short timeout for the grab test
                cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.frame_width)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.frame_height)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

                # Quick grab test — grab() is faster than read()
                grabbed = cap.grab()
                if grabbed:
                    logger.info(f"[Detector] Camera {camera_index} opened ({name})")
                    return cap
                else:
                    logger.warning(f"[Detector] {name}: opened but can't grab frame")
                    cap.release()
            except Exception as e:
                logger.warning(f"[Detector] {name}: {e}")
                if cap:
                    try:
                        cap.release()
                    except Exception:
                        pass

        logger.error(
            f"[Detector] Cannot open camera {camera_index}. "
            f"Check if webcam is connected and not in use by another app."
        )
        return None

    def start(self) -> bool:
        """Start the detection loop in a background thread."""
        if self._running:
            logger.warning("[Detector] Already running")
            return True

        if self._model is None:
            self.initialize()

        self._cap = self._open_camera(self.camera_index)
        if self._cap is None:
            return False

        self._running = True
        self._thread = threading.Thread(target=self._detection_loop, daemon=True)
        self._thread.start()
        logger.info(
            f"[Detector] Started on camera {self.camera_index} "
            f"({self.frame_width}x{self.frame_height})"
        )
        return True

    def stop(self):
        """Stop the detection loop."""
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3.0)
        if self._cap:
            self._cap.release()
            self._cap = None
        self._latest_frame = None
        self._latest_annotated = None
        self._latest_detections = []
        self._person_count = 0
        logger.info("[Detector] Stopped")

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def person_count(self) -> int:
        with self._lock:
            return self._person_count

    @property
    def fps(self) -> float:
        return self._fps

    def get_latest_annotated_frame(self) -> Optional[np.ndarray]:
        """Get the latest annotated frame (thread-safe copy)."""
        with self._lock:
            if self._latest_annotated is not None:
                return self._latest_annotated.copy()
        return None

    def get_latest_detections(self) -> List[Dict]:
        """Get the latest detection data."""
        with self._lock:
            return list(self._latest_detections)

    def get_detection_result(self) -> Optional[DetectionResult]:
        """Get the latest full detection result."""
        with self._lock:
            if self._latest_annotated is not None:
                return DetectionResult(
                    frame=self._latest_annotated.copy(),
                    detections=list(self._latest_detections),
                    timestamp=time.time(),
                )
        return None

    def _detection_loop(self):
        """Main detection loop running in background thread.
        Limits YOLO inference to target_fps to reduce CPU/GPU load.
        """
        frame_count = 0
        start_time = time.time()
        last_detection_time = 0.0

        # Reuse last results when skipping inference
        last_detections = []
        last_annotated = None

        while self._running:
            ret, frame = self._cap.read()
            if not ret:
                logger.warning("[Detector] Failed to read frame")
                time.sleep(0.1)
                continue

            now = time.time()

            # Only run YOLO at target FPS rate
            if now - last_detection_time >= self._frame_interval:
                last_detection_time = now

                # Run YOLO inference
                results = self._model(
                    frame,
                    classes=[self.target_class],
                    conf=self.confidence_threshold,
                    verbose=False,
                )

                # Extract detections
                detections = []
                if results and len(results) > 0:
                    result = results[0]
                    if result.boxes is not None:
                        for box in result.boxes:
                            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                            conf = float(box.conf[0].cpu().numpy())
                            cls = int(box.cls[0].cpu().numpy())
                            center_x = int((x1 + x2) / 2)
                            center_y = int((y1 + y2) / 2)

                            detections.append(
                                {
                                    "x1": int(x1),
                                    "y1": int(y1),
                                    "x2": int(x2),
                                    "y2": int(y2),
                                    "center_x": center_x,
                                    "center_y": center_y,
                                    "confidence": round(conf, 3),
                                    "class": cls,
                                    "label": "person",
                                }
                            )

                # Annotate frame
                annotated = results[0].plot() if results else frame

                last_detections = detections
                last_annotated = annotated
            else:
                # Skip YOLO — reuse last results with fresh frame
                detections = last_detections
                annotated = frame.copy()
                # Draw last bounding boxes on current frame
                for d in detections:
                    cv2.rectangle(
                        annotated,
                        (d["x1"], d["y1"]),
                        (d["x2"], d["y2"]),
                        (0, 255, 0),
                        2,
                    )
                    cv2.putText(
                        annotated,
                        f"person {d['confidence']:.2f}",
                        (d["x1"], d["y1"] - 8),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (0, 255, 0),
                        1,
                    )

            # Draw info overlay
            person_count = len(detections)
            cv2.putText(
                annotated,
                f"People: {person_count}",
                (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 255, 0) if person_count > 0 else (128, 128, 128),
                2,
            )

            # Calculate FPS
            frame_count += 1
            elapsed = now - start_time
            if elapsed > 0:
                fps = frame_count / elapsed
                if frame_count % 24 == 0:
                    self._fps = round(fps, 1)
                cv2.putText(
                    annotated,
                    f"FPS: {fps:.1f}",
                    (10, 60),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (255, 255, 0),
                    2,
                )

            # Update state
            with self._lock:
                self._latest_frame = frame
                self._latest_annotated = annotated
                self._latest_detections = detections
                self._person_count = person_count

            # Fire callbacks for enter/exit events
            person_present = person_count > 0
            if person_present and not self._was_person_present:
                if self._on_person_enter:
                    try:
                        self._on_person_enter(person_count, detections)
                    except Exception as e:
                        logger.error(f"[Detector] on_person_enter error: {e}")
            elif not person_present and self._was_person_present:
                if self._on_person_exit:
                    try:
                        self._on_person_exit()
                    except Exception as e:
                        logger.error(f"[Detector] on_person_exit error: {e}")

            if person_present != self._was_person_present:
                if self._on_count_change:
                    try:
                        self._on_count_change(person_count)
                    except Exception as e:
                        logger.error(f"[Detector] on_count_change error: {e}")

            self._was_person_present = person_present

        logger.info("[Detector] Detection loop ended")

    def generate_mjpeg_frames(self):
        """
        Generator that yields MJPEG frames for streaming.
        Uses target_fps to limit output rate.
        """
        interval = 1.0 / self.target_fps
        while self._running:
            frame = self.get_latest_annotated_frame()
            if frame is None:
                time.sleep(interval)
                continue

            ret, buffer = cv2.imencode(
                ".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 75]
            )
            if not ret:
                continue

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + buffer.tobytes()
                + b"\r\n"
            )
            time.sleep(interval)


# Singleton instance
_detector_instance: Optional[HumanDetector] = None


def get_detector(
    model_path: str = "yolov8n.pt",
    camera_index: int = 0,
    confidence_threshold: float = 0.5,
) -> HumanDetector:
    """Get or create the singleton HumanDetector instance."""
    global _detector_instance
    if _detector_instance is None:
        _detector_instance = HumanDetector(
            model_path=model_path,
            camera_index=camera_index,
            confidence_threshold=confidence_threshold,
        )
    return _detector_instance
