"""
Idle Animator for VTube Studio
Handles background idle animations to make the avatar feel alive when not talking.
Includes subtle breathing, occasional head movements, and blinking.
"""

import asyncio
import random
import math
from typing import Optional, Dict
from dataclasses import dataclass


@dataclass
class IdleConfig:
    """Configuration for idle animations."""
    # Breathing settings
    breathing_enabled: bool = True
    breathing_speed: float = 0.3  # Cycles per second
    breathing_amplitude: float = 3.0  # Degrees for FaceAngleY
    
    # Random movement settings
    random_movement_enabled: bool = True
    random_movement_interval: float = 2.0  # Seconds between movements
    random_movement_range: float = 5.0  # Degrees
    
    # Micro-movements (constant subtle motion)
    micro_movement_enabled: bool = True
    micro_movement_amplitude: float = 1.0  # Degrees
    micro_movement_speed: float = 0.5  # Hz
    
    # Blink settings
    blinking_enabled: bool = True
    blink_interval_min: float = 3.0  # Minimum seconds between blinks
    blink_interval_max: float = 7.0  # Maximum seconds between blinks
    blink_duration: float = 0.15  # Seconds


class IdleAnimator:
    """
    Manages idle animations for the avatar when not talking.
    Creates natural-looking subtle movements to keep the avatar feeling alive.
    """
    
    def __init__(self, vts_connector, config: Optional[IdleConfig] = None):
        """
        Initialize the idle animator.
        
        Args:
            vts_connector: VTSConnector instance for sending parameter updates
            config: IdleConfig instance (uses defaults if None)
        """
        self.vts = vts_connector
        self.config = config or IdleConfig()
        
        # Animation state
        self._running = False
        self._paused = False  # When True, stops sending parameters to VTS
        self._tasks: list[asyncio.Task] = []
        self._start_time: float = 0
        
        # Current target values for smooth transitions
        self._target_x = 0.0
        self._target_y = 0.0
        self._target_z = 0.0
        
        # Current actual values
        self._current_x = 0.0
        self._current_y = 0.0
        self._current_z = 0.0
        
        # Blink state
        self._is_blinking = False
        
    async def start(self):
        """Start all idle animation tasks."""
        if self._running:
            return
            
        self._running = True
        self._start_time = asyncio.get_event_loop().time()
        
        # Start animation tasks
        if self.config.breathing_enabled:
            self._tasks.append(asyncio.create_task(self._breathing_loop()))
            
        if self.config.random_movement_enabled:
            self._tasks.append(asyncio.create_task(self._random_movement_loop()))
            
        if self.config.micro_movement_enabled:
            self._tasks.append(asyncio.create_task(self._micro_movement_loop()))
            
        if self.config.blinking_enabled:
            self._tasks.append(asyncio.create_task(self._blink_loop()))
            
        # Start the main update loop
        self._tasks.append(asyncio.create_task(self._update_loop()))
        
        print("[IdleAnimator] Started idle animations")
        
    async def stop(self):
        """Stop all idle animation tasks."""
        self._running = False
        
        # Cancel all tasks
        for task in self._tasks:
            task.cancel()
            
        self._tasks.clear()
        
        # Reset to neutral position
        await self._set_head_position(0, 0, 0)
        
        print("[IdleAnimator] Stopped idle animations")
        
    async def _breathing_loop(self):
        """Generate subtle breathing motion (nods)."""
        while self._running:
            try:
                elapsed = asyncio.get_event_loop().time() - self._start_time
                
                # Sine wave for breathing - gentle nodding
                breath_value = math.sin(elapsed * self.config.breathing_speed * 2 * math.pi)
                
                # Add to target Y (up/down)
                self._target_y = breath_value * self.config.breathing_amplitude
                
                await asyncio.sleep(0.05)  # 20fps update
            except asyncio.CancelledError:
                break
                
    async def _random_movement_loop(self):
        """Generate occasional random head movements."""
        while self._running:
            try:
                # Wait random interval
                wait_time = random.uniform(
                    self.config.random_movement_interval * 0.5,
                    self.config.random_movement_interval * 1.5
                )
                await asyncio.sleep(wait_time)
                
                if not self._running:
                    break
                    
                # Generate random target position
                self._target_x = random.uniform(-self.config.random_movement_range, 
                                                self.config.random_movement_range)
                self._target_z = random.uniform(-self.config.random_movement_range * 0.5,
                                                self.config.random_movement_range * 0.5)
                
            except asyncio.CancelledError:
                break
                
    async def _micro_movement_loop(self):
        """Generate constant subtle micro-movements."""
        while self._running:
            try:
                elapsed = asyncio.get_event_loop().time() - self._start_time
                
                # Multiple sine waves at different frequencies for organic motion
                micro_x = math.sin(elapsed * self.config.micro_movement_speed * 2 * math.pi) * 0.5
                micro_x += math.sin(elapsed * self.config.micro_movement_speed * 1.3 * 2 * math.pi) * 0.3
                
                micro_z = math.cos(elapsed * self.config.micro_movement_speed * 0.7 * 2 * math.pi) * 0.4
                
                # Add micro-movements to targets
                self._target_x += micro_x * self.config.micro_movement_amplitude
                self._target_z += micro_z * self.config.micro_movement_amplitude
                
                await asyncio.sleep(0.05)
            except asyncio.CancelledError:
                break
                
    async def _blink_loop(self):
        """Handle random blinking."""
        while self._running:
            try:
                # Wait random interval
                wait_time = random.uniform(self.config.blink_interval_min, 
                                          self.config.blink_interval_max)
                await asyncio.sleep(wait_time)
                
                if not self._running:
                    break
                    
                # Trigger blink
                self._is_blinking = True
                await asyncio.sleep(self.config.blink_duration)
                self._is_blinking = False
                
            except asyncio.CancelledError:
                break
                
    async def _update_loop(self):
        """Main update loop - smoothly interpolate and send to VTS."""
        smoothing = 0.1  # Lower = smoother but slower
        
        while self._running:
            try:
                # When paused (avatar is speaking), skip sending parameters
                # so we don't conflict with the gesture controller
                if self._paused:
                    await asyncio.sleep(0.1)  # Check less frequently while paused
                    continue
                
                # Smoothly interpolate current values toward targets
                self._current_x += (self._target_x - self._current_x) * smoothing
                self._current_y += (self._target_y - self._current_y) * smoothing
                self._current_z += (self._target_z - self._current_z) * smoothing
                
                # Apply blink (close eyes briefly)
                eye_open = 0.0 if self._is_blinking else 1.0
                
                # Send to VTS
                await self._set_head_position(
                    self._current_x,
                    self._current_y,
                    self._current_z,
                    eye_open
                )
                
                await asyncio.sleep(0.033)  # ~30fps
            except asyncio.CancelledError:
                break
                
    async def _set_head_position(self, x: float, y: float, z: float, eye_open: float = 1.0):
        """
        Send head position to VTube Studio.
        
        Args:
            x: FaceAngleX (left/right)
            y: FaceAngleY (up/down)
            z: FaceAngleZ (lean/tilt)
            eye_open: Eye open value (1.0 = open, 0.0 = closed)
        """
        if not self.vts or not self.vts.is_connected:
            return
            
        parameters = [
            {"id": "FaceAngleX", "value": x, "weight": 1.0},
            {"id": "FaceAngleY", "value": y, "weight": 1.0},
            {"id": "FaceAngleZ", "value": z, "weight": 1.0},
            {"id": "EyeOpenLeft", "value": eye_open, "weight": 1.0},
            {"id": "EyeOpenRight", "value": eye_open, "weight": 1.0},
        ]
        
        try:
            await self.vts.set_parameters(parameters)
        except Exception as e:
            print(f"[IdleAnimator] Error setting parameters: {e}")
            
    def pause(self):
        """Pause idle animations (e.g., when starting to talk).
        Completely stops sending parameters to VTS so the gesture
        controller has full control during speech."""
        self._paused = True
        self._target_x = 0.0
        self._target_y = 0.0
        self._target_z = 0.0
        print("[IdleAnimator] Paused - gesture controller takes over")
        
    def resume(self):
        """Resume idle animations (e.g., when done talking)."""
        self._paused = False
        print("[IdleAnimator] Resumed - idle animations active")


# Global instance
_idle_animator: Optional[IdleAnimator] = None


def get_idle_animator(vts_connector=None) -> IdleAnimator:
    """Get or create the global idle animator instance."""
    global _idle_animator
    if _idle_animator is None and vts_connector is not None:
        _idle_animator = IdleAnimator(vts_connector)
    return _idle_animator
