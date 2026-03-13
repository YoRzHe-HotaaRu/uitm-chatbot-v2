"""
Gesture Controller for VTube Studio
Manages natural, organic head/body/brow/eye movements during speech.
Uses layered noise-like motion, smooth easing, and multi-channel blending
to produce human-like animation instead of robotic sine waves.
"""

import asyncio
import random
import math
from typing import Optional, List, Dict
from dataclasses import dataclass, field
from enum import Enum


class EmotionType(Enum):
    """Emotion types for gesture mapping."""
    NEUTRAL = "neutral"
    HAPPY = "happy"
    SAD = "sad"
    EXCITED = "excited"
    THINKING = "thinking"
    SURPRISED = "surprised"
    CONFUSED = "confused"


@dataclass
class GestureConfig:
    """Configuration for natural gesture animations."""

    # --- Organic drift (slow wandering baseline) ---
    drift_amplitude: float = 7.0         # Max degrees for slow drift
    drift_speed: float = 0.18            # Very slow wandering Hz

    # --- Speech rhythm ---
    rhythm_amplitude: float = 5.0        # Talking rhythm range (degrees)
    rhythm_base_speed: float = 1.8       # Base speech rhythm Hz
    rhythm_variation: float = 0.3        # Random speed variation ±30%

    # --- Emphasis gestures ---
    emphasis_enabled: bool = True
    emphasis_nod_strength: float = 10.0  # Noticeable nod (degrees)
    emphasis_tilt_strength: float = 7.0  # Noticeable tilt (degrees)
    emphasis_easing_speed: float = 8.0   # Easing rate for emphasis

    # --- Body follow ---
    body_follow_ratio: float = 0.6       # Body follows head at 60%
    body_phase_delay: float = 0.15       # Body lags head by 150ms

    # --- Micro-expressions ---
    brow_emphasis_strength: float = 0.55 # Brow raise on emphasis (0-1)
    eye_drift_amplitude: float = 0.3     # Eye movement range
    eye_drift_speed: float = 0.45        # Eye drift Hz

    # --- Smoothing / transitions ---
    transition_speed: float = 0.07       # Easing factor per frame (lower = smoother)
    start_ramp_duration: float = 0.8     # Seconds to ramp up at speech start
    stop_ramp_duration: float = 0.6      # Seconds to ramp down at speech end

    # --- Engagement tracking ---
    engagement_enabled: bool = True
    engagement_range: float = 10.0

    # --- Amplitude envelope ---
    envelope_speed: float = 0.1          # Hz for amplitude modulation
    envelope_min: float = 0.5            # Minimum amplitude multiplier
    envelope_max: float = 1.0            # Maximum amplitude multiplier

    # --- Emotion-based positions ---
    emotion_positions: Dict[EmotionType, Dict[str, float]] = None

    def __post_init__(self):
        if self.emotion_positions is None:
            self.emotion_positions = {
                EmotionType.NEUTRAL: {"x": 0, "y": 0, "z": 0},
                EmotionType.HAPPY: {"x": 0, "y": 5, "z": 0},
                EmotionType.SAD: {"x": 0, "y": -8, "z": 0},
                EmotionType.EXCITED: {"x": 0, "y": 3, "z": 5},
                EmotionType.THINKING: {"x": 0, "y": 2, "z": -8},
                EmotionType.SURPRISED: {"x": 0, "y": -5, "z": 0},
                EmotionType.CONFUSED: {"x": 5, "y": 3, "z": -5},
            }


# Irrational frequency ratios that never repeat perfectly
_PHI = 1.6180339887       # Golden ratio
_SQRT2 = 1.4142135624     # √2
_SQRT3 = 1.7320508076     # √3
_SQRT5 = 2.2360679775     # √5


def _organic_noise(t: float, base_speed: float, amplitude: float = 1.0) -> float:
    """
    Generate organic, non-repeating noise using layered sine waves
    at irrational frequency ratios. Produces motion that feels natural
    rather than robotically periodic.

    Args:
        t: Time in seconds
        base_speed: Base frequency in Hz
        amplitude: Output amplitude multiplier

    Returns:
        Noise value in range [-amplitude, +amplitude] (approximately)
    """
    # Layer 1: Primary motion
    v = math.sin(t * base_speed * 2 * math.pi) * 0.4
    # Layer 2: Golden ratio offset — never aligns with layer 1
    v += math.sin(t * base_speed * _PHI * 2 * math.pi) * 0.25
    # Layer 3: √2 ratio — different phase drift
    v += math.sin(t * base_speed * _SQRT2 * 2 * math.pi + 0.7) * 0.2
    # Layer 4: Very slow drift at √3 ratio
    v += math.sin(t * base_speed * 0.3 * _SQRT3 * 2 * math.pi + 2.1) * 0.15

    return v * amplitude


def _ease_toward(current: float, target: float, speed: float, dt: float) -> float:
    """
    Exponential ease toward a target value. Produces smooth, natural
    transitions instead of instant snaps.

    Args:
        current: Current value
        target: Target value
        speed: Easing speed (higher = faster approach)
        dt: Delta time in seconds

    Returns:
        New value eased toward target
    """
    factor = 1.0 - math.exp(-speed * dt)
    return current + (target - current) * factor


def _amplitude_envelope(t: float, speed: float, min_val: float, max_val: float) -> float:
    """
    Slow amplitude modulation so gesture intensity varies over time
    instead of staying constant.
    """
    # Use organic noise for the envelope itself
    raw = _organic_noise(t, speed, 1.0)
    # Map from [-1, 1] to [min_val, max_val]
    normalized = (raw + 1.0) * 0.5  # 0 to 1
    return min_val + normalized * (max_val - min_val)


class GestureController:
    """
    Manages expressive, natural gestures during speech.
    Coordinates head, body, brow, and eye movements with organic motion
    and smooth transitions for lifelike animation.
    """

    # Punctuation that triggers gestures
    EMPHASIS_PUNCTUATION = ['!', '?', '.']
    PAUSE_PUNCTUATION = [',', ';', ':']

    def __init__(self, vts_connector, config: Optional[GestureConfig] = None):
        """
        Initialize the gesture controller.

        Args:
            vts_connector: VTSConnector instance
            config: GestureConfig instance (uses defaults if None)
        """
        self.vts = vts_connector
        self.config = config or GestureConfig()

        # State
        self._current_emotion = EmotionType.NEUTRAL
        self._is_speaking = False
        self._is_ramping_down = False
        self._speech_start_time: float = 0
        self._speech_stop_time: float = 0
        self._current_text = ""

        # --- Smoothed output values (what actually gets sent to VTS) ---
        # Head
        self._head_x = 0.0
        self._head_y = 0.0
        self._head_z = 0.0
        # Body
        self._body_x = 0.0
        self._body_y = 0.0
        self._body_z = 0.0
        # Brow
        self._brow_left = 0.0
        self._brow_right = 0.0
        # Eye
        self._eye_x = 0.0
        self._eye_y = 0.0

        # --- Emphasis state ---
        self._emphasis_target_y = 0.0   # Target for emphasis nod
        self._emphasis_target_z = 0.0   # Target for emphasis tilt
        self._emphasis_brow = 0.0       # Target brow raise for emphasis
        self._emphasis_current_y = 0.0  # Smoothed emphasis Y
        self._emphasis_current_z = 0.0  # Smoothed emphasis Z
        self._emphasis_brow_current = 0.0

        # --- Emotion base position ---
        self._emotion_target_x = 0.0
        self._emotion_target_y = 0.0
        self._emotion_target_z = 0.0
        self._emotion_current_x = 0.0
        self._emotion_current_y = 0.0
        self._emotion_current_z = 0.0

        # --- Random per-session offsets for variety between speeches ---
        self._phase_offset_x = 0.0
        self._phase_offset_y = 0.0
        self._phase_offset_z = 0.0

        # --- Activity envelope ---
        self._activity_level = 0.0  # 0 = idle, 1 = fully talking

        # --- Stored head history for body follow delay ---
        self._head_history: List[tuple] = []  # (timestamp, x, y, z)
        self._max_history = 30  # frames of history

        # Tasks
        self._gesture_task: Optional[asyncio.Task] = None
        self._update_task: Optional[asyncio.Task] = None

    async def start_speaking(self, text: str = "", emotion: EmotionType = EmotionType.NEUTRAL):
        """
        Start speaking with natural gestures.

        Args:
            text: The text being spoken (for punctuation analysis)
            emotion: Current emotion for base positioning
        """
        self._is_speaking = True
        self._is_ramping_down = False
        self._current_text = text
        self._speech_start_time = asyncio.get_event_loop().time()
        self._current_emotion = emotion

        # Randomize phase offsets so each speech session feels unique
        self._phase_offset_x = random.uniform(0, 100)
        self._phase_offset_y = random.uniform(0, 100)
        self._phase_offset_z = random.uniform(0, 100)

        # Set emotion base position
        emotion_pos = self.config.emotion_positions.get(emotion, {})
        self._emotion_target_x = emotion_pos.get("x", 0)
        self._emotion_target_y = emotion_pos.get("y", 0)
        self._emotion_target_z = emotion_pos.get("z", 0)

        # Start emphasis analyzer
        if self.config.emphasis_enabled and text:
            self._gesture_task = asyncio.create_task(self._emphasis_loop(text))

        print(f"[GestureController] Started speaking with emotion: {emotion.value}")

    async def stop_speaking(self):
        """Stop speaking and smoothly ramp down gestures."""
        self._is_speaking = False
        self._is_ramping_down = True
        self._speech_stop_time = asyncio.get_event_loop().time()

        # Cancel emphasis task
        if self._gesture_task:
            self._gesture_task.cancel()
            self._gesture_task = None

        # Reset emphasis targets (will ease to zero in update loop)
        self._emphasis_target_y = 0.0
        self._emphasis_target_z = 0.0
        self._emphasis_brow = 0.0

        # Reset emotion targets to neutral
        self._emotion_target_x = 0.0
        self._emotion_target_y = 0.0
        self._emotion_target_z = 0.0

        print("[GestureController] Stopped speaking (ramping down)")

    async def update_emotion(self, emotion: EmotionType):
        """Update emotion during speech — smoothly transitions."""
        self._current_emotion = emotion
        emotion_pos = self.config.emotion_positions.get(emotion, {})
        self._emotion_target_x = emotion_pos.get("x", 0)
        self._emotion_target_y = emotion_pos.get("y", 0)
        self._emotion_target_z = emotion_pos.get("z", 0)

    async def trigger_emphasis(self, strength: float = 1.0):
        """
        Trigger a natural emphasis gesture (nod + optional tilt).
        Uses smooth easing instead of instant position jumps.

        Args:
            strength: Gesture strength multiplier (0.0 - 2.0)
        """
        if not self._is_speaking:
            return

        # Add randomized strength variation (±20%)
        jitter = random.uniform(0.8, 1.2)
        actual_strength = strength * jitter

        # Nod target (downward)
        self._emphasis_target_y = -self.config.emphasis_nod_strength * actual_strength

        # Occasional tilt (30% chance)
        if random.random() < 0.3:
            direction = random.choice([-1, 1])
            self._emphasis_target_z = direction * self.config.emphasis_tilt_strength * actual_strength * 0.6

        # Brow raise
        self._emphasis_brow = min(1.0, self.config.brow_emphasis_strength * actual_strength)

        # Schedule spring-back with randomized timing
        delay = random.uniform(0.15, 0.30)
        asyncio.get_event_loop().call_later(delay, self._release_emphasis)

    def _release_emphasis(self):
        """Release emphasis targets back to zero (will ease smoothly)."""
        self._emphasis_target_y = 0.0
        self._emphasis_target_z = 0.0
        # Brow comes back slightly slower
        asyncio.get_event_loop().call_later(0.1, self._release_brow_emphasis)

    def _release_brow_emphasis(self):
        """Release brow emphasis."""
        self._emphasis_brow = 0.0

    async def trigger_tilt(self, direction: str = "random", strength: float = 1.0):
        """Trigger a head tilt gesture with smooth easing."""
        if not self._is_speaking:
            return

        if direction == "random":
            direction = random.choice(["left", "right"])

        jitter = random.uniform(0.8, 1.2)
        tilt_value = self.config.emphasis_tilt_strength * strength * jitter
        if direction == "right":
            tilt_value = -tilt_value

        self._emphasis_target_z = tilt_value

        delay = random.uniform(0.25, 0.45)
        asyncio.get_event_loop().call_later(delay, self._release_tilt)

    def _release_tilt(self):
        """Release tilt emphasis."""
        self._emphasis_target_z = 0.0

    async def _emphasis_loop(self, text: str):
        """Analyze text and trigger emphasis gestures with natural timing."""
        words = text.split()
        word_index = 0

        try:
            while self._is_speaking and word_index < len(words):
                word = words[word_index]

                # Check for emphasis punctuation
                if any(p in word for p in self.EMPHASIS_PUNCTUATION):
                    await self.trigger_emphasis(strength=1.0)
                    # Longer natural pause at sentence breaks
                    await asyncio.sleep(random.uniform(0.25, 0.45))
                elif any(p in word for p in self.PAUSE_PUNCTUATION):
                    await self.trigger_emphasis(strength=0.5)
                    await asyncio.sleep(random.uniform(0.15, 0.30))
                elif word_index % random.randint(4, 7) == 0:
                    # Occasional subtle emphasis (varied interval instead of fixed every 5)
                    await self.trigger_emphasis(strength=random.uniform(0.25, 0.45))

                word_index += 1
                # Natural word timing with variation instead of fixed 0.2s
                await asyncio.sleep(random.uniform(0.15, 0.28))
        except asyncio.CancelledError:
            pass

    def _compute_frame(self, t: float, dt: float):
        """
        Compute all animation channels for one frame.
        This is the core animation engine.

        Args:
            t: Time elapsed since speech start (seconds)
            dt: Delta time since last frame (seconds)
        """
        cfg = self.config

        # --- Activity level (ramp up at start, ramp down at stop) ---
        if self._is_speaking:
            ramp_progress = min(1.0, t / cfg.start_ramp_duration) if cfg.start_ramp_duration > 0 else 1.0
            # Smooth ease-in curve
            target_activity = ramp_progress * ramp_progress * (3.0 - 2.0 * ramp_progress)
        elif self._is_ramping_down:
            time_since_stop = asyncio.get_event_loop().time() - self._speech_stop_time
            ramp_progress = min(1.0, time_since_stop / cfg.stop_ramp_duration) if cfg.stop_ramp_duration > 0 else 1.0
            # Smooth ease-out
            target_activity = 1.0 - (ramp_progress * ramp_progress * (3.0 - 2.0 * ramp_progress))
            if target_activity < 0.01:
                self._is_ramping_down = False
                target_activity = 0.0
        else:
            target_activity = 0.0

        self._activity_level = _ease_toward(self._activity_level, target_activity, 6.0, dt)

        # --- Amplitude envelope (slow variation of intensity) ---
        envelope = _amplitude_envelope(t, cfg.envelope_speed, cfg.envelope_min, cfg.envelope_max)

        # --- Organic drift (slow wandering) ---
        drift_x = _organic_noise(t + self._phase_offset_x, cfg.drift_speed, cfg.drift_amplitude)
        drift_y = _organic_noise(t + self._phase_offset_y, cfg.drift_speed * 0.8, cfg.drift_amplitude * 0.5)
        drift_z = _organic_noise(t + self._phase_offset_z, cfg.drift_speed * 0.6, cfg.drift_amplitude * 0.4)

        # --- Speech rhythm (faster, talk-like bobbing) ---
        # Add per-session speed variation
        rhythm_speed = cfg.rhythm_base_speed * (1.0 + random.uniform(-0.02, 0.02))
        rhythm_y = _organic_noise(t + self._phase_offset_y + 50, rhythm_speed, cfg.rhythm_amplitude)
        rhythm_x = _organic_noise(t + self._phase_offset_x + 50, rhythm_speed * 0.7, cfg.rhythm_amplitude * 0.3)
        rhythm_z = _organic_noise(t + self._phase_offset_z + 50, rhythm_speed * 0.5, cfg.rhythm_amplitude * 0.2)

        # --- Emphasis (smooth eased nod/tilt) ---
        self._emphasis_current_y = _ease_toward(
            self._emphasis_current_y, self._emphasis_target_y,
            cfg.emphasis_easing_speed, dt
        )
        self._emphasis_current_z = _ease_toward(
            self._emphasis_current_z, self._emphasis_target_z,
            cfg.emphasis_easing_speed, dt
        )
        self._emphasis_brow_current = _ease_toward(
            self._emphasis_brow_current, self._emphasis_brow,
            cfg.emphasis_easing_speed * 0.7, dt
        )

        # --- Emotion base position (smooth transition) ---
        self._emotion_current_x = _ease_toward(self._emotion_current_x, self._emotion_target_x, 3.0, dt)
        self._emotion_current_y = _ease_toward(self._emotion_current_y, self._emotion_target_y, 3.0, dt)
        self._emotion_current_z = _ease_toward(self._emotion_current_z, self._emotion_target_z, 3.0, dt)

        # --- Combine all head channels ---
        activity = self._activity_level * envelope

        target_head_x = (
            self._emotion_current_x
            + (drift_x + rhythm_x) * activity
        )
        target_head_y = (
            self._emotion_current_y
            + (drift_y + rhythm_y) * activity
            + self._emphasis_current_y * self._activity_level
        )
        target_head_z = (
            self._emotion_current_z
            + (drift_z + rhythm_z) * activity
            + self._emphasis_current_z * self._activity_level
        )

        # --- Smooth head output ---
        self._head_x = _ease_toward(self._head_x, target_head_x, 1.0 / max(0.01, cfg.transition_speed), dt)
        self._head_y = _ease_toward(self._head_y, target_head_y, 1.0 / max(0.01, cfg.transition_speed), dt)
        self._head_z = _ease_toward(self._head_z, target_head_z, 1.0 / max(0.01, cfg.transition_speed), dt)

        # --- Store head history for body delay ---
        now = asyncio.get_event_loop().time()
        self._head_history.append((now, self._head_x, self._head_y, self._head_z))
        if len(self._head_history) > self._max_history:
            self._head_history.pop(0)

        # --- Body follow (delayed, dampened copy of head) ---
        delayed_time = now - cfg.body_phase_delay
        delayed_x, delayed_y, delayed_z = self._get_delayed_head(delayed_time)

        target_body_x = delayed_x * cfg.body_follow_ratio
        target_body_y = delayed_y * cfg.body_follow_ratio
        target_body_z = delayed_z * cfg.body_follow_ratio

        self._body_x = _ease_toward(self._body_x, target_body_x, 8.0, dt)
        self._body_y = _ease_toward(self._body_y, target_body_y, 8.0, dt)
        self._body_z = _ease_toward(self._body_z, target_body_z, 8.0, dt)

        # --- Brow micro-expressions ---
        # Subtle organic movement + emphasis raise
        brow_base = _organic_noise(t + 200, 0.3, 0.1) * activity
        target_brow = brow_base + self._emphasis_brow_current
        self._brow_left = _ease_toward(self._brow_left, target_brow, 6.0, dt)
        self._brow_right = _ease_toward(self._brow_right, target_brow * 0.9, 5.5, dt)  # Slight asymmetry

        # --- Eye drift ---
        target_eye_x = _organic_noise(t + 300, cfg.eye_drift_speed, cfg.eye_drift_amplitude) * activity
        target_eye_y = _organic_noise(t + 400, cfg.eye_drift_speed * 0.8, cfg.eye_drift_amplitude * 0.7) * activity
        self._eye_x = _ease_toward(self._eye_x, target_eye_x, 5.0, dt)
        self._eye_y = _ease_toward(self._eye_y, target_eye_y, 5.0, dt)

    def _get_delayed_head(self, target_time: float) -> tuple:
        """Get head position from history at a delayed timestamp."""
        if not self._head_history:
            return 0.0, 0.0, 0.0

        # Find closest historical entry
        for i in range(len(self._head_history) - 1, -1, -1):
            t, x, y, z = self._head_history[i]
            if t <= target_time:
                return x, y, z

        # If all history is after target, return oldest
        return self._head_history[0][1], self._head_history[0][2], self._head_history[0][3]

    def get_current_position(self) -> Dict[str, float]:
        """Get current head position (backward compatible)."""
        return {
            "x": self._head_x,
            "y": self._head_y,
            "z": self._head_z,
        }

    def get_all_parameters(self) -> List[Dict]:
        """
        Get all animation parameters for the current frame.
        Returns VTS-format parameter list including head, body, brow, and eye.
        This is used by LipSyncPlayer to merge gesture params with mouth params.
        """
        params = [
            # Head rotation
            {"id": "FaceAngleX", "value": self._head_x, "weight": 1.0},
            {"id": "FaceAngleY", "value": self._head_y, "weight": 1.0},
            {"id": "FaceAngleZ", "value": self._head_z, "weight": 1.0},
            # Body rotation (follows head with delay)
            {"id": "FaceAngleX", "value": self._body_x, "weight": 0.4},  # Body params use same input but lower weight
            {"id": "FaceAngleY", "value": self._body_y, "weight": 0.4},
            {"id": "FaceAngleZ", "value": self._body_z, "weight": 0.4},
        ]

        # Add brow parameters if there's meaningful movement
        if abs(self._brow_left) > 0.01 or abs(self._brow_right) > 0.01:
            params.extend([
                {"id": "Brows", "value": self._brow_left, "weight": 0.5},
            ])

        # Add eye drift if there's meaningful movement
        if abs(self._eye_x) > 0.005 or abs(self._eye_y) > 0.005:
            params.extend([
                {"id": "EyeRightX", "value": self._eye_x, "weight": 0.3},
                {"id": "EyeRightY", "value": self._eye_y, "weight": 0.3},
            ])

        return params

    async def _set_head_position(self, x: float, y: float, z: float):
        """Send head position to VTube Studio (backward compatible)."""
        if not self.vts or not self.vts.is_connected:
            return

        params = self.get_all_parameters()

        try:
            await self.vts.set_parameters(params)
        except Exception as e:
            print(f"[GestureController] Error setting parameters: {e}")

    async def update_loop(self):
        """
        Continuous update loop — call this regularly during speech.
        Computes all animation channels and sends to VTS each frame.
        """
        last_time = asyncio.get_event_loop().time()

        while self._is_speaking or self._is_ramping_down:
            try:
                now = asyncio.get_event_loop().time()
                dt = now - last_time
                last_time = now

                t = now - self._speech_start_time

                # Compute all channels
                self._compute_frame(t, dt)

                # Send to VTS
                await self._set_head_position(self._head_x, self._head_y, self._head_z)

                await asyncio.sleep(0.033)  # ~30fps
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[GestureController] Update loop error: {e}")
                await asyncio.sleep(0.033)


def detect_emotion_from_text(text: str) -> EmotionType:
    """
    Simple emotion detection from text.

    Args:
        text: Text to analyze

    Returns:
        Detected emotion type
    """
    text_lower = text.lower()

    # Happy indicators
    if any(word in text_lower for word in ['happy', 'glad', 'great', 'excellent', 'wonderful', 'terbaik', 'gembira', 'senang']):
        return EmotionType.HAPPY

    # Sad indicators
    if any(word in text_lower for word in ['sad', 'sorry', 'unfortunately', 'sedih', 'maaf']):
        return EmotionType.SAD

    # Excited indicators
    if any(word in text_lower for word in ['excited', 'amazing', 'awesome', 'wow', 'hebat', 'mantap']):
        return EmotionType.EXCITED

    # Surprised indicators
    if any(word in text_lower for word in ['surprised', 'shocked', 'wow', 'oh', 'terkejut']):
        return EmotionType.SURPRISED

    # Thinking indicators
    if any(word in text_lower for word in ['think', 'consider', 'perhaps', 'maybe', 'fikir', 'mungkin']):
        return EmotionType.THINKING

    # Confused indicators
    if any(word in text_lower for word in ['confused', 'unclear', 'what', 'huh', 'keliru']):
        return EmotionType.CONFUSED

    return EmotionType.NEUTRAL


# Global instance
_gesture_controller: Optional[GestureController] = None


def get_gesture_controller(vts_connector=None) -> GestureController:
    """Get or create the global gesture controller instance."""
    global _gesture_controller
    if _gesture_controller is None and vts_connector is not None:
        _gesture_controller = GestureController(vts_connector)
    return _gesture_controller
