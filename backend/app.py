import sys
import os
YOLOV5_PATH = r"N:\Project\Traffic Management\yolov5"
if YOLOV5_PATH not in sys.path:
    sys.path.insert(0, YOLOV5_PATH)
from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import torch
import numpy as np
import base64
import json
from io import BytesIO
from PIL import Image
import threading
import time
from collections import defaultdict
from scipy.spatial import distance
from utils.augmentations import letterbox
from utils.general import non_max_suppression, scale_boxes, check_img_size

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Global variables for detection
model = None
model_general = None   # COCO/traffic vehicles (car/truck/bus/bike) -> tracker pipeline
model_emergency = None # Custom ambulance-only model -> emergency logic + red bbox only
detection_thread = None
is_detecting = False
is_paused = False  # If true, detection loop will pause processing frames
emergency_score_state = 0 # Persistent score for temporal emergency detection
current_camera_id = "default"
minute_vehicle_counts = {}  # Store vehicle counts per minute: {"HH:MM": count}
current_weather = {
    'condition': 'Unknown',
    'visibility': 'Good',
    'time_of_day': 'Day',
    'confidence': 0.0,
    'last_updated': None
}
current_stats = {
    'cars': 0,
    'trucks': 0,
    'buses': 0,
    'bikes': 0,
    'total': 0,
    'confidence': 0.0,
    'recent_detections': [],
    'vehicle_count': 0,  # Total vehicles detected (unique track IDs)
    'counts_by_type': {
        'cars': 0,
        'trucks': 0,
        'buses': 0,
        'bikes': 0
    },
    'speed_stats': {
        'average_speed': 0.0,
        'max_speed': 0.0,
        'min_speed': 0.0,
        'speeding_count': 0,
        'speed_by_type': {'cars': 0.0, 'trucks': 0.0, 'buses': 0.0, 'bikes': 0.0}
    }
}

# -----------------------------------------------------------------------------------------
# ALERT SYSTEM - CENTRAL REGISTRY
# -----------------------------------------------------------------------------------------
active_alerts = {}  # {alert_id: alert_obj}

def create_alert(id, title, message, priority, impact, action, status="ACTIVE"):
    """Create a standardized alert object"""
    return {
        "id": id,
        "title": title,
        "message": message,
        "priority": priority,  # HIGH | MEDIUM | LOW
        "impact": impact,
        "action": action,
        "status": status,      # ACTIVE | RESOLVED
        "timestamp": time.time(),
        "formatted_time": time.strftime("%H:%M")
    }

def update_alerts():
    """Check conditions and update active alerts registry"""
    global active_alerts, emergency_state, signal_controller, traffic_data
    
    # -------------------------------------------------------------------------
    # 1. EMERGENCY ALERT (HIGH PRIORITY)
    # -------------------------------------------------------------------------
    if emergency_state['active']:
        # Create alert if not exists
        if "EMERGENCY" not in active_alerts:
            active_alerts["EMERGENCY"] = create_alert(
                id="EMERGENCY",
                title="Emergency Vehicle Detected",
                message="Emergency vehicle approaching intersection. Priority corridor activated.",
                priority="HIGH",
                impact="Delay avoided: 6–10 minutes",
                action="Corridor active. Cross-traffic restricted."
            )
        else:
            # Update status if it was resolved
            if active_alerts["EMERGENCY"]["status"] == "RESOLVED":
                 active_alerts["EMERGENCY"]["status"] = "ACTIVE"
                 active_alerts["EMERGENCY"]["timestamp"] = time.time()
                 active_alerts["EMERGENCY"]["formatted_time"] = time.strftime("%H:%M")

    else:
        # Resolve alert if condition cleared
        if "EMERGENCY" in active_alerts and active_alerts["EMERGENCY"]["status"] == "ACTIVE":
            active_alerts["EMERGENCY"]["status"] = "RESOLVED"
            active_alerts["EMERGENCY"]["message"] = "Emergency vehicle cleared."
            active_alerts["EMERGENCY"]["action"] = "Normal traffic flow resuming."

    # -------------------------------------------------------------------------
    # 2. ADAPTIVE SIGNAL ALERT (MEDIUM PRIORITY)
    # -------------------------------------------------------------------------
    # Check if signal controller has new significant updates
    # Use signal_controller.last_congestion for checking
    if signal_controller.last_congestion in ['MODERATE', 'SEVERE']:
        alert_id = "SIGNAL_OPTIMIZATION"
        
        if alert_id not in active_alerts:
             active_alerts[alert_id] = create_alert(
                id=alert_id,
                title="Adaptive Signal Optimization",
                message=f"Signal timing adjusted for {signal_controller.last_congestion.lower()} traffic flow.",
                priority="MEDIUM",
                impact="Queue length reduced by 15–20%",
                action="Auto-adjusting green light duration."
            )
        elif active_alerts[alert_id]["status"] == "RESOLVED":
            # Reactivate if it comes back
             active_alerts[alert_id]["status"] = "ACTIVE"
             active_alerts[alert_id]["message"] = f"Signal timing adjusted for {signal_controller.last_congestion.lower()} traffic flow."
             active_alerts[alert_id]["timestamp"] = time.time()
             active_alerts[alert_id]["formatted_time"] = time.strftime("%H:%M")
             
    else:
        # Resolve signal alert if congestion returns to NORMAL
        if "SIGNAL_OPTIMIZATION" in active_alerts and active_alerts["SIGNAL_OPTIMIZATION"]["status"] == "ACTIVE":
             active_alerts["SIGNAL_OPTIMIZATION"]["status"] = "RESOLVED"

    # -------------------------------------------------------------------------
    # 3. CONGESTION ALERT (MEDIUM PRIORITY)
    # -------------------------------------------------------------------------
    if traffic_data.congestion_level == "SEVERE":
        if "CONGESTION" not in active_alerts:
            active_alerts["CONGESTION"] = create_alert(
                id="CONGESTION",
                title="Heavy Traffic Flows",
                message="Significant vehicle buildup detected in monitored zone.",
                priority="MEDIUM",
                impact="Estimated delay: 8–12 minutes",
                action="Monitoring Active. Signal optimized."
            )
        elif active_alerts["CONGESTION"]["status"] == "RESOLVED":
             active_alerts["CONGESTION"]["status"] = "ACTIVE"
             active_alerts["CONGESTION"]["timestamp"] = time.time()
             active_alerts["CONGESTION"]["formatted_time"] = time.strftime("%H:%M")
             
    elif traffic_data.congestion_level == "NORMAL":
        if "CONGESTION" in active_alerts and active_alerts["CONGESTION"]["status"] == "ACTIVE":
            active_alerts["CONGESTION"]["status"] = "RESOLVED"

# Traffic Management Data Structure
class TrafficData:
    """Structured traffic data for management system"""
    def __init__(self):
        self.timestamp = ''
        self.intersection_id = 'main-intersection'
        self.vehicle_count = 0
        self.average_speed = 0.0
        self.traffic_density = 'LOW'  # LOW, MEDIUM, HIGH
        self.queue_length = 0
        self.congestion_level = 'NORMAL'  # NORMAL, MODERATE, SEVERE
        self.last_updated = None

    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            'timestamp': self.timestamp,
            'intersection_id': self.intersection_id,
            'vehicle_count': self.vehicle_count,
            'average_speed': self.average_speed,
            'traffic_density': self.traffic_density,
            'queue_length': self.queue_length,
            'congestion_level': self.congestion_level,
            'last_updated': self.last_updated
        }

    def update_from_stats(self, stats):
        """Update traffic data from current detection stats"""
        from datetime import datetime, timezone

        self.timestamp = datetime.now(timezone.utc).isoformat()
        self.vehicle_count = stats.get('total', 0)
        self.average_speed = stats.get('speed_stats', {}).get('average_speed', 0.0)
        self.traffic_density = self.classify_density(self.vehicle_count)
        self.congestion_level = self.classify_congestion(self.vehicle_count, self.average_speed)
        # Estimate queue length based on vehicle count (simplified)
        self.queue_length = max(0, self.vehicle_count - 10)
        self.last_updated = datetime.now(timezone.utc).isoformat()

    @staticmethod
    def classify_density(vehicle_count):
        """Classify traffic density based on vehicle count"""
        if vehicle_count < 15:
            return 'LOW'
        elif vehicle_count <= 35:
            return 'MEDIUM'
        else:
            return 'HIGH'

    @staticmethod
    def classify_congestion(vehicle_count, average_speed):
        """Classify congestion level based on vehicle count and speed"""
        if vehicle_count > 40 or average_speed < 5:
            return 'SEVERE'
        elif vehicle_count > 25 or average_speed < 15:
            return 'MODERATE'
        else:
            return 'NORMAL'

# Initialize traffic data instance
traffic_data = TrafficData()

# Static road type configuration (set once per camera/road)
current_road_type = {
    'type': 'HIGHWAY',  # Default: HIGHWAY, ARTERIAL, LOCAL
    'configured': False,  # Whether road type has been explicitly configured
    'last_updated': None
}

# Road configuration for emergency vehicle priority (STATIC - must not change at runtime)
road_config = {
    'road_mode': 'FOUR_WAY',  # ONE_WAY, TWO_WAY, FOUR_WAY
    'allowed_directions': ['NORTH', 'SOUTH', 'EAST', 'WEST'],  # Directions allowed for this road
    'configured': False,
    'last_updated': None
}

# Emergency vehicle state management
emergency_state = {
    'active': False,
    'ambulance_detected': False,
    'priority_direction': None,
    'ambulance_bbox': None,
    'last_detection_time': None,
    'emergency_start_time': None,
    'timeout_seconds': 30  # Emergency clears after 30 seconds if no ambulance detected
}

# -----------------------------------------------------------------------------------------
# Lane ROI + Adaptive Timing Support
# -----------------------------------------------------------------------------------------
# Default normalized ROIs (0..1) for each lane. Used as fallback.
DEFAULT_LANE_ROIS_NORM = {
    "NORTH": [(0.40, 0.10), (0.60, 0.10), (0.58, 0.40), (0.42, 0.40)],
    "SOUTH": [(0.40, 0.60), (0.60, 0.60), (0.62, 0.92), (0.38, 0.92)],
    "WEST":  [(0.10, 0.40), (0.40, 0.42), (0.40, 0.58), (0.10, 0.60)],
    "EAST":  [(0.60, 0.42), (0.92, 0.40), (0.92, 0.60), (0.60, 0.58)]
}

LANE_CAPACITY = {
    "NORTH": 20,
    "SOUTH": 20,
    "EAST": 20,
    "WEST": 20
}

ROI_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "roi_config.json")
ROI_LANES = ["NORTH", "SOUTH", "EAST", "WEST"]

def _is_valid_polygon(poly):
    if not isinstance(poly, list) or len(poly) < 4:
        return False
    for pt in poly:
        if not isinstance(pt, (list, tuple)) or len(pt) != 2:
            return False
        x, y = pt
        if not (0.0 <= float(x) <= 1.0 and 0.0 <= float(y) <= 1.0):
            return False
    return True

def validate_rois_norm(rois_norm):
    if not isinstance(rois_norm, dict):
        return False, "ROI config must be a dict"
    for lane in ROI_LANES:
        if lane not in rois_norm:
            return False, f"Missing ROI lane: {lane}"
        if not _is_valid_polygon(rois_norm[lane]):
            return False, f"Invalid polygon for lane: {lane}"
    return True, "ok"

def get_lane_rois_norm(camera_id):
    """Load per-camera ROI config; fallback to default if missing or invalid."""
    try:
        if os.path.exists(ROI_CONFIG_PATH):
            with open(ROI_CONFIG_PATH, "r") as f:
                data = json.load(f)
            rois_norm = data.get(camera_id)
            if rois_norm:
                ok, msg = validate_rois_norm(rois_norm)
                if ok:
                    return rois_norm
                print(f"[ROI] Invalid config for {camera_id}: {msg}. Falling back to default.")
            else:
                print(f"[ROI] No config for {camera_id}. Falling back to default.")
    except Exception as e:
        print(f"[ROI] Failed to load ROI config: {e}. Falling back to default.")
    return DEFAULT_LANE_ROIS_NORM

def _denorm_roi(norm_poly, frame_shape):
    h, w = frame_shape[:2]
    return [(int(x * w), int(y * h)) for x, y in norm_poly]

def _point_in_poly(point, poly):
    # Ray casting algorithm
    x, y = point
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / ((y2 - y1) or 1) + x1):
            inside = not inside
    return inside

def assign_lane_for_point(point, frame_shape, rois_norm):
    # Priority order avoids double-counting overlap corners
    for lane in ["NORTH", "SOUTH", "WEST", "EAST"]:
        poly = _denorm_roi(rois_norm[lane], frame_shape)
        if _point_in_poly(point, poly):
            return lane
    return None

def compute_lane_metrics(tracks, frame_shape, lane_capacity, max_speed):
    # tracks: list of track_info dicts with last_position + speed
    count = len(tracks)
    if count == 0:
        return {"count": 0, "density": 0.0, "avg_speed": 0.0, "load": 0.0}

    capacity = max(1, int(lane_capacity))
    density = min(1.0, count / float(capacity))

    speeds = [t.get("speed", 0.0) for t in tracks if t.get("speed", 0.0) > 0]
    avg_speed = float(np.mean(speeds)) if speeds else 0.0
    speed_norm = 0.0 if max_speed <= 0 else min(1.0, avg_speed / float(max_speed))

    load = (count * 0.5) + (density * 30.0) + ((1.0 - speed_norm) * 20.0)
    return {"count": count, "density": density, "avg_speed": avg_speed, "load": load}

def compute_all_lane_loads(tracked, frame_shape, max_speed, rois_norm):
    lanes = {"NORTH": [], "SOUTH": [], "EAST": [], "WEST": []}
    for track in tracked.values():
        point = track.get("last_position")
        if point is None:
            continue
        lane = assign_lane_for_point(point, frame_shape, rois_norm)
        if lane:
            lanes[lane].append(track)

    lane_metrics = {}
    for lane in lanes:
        lane_metrics[lane] = compute_lane_metrics(
            lanes[lane],
            frame_shape,
            lane_capacity=LANE_CAPACITY.get(lane, 20),
            max_speed=max_speed
        )
    return lane_metrics

def draw_lane_rois(frame, rois_norm):
    for lane, norm_poly in rois_norm.items():
        poly = np.array(_denorm_roi(norm_poly, frame.shape), dtype=np.int32)
        cv2.polylines(frame, [poly], isClosed=True, color=(0, 255, 255), thickness=2)
        label_point = tuple(poly[0])
        cv2.putText(frame, lane, (label_point[0] + 5, label_point[1] - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

class DirectionalPhaseController:
    """Directional 4-way phase controller with locked phase timings."""
    PHASE_SEQUENCE = ["NS_GREEN", "NS_YELLOW", "EW_GREEN", "EW_YELLOW"]

    def __init__(self):
        self.phase = "NS_GREEN"
        self.last_congestion = "NORMAL"
        self.alerts = []
        self.min_green = 15
        self.yellow_time = 5
        self.phase_start_time = time.time()
        self.phase_end_time = self.phase_start_time
        self.current_phase_duration = 0
        self.ns_green_duration = self.min_green
        self.ew_green_duration = self.min_green
        self.lane_loads = {"NORTH": 0.0, "SOUTH": 0.0, "EAST": 0.0, "WEST": 0.0}
        self.phase_loads = {"NS": 0.0, "EW": 0.0}
        self.pause_started_at = None
        self.is_paused = False
        self._enter_phase(self.phase, self.phase_start_time)

    def green_time_from_load(self, load):
        if load < 20:
            return 15
        if load < 40:
            return 30
        if load < 70:
            return 45
        return 60

    def update_lane_loads(self, lane_loads):
        self.lane_loads = {
            "NORTH": float(lane_loads.get("NORTH", 0.0)),
            "SOUTH": float(lane_loads.get("SOUTH", 0.0)),
            "EAST": float(lane_loads.get("EAST", 0.0)),
            "WEST": float(lane_loads.get("WEST", 0.0))
        }
        self.phase_loads["NS"] = self.lane_loads["NORTH"] + self.lane_loads["SOUTH"]
        self.phase_loads["EW"] = self.lane_loads["EAST"] + self.lane_loads["WEST"]

    def _green_duration_for_phase_load(self, phase_key):
        load = self.phase_loads.get(phase_key, 0.0)
        return max(self.min_green, int(self.green_time_from_load(load)))

    def _enter_phase(self, phase, now_ts):
        if phase == "NS_GREEN":
            self.current_phase_duration = self._green_duration_for_phase_load("NS")
            self.ns_green_duration = self.current_phase_duration
        elif phase == "EW_GREEN":
            self.current_phase_duration = self._green_duration_for_phase_load("EW")
            self.ew_green_duration = self.current_phase_duration
        else:
            self.current_phase_duration = self.yellow_time

        self.phase = phase
        self.phase_start_time = now_ts
        self.phase_end_time = now_ts + self.current_phase_duration

    def update_congestion(self, congestion_level):
        """Update signal timing for the NEXT green phase only."""
        if congestion_level != self.last_congestion:
            alert_msg = f"{congestion_level.capitalize()} congestion detected. Signal timing adjusted."
            self.alerts.append({
                "message": alert_msg,
                "timestamp": time.strftime("%H:%M:%S"),
                "congestion": congestion_level
            })
            if len(self.alerts) > 5:
                self.alerts = self.alerts[-5:]
            self.last_congestion = congestion_level

    def set_paused(self, paused, now_ts=None):
        now_ts = now_ts or time.time()
        if paused and not self.is_paused:
            self.is_paused = True
            self.pause_started_at = now_ts
        elif not paused and self.is_paused:
            # Shift phase timing forward by the pause duration so remaining time is preserved
            pause_delta = now_ts - (self.pause_started_at or now_ts)
            self.phase_start_time += pause_delta
            self.phase_end_time += pause_delta
            self.pause_started_at = None
            self.is_paused = False

    def _effective_now(self, now_ts=None):
        now_ts = now_ts or time.time()
        if self.is_paused and self.pause_started_at is not None:
            return self.pause_started_at
        return now_ts

    def advance_phase(self, now_ts=None):
        """Advance to next phase in cycle - LOCKED during emergency or pause."""
        global emergency_state

        if emergency_state["active"] or self.is_paused:
            return

        now_ts = now_ts or time.time()
        while now_ts >= self.phase_end_time:
            idx = self.PHASE_SEQUENCE.index(self.phase)
            next_phase = self.PHASE_SEQUENCE[(idx + 1) % len(self.PHASE_SEQUENCE)]

            # Skip green phases with zero load, but avoid infinite skip if both are zero
            ns_load = self.phase_loads.get("NS", 0.0)
            ew_load = self.phase_loads.get("EW", 0.0)
            if next_phase == "NS_GREEN" and ns_load <= 0 and ew_load > 0:
                next_phase = "EW_GREEN"
            elif next_phase == "EW_GREEN" and ew_load <= 0 and ns_load > 0:
                next_phase = "NS_GREEN"

            # If we jumped green, also ensure we don't enter the opposite yellow without a green
            if next_phase == "NS_YELLOW" and ns_load <= 0 and ew_load > 0:
                next_phase = "EW_GREEN"
            if next_phase == "EW_YELLOW" and ew_load <= 0 and ns_load > 0:
                next_phase = "NS_GREEN"

            self._enter_phase(next_phase, self.phase_end_time)

    def _signal_states_for_phase(self, phase):
        if phase == "NS_GREEN":
            return {"NORTH": "GREEN", "SOUTH": "GREEN", "EAST": "RED", "WEST": "RED"}
        if phase == "NS_YELLOW":
            return {"NORTH": "YELLOW", "SOUTH": "YELLOW", "EAST": "RED", "WEST": "RED"}
        if phase == "EW_GREEN":
            return {"NORTH": "RED", "SOUTH": "RED", "EAST": "GREEN", "WEST": "GREEN"}
        if phase == "EW_YELLOW":
            return {"NORTH": "RED", "SOUTH": "RED", "EAST": "YELLOW", "WEST": "YELLOW"}
        return {"NORTH": "RED", "SOUTH": "RED", "EAST": "RED", "WEST": "RED"}

    def _remaining_for_red_axis(self, active_phase, remaining_active):
        if active_phase in ("NS_GREEN", "EW_GREEN"):
            return int(remaining_active + self.yellow_time)
        return int(remaining_active)

    def get_status(self):
        """Get current directional signal status with per-direction timers."""
        now_ts = self._effective_now()
        remaining_active = max(0, self.phase_end_time - now_ts)
        signal_states = self._signal_states_for_phase(self.phase)

        if self.phase in ("NS_GREEN", "NS_YELLOW"):
            ns_remaining = int(remaining_active)
            ew_remaining = self._remaining_for_red_axis(self.phase, remaining_active)
        else:
            ew_remaining = int(remaining_active)
            ns_remaining = self._remaining_for_red_axis(self.phase, remaining_active)

        signals = {
            "NORTH": {"state": signal_states["NORTH"], "remaining": ns_remaining},
            "SOUTH": {"state": signal_states["SOUTH"], "remaining": ns_remaining},
            "EAST": {"state": signal_states["EAST"], "remaining": ew_remaining},
            "WEST": {"state": signal_states["WEST"], "remaining": ew_remaining}
        }

        cycle_time = int(self.ns_green_duration + self.yellow_time + self.ew_green_duration + self.yellow_time)
        return {
            "phase": self.phase,
            "active_phase": self.phase,
            "signals": signals,
            "lane_loads": {
                "north": round(self.lane_loads["NORTH"], 2),
                "south": round(self.lane_loads["SOUTH"], 2),
                "east": round(self.lane_loads["EAST"], 2),
                "west": round(self.lane_loads["WEST"], 2)
            },
            "cycle_time": cycle_time,
            "timestamp": int(time.time()),
            "remaining_time": int(remaining_active)
        }

    def get_emergency_override(self):
        """Return override signal states during emergency."""
        global emergency_state
        if not emergency_state["active"]:
            return None

        priority_direction = emergency_state.get("priority_direction")
        directions = ["NORTH", "SOUTH", "EAST", "WEST"]
        signals = {}

        now_ts = time.time()
        start_time = emergency_state.get("emergency_start_time") or now_ts
        remaining = max(0, int(emergency_state["timeout_seconds"] - (now_ts - start_time)))

        for direction in directions:
            signals[direction] = {
                "state": "GREEN" if direction == priority_direction else "RED",
                "remaining": remaining
            }

        cycle_time = int(self.ns_green_duration + self.yellow_time + self.ew_green_duration + self.yellow_time)
        return {
            "phase": self.phase,
            "active_phase": self.phase,
            "signals": signals,
            "lane_loads": {
                "north": round(self.lane_loads["NORTH"], 2),
                "south": round(self.lane_loads["SOUTH"], 2),
                "east": round(self.lane_loads["EAST"], 2),
                "west": round(self.lane_loads["WEST"], 2)
            },
            "cycle_time": cycle_time,
            "timestamp": int(time.time()),
            "remaining_time": int(remaining)
        }

    def get_decisions(self):
        """Get recent signal decisions/alerts"""
        return self.alerts.copy()

# Initialize signal controller
signal_controller = DirectionalPhaseController()
video_cap = None
stats_lock = threading.Lock()
current_frame_with_detections = None  # Store the latest frame with detections drawn
frame_lock = threading.Lock()  # Lock for frame access
seek_lock = threading.Lock()  # Lock to make seek operations atomic


# Vehicle tracking
tracked_vehicles = {}  # {track_id: {'last_position': (x, y), 'type': str, 'last_seen': time, 'speed': float, 'position_history': [(x, y, time)], 'speed_history': [speed]}}
next_track_id = 0
max_disappeared = 30  # Frames before removing a track
max_distance = 100  # Max distance for centroid matching
counted_track_ids = set()  # Track IDs already counted for global analytics
EXIT_COUNT_THRESHOLD_SEC = 2.5

# Auto-calibration disabled (removed)


# Speed estimation parameters
pixel_to_meter_ratio = 0.05  # Default: 1 pixel = 0.05 meters (can be calibrated)
fps = 30  # Frames per second
speed_limit_kmh = 60  # Default speed limit in km/h

def get_centroid(bbox):
    """Calculate centroid of bounding box"""
    x1, y1, x2, y2 = bbox
    return ((x1 + x2) // 2, (y1 + y2) // 2)

def calculate_speed_pixels_per_second(prev_pos, curr_pos, time_elapsed):
    """Calculate speed in pixels per second"""
    if time_elapsed <= 0:
        return 0.0
    
    pixel_distance = np.sqrt((curr_pos[0] - prev_pos[0])**2 + (curr_pos[1] - prev_pos[1])**2)
    return pixel_distance / time_elapsed

def pixels_to_meters_per_second(pixels_per_second):
    """Convert pixels per second to meters per second"""
    return pixels_per_second * pixel_to_meter_ratio

def meters_per_second_to_kmh(mps):
    """Convert meters per second to km/h"""
    return mps * 3.6

def calculate_vehicle_speed(track_id, current_position, current_time):
    """Calculate vehicle speed from tracking history"""
    global tracked_vehicles
    
    if track_id not in tracked_vehicles:
        return 0.0
    
    track = tracked_vehicles[track_id]
    
    # Initialize position history if not exists
    if 'position_history' not in track:
        track['position_history'] = []
    
    # Add current position to history
    track['position_history'].append((current_position[0], current_position[1], current_time))
    
    # Keep only last 10 positions (for smoothing)
    if len(track['position_history']) > 10:
        track['position_history'] = track['position_history'][-10:]
    
    # Need at least 2 positions to calculate speed
    if len(track['position_history']) < 2:
        return 0.0
    
    # Calculate speed using last 2-3 positions for better accuracy
    positions = track['position_history']
    
    # Use last 2 positions for immediate speed
    prev_pos = positions[-2]
    curr_pos = positions[-1]
    
    time_elapsed = curr_pos[2] - prev_pos[2]
    
    if time_elapsed <= 0:
        return 0.0
    
    # Calculate pixel distance
    pixel_speed = calculate_speed_pixels_per_second(
        (prev_pos[0], prev_pos[1]),
        (curr_pos[0], curr_pos[1]),
        time_elapsed
    )
    
    # Convert to real-world speed
    mps = pixels_to_meters_per_second(pixel_speed)
    kmh = meters_per_second_to_kmh(mps)
    
    # Store speed history for smoothing
    if 'speed_history' not in track:
        track['speed_history'] = []
    
    track['speed_history'].append(kmh)
    if len(track['speed_history']) > 5:
        track['speed_history'] = track['speed_history'][-5:]
    
    # Return average speed (smoothed)
    if len(track['speed_history']) > 1:
        avg_speed = np.mean(track['speed_history'])
        track['speed'] = avg_speed
        return avg_speed
    
    track['speed'] = kmh
    return kmh

def register_exited_vehicle(track_id, vehicle_type):
    """Exit-based global vehicle analytics (count once on exit)."""
    if track_id in counted_track_ids:
        return
    counted_track_ids.add(track_id)
    type_mapping = {'car': 'cars', 'truck': 'trucks', 'bus': 'buses', 'bike': 'bikes'}
    plural_type = type_mapping.get(vehicle_type, 'cars')
    with stats_lock:
        current_stats['vehicle_count'] += 1
        current_stats['counts_by_type'][plural_type] = \
            current_stats['counts_by_type'].get(plural_type, 0) + 1

        # Update minute-level vehicle counts
        current_minute = time.strftime('%H:%M')
        if current_minute not in minute_vehicle_counts:
            minute_vehicle_counts[current_minute] = 0
        minute_vehicle_counts[current_minute] += 1

        # Keep only last 24 hours (1440 minutes) of data
        if len(minute_vehicle_counts) > 1440:
            sorted_keys = sorted(minute_vehicle_counts.keys())
            for old_key in sorted_keys[:-1440]:
                del minute_vehicle_counts[old_key]

def update_tracker(detections, frame_shape, timestamp_s=None):
    """Update vehicle tracker and maintain per-track state

    timestamp_s: seconds in video timebase (preferred). If None, wall-clock will be used.
    """
    global tracked_vehicles, next_track_id, current_stats

    # If no timestamp provided, fall back to wall-clock
    if timestamp_s is None:
        timestamp_s = time.time()
    
    if not detections:
        current_time = timestamp_s if timestamp_s is not None else time.time()
        # Increment disappeared count for all tracks and count exits by time threshold
        for track_id in list(tracked_vehicles.keys()):
            tracked_vehicles[track_id]['disappeared'] = tracked_vehicles[track_id].get('disappeared', 0) + 1
            last_seen = tracked_vehicles[track_id].get('last_seen', current_time)
            if (current_time - last_seen) >= EXIT_COUNT_THRESHOLD_SEC:
                register_exited_vehicle(track_id, tracked_vehicles[track_id].get('type', 'car'))
                del tracked_vehicles[track_id]
        return tracked_vehicles
    
    # Get current centroids from detections
    current_centroids = []
    detection_info = []
    for det in detections:
        bbox = det['bbox']
        centroid = get_centroid(bbox)
        current_centroids.append(centroid)
        detection_info.append({
            'centroid': centroid,
            'type': det['type'],
            'bbox': bbox
        })
    
    # If no existing tracks, create new ones
    if len(tracked_vehicles) == 0:
        current_time = timestamp_s
        for i, det_info in enumerate(detection_info):
            tracked_vehicles[next_track_id] = {
                'last_position': det_info['centroid'],
                'type': det_info['type'],
                'disappeared': 0,
                'last_seen': current_time,
                'speed': 0.0,
                'position_history': [(det_info['centroid'][0], det_info['centroid'][1], current_time)],
                'speed_history': []
            }
            next_track_id += 1
    else:
        # Match existing tracks with new detections
        track_ids = list(tracked_vehicles.keys())
        track_centroids = [tracked_vehicles[tid]['last_position'] for tid in track_ids]
        
        # Calculate distance matrix
        if len(track_centroids) > 0 and len(current_centroids) > 0:
            D = distance.cdist(np.array(track_centroids), np.array(current_centroids))
            
            # Find minimum values
            rows = D.min(axis=1).argsort()
            cols = D.argmin(axis=1)[rows]
            
            used_track_ids = set()
            used_detection_indices = set()
            
            # Update existing tracks
            for (row, col) in zip(rows, cols):
                if row in used_track_ids or col in used_detection_indices:
                    continue
                
                if D[row, col] > max_distance:
                    continue
                
                track_id = track_ids[row]
                det_info = detection_info[col]
                current_position = det_info['centroid']
                
                # Calculate speed using provided timestamp (video timebase)
                current_time = timestamp_s if timestamp_s is not None else time.time()
                speed_kmh = calculate_vehicle_speed(track_id, current_position, current_time)
                
                # Update track
                tracked_vehicles[track_id]['last_position'] = current_position
                tracked_vehicles[track_id]['type'] = det_info['type']
                tracked_vehicles[track_id]['disappeared'] = 0
                tracked_vehicles[track_id]['last_seen'] = current_time
                tracked_vehicles[track_id]['speed'] = speed_kmh
                
                used_track_ids.add(row)
                used_detection_indices.add(col)
            
            # Handle unmatched tracks (increment disappeared / exit-based count)
            for row in range(len(track_ids)):
                if row not in used_track_ids:
                    track_id = track_ids[row]
                    tracked_vehicles[track_id]['disappeared'] += 1
                    last_seen = tracked_vehicles[track_id].get('last_seen', timestamp_s if timestamp_s is not None else time.time())
                    now_ts = timestamp_s if timestamp_s is not None else time.time()
                    if (now_ts - last_seen) >= EXIT_COUNT_THRESHOLD_SEC:
                        register_exited_vehicle(track_id, tracked_vehicles[track_id].get('type', 'car'))
                        del tracked_vehicles[track_id]
            
            # Create new tracks for unmatched detections
            for col in range(len(current_centroids)):
                if col not in used_detection_indices:
                    det_info = detection_info[col]
                    current_time = timestamp_s
                    tracked_vehicles[next_track_id] = {
                        'last_position': det_info['centroid'],
                        'type': det_info['type'],
                        'disappeared': 0,
                        'last_seen': current_time,
                        'speed': 0.0,
                        'position_history': [(det_info['centroid'][0], det_info['centroid'][1], current_time)],
                        'speed_history': []
                    }
                    next_track_id += 1
    
    return tracked_vehicles


# Trajectory-based auto-calibration helper removed.
# If you want to re-add auto-calibration in the future, implement a separate
# module/function and wire endpoints explicitly.

def load_model():
    """Load TWO models:
    - model_general: COCO yolov5s for normal traffic vehicles (keeps existing tracker/speed/counting working)
    - model_emergency: custom best.pt for ambulance detection (emergency logic only)
    """
    global model, model_general, model_emergency
 
    try:
        import torch

        # Absolute paths (SAFE on Windows)
        YOLOV5_PATH = r"N:\Project\Traffic Management\yolov5"
        EMERGENCY_MODEL_PATH = r"N:\Project\Traffic Management\yolov5\runs\train\ambulance_siren3\weights\best.pt"
        GENERAL_MODEL_PATH = os.path.join(YOLOV5_PATH, "yolov5s.pt")  # optional local weights if present

        if not os.path.exists(YOLOV5_PATH):
            raise FileNotFoundError(f"YOLOv5 path not found: {YOLOV5_PATH}")
        if not os.path.exists(EMERGENCY_MODEL_PATH):
            raise FileNotFoundError(f"Emergency model file not found: {EMERGENCY_MODEL_PATH}")

        # ---- Load GENERAL model (AutoShape) for normal vehicles ----
        # Prefer local yolov5s.pt if you place it at GENERAL_MODEL_PATH, otherwise uses hubconf to fetch/cached weights.
        if os.path.exists(GENERAL_MODEL_PATH):
            print(f"Loading GENERAL YOLOv5s weights from: {GENERAL_MODEL_PATH}")
            model_general = torch.hub.load(YOLOV5_PATH, "custom", path=GENERAL_MODEL_PATH, source="local")
        else:
            print("Loading GENERAL YOLOv5s (COCO) via local hubconf (may use cached weights)...")
            model_general = torch.hub.load(YOLOV5_PATH, "yolov5s", source="local", pretrained=True)

        # Keep general model thresholds close to default behavior (do not affect emergency thresholds)
        model_general.conf = 0.25
        model_general.iou = 0.45
        print("✅ General YOLOv5 model loaded. Classes:", model_general.names)

        # ---- Load EMERGENCY model (DetectMultiBackend) for ambulance ----
        from models.common import DetectMultiBackend
        print(f"Loading EMERGENCY YOLOv5 model from: {EMERGENCY_MODEL_PATH}")
        model_emergency = DetectMultiBackend(
            EMERGENCY_MODEL_PATH,
            device="cpu",
            dnn=False,
            data=None,
            fp16=False,
        )
        model_emergency.conf = 0.05
        model_emergency.iou = 0.45 
        print("✅ Emergency YOLOv5 model loaded. Classes:", model_emergency.names)

        # Backwards-compat: keep `model` pointing at emergency model for any existing checks
        model = model_emergency
        return True

    except Exception as e:
        print(f"❌ Failed to load custom model: {e}")
        print("⚠️ No fallback allowed in demo mode — fix required")
        return False

def _map_general_vehicle_label(label: str):
    """Map COCO labels to the existing tracker vehicle types."""
    label = (label or "").lower()
    if label in ("car", "truck", "bus"):
        return label
    if label in ("motorcycle", "bicycle"):
        return "bike"
    return None

def _run_emergency_inference(frame):
    """Run emergency model and calculate temporal emergency score.
    Returns: (best_bbox, emergency_score_state)
    Score Logic (Temporal):
      - Decay score by 1 every frame (min 0)
      - Ambulance detected (conf > 0.4): +2
      - Emergency light/siren detected (conf > 0.25): +3
    
    This prevents flickering and false negatives by accumulating confidence over frames.
    """
    global emergency_score_state, model_emergency
    
    if model_emergency is None:
        return None, 0

    img_size = 640
    img_size = check_img_size(img_size, s=int(model_emergency.stride))
    im = letterbox(frame, new_shape=img_size, stride=int(model_emergency.stride), auto=True)[0]
    im = im[:, :, ::-1].transpose(2, 0, 1)  # BGR->RGB, HWC->CHW
    im = np.ascontiguousarray(im)
    im = torch.from_numpy(im).to(model_emergency.device)
    im = im.float() / 255.0
    if im.ndim == 3:
        im = im.unsqueeze(0)

    # Lower threshold to capture weak detections (temporal logic filters noise)
    pred = model_emergency(im)
    pred = non_max_suppression(pred, conf_thres=0.15, iou_thres=0.45) 
    det = pred[0]

    det_exists = det is not None and len(det) > 0

    if det_exists:
        det[:, :4] = scale_boxes(im.shape[2:], det[:, :4], frame.shape).round()
    
    # 1. Decay score first (temporal stability)
    emergency_score_state = max(0, emergency_score_state - 1)

    # Scoring detections
    found_ambulance = False
    found_light = False
    
    ambulance_bbox = None
    light_bbox = None
    
    best_amb_conf = 0.0
    best_light_conf = 0.0
    
    if det_exists:
        for d in det:
            x1, y1, x2, y2, conf, cls = d[:6]
            label = model_emergency.names[int(cls)].lower()
            confidence = float(conf)

            if label == "ambulance" and confidence > 0.4:
                found_ambulance = True
                emergency_score_state += 2
                if confidence > best_amb_conf:
                    best_amb_conf = confidence
                    ambulance_bbox = list(map(int, [x1, y1, x2, y2]))
            
            elif label in ["emergency_light", "siren"] and confidence > 0.25:
                found_light = True
                emergency_score_state += 3
                if confidence > best_light_conf:
                    best_light_conf = confidence
                    light_bbox = list(map(int, [x1, y1, x2, y2]))

    # Determine best bbox for UI (Prioritize ambulance)
    final_bbox = ambulance_bbox if ambulance_bbox is not None else light_bbox
    
    # Debug output only when score is active
    if emergency_score_state > 0:
        print(f"[EMERGENCY SCORE] {emergency_score_state} | Amb: {found_ambulance} ({best_amb_conf:.2f}) | Light: {found_light} ({best_light_conf:.2f})")

    return final_bbox, emergency_score_state

def detect_direction_from_bbox(bbox, frame_shape):
    """Detect direction from ambulance bounding box position"""
    x1, y1, x2, y2 = bbox
    frame_height, frame_width = frame_shape[:2]
    
    # Calculate centroid
    cx = (x1 + x2) / 2
    cy = (y1 + y2) / 2
    
    # Divide frame into 4 spatial zones
    if cy < frame_height * 0.33:
        return "NORTH"
    elif cy > frame_height * 0.66:
        return "SOUTH"
    elif cx < frame_width * 0.33:
        return "WEST"
    else:
        return "EAST"

def determine_priority_direction(ambulance_detected, detected_direction):
    """Unified priority decision logic"""
    global road_config, emergency_state
    
    if not ambulance_detected:
        emergency_state['active'] = False
        emergency_state['ambulance_detected'] = False
        emergency_state['priority_direction'] = None
        return None
    
    emergency_state['ambulance_detected'] = True
    emergency_state['active'] = True
    
    road_mode = road_config['road_mode']
    allowed_directions = road_config['allowed_directions']
    
    if road_mode == "ONE_WAY":
        priority_direction = allowed_directions[0]
    elif road_mode == "TWO_WAY" or road_mode == "FOUR_WAY":
        priority_direction = detected_direction
    else:
        priority_direction = None
    
    emergency_state['priority_direction'] = priority_direction
    return priority_direction

def process_frame(frame):
    """Process a single frame and return detections"""
    global emergency_state, road_config, model_general, model_emergency

    if model_general is None or model_emergency is None:
        return None
    
    try:
        # ---------- (A) GENERAL MODEL: COCO vehicles -> tracker ----------
        vehicle_counts = defaultdict(int)
        frame_detections = []
        total_confidence = 0.0
        detection_count = 0
        results_g = model_general(frame)
        det_g = results_g.pred[0] if hasattr(results_g, "pred") else None

        if det_g is not None and len(det_g):
            for *xyxy, conf, cls in det_g:
                label = model_general.names[int(cls)].lower()
                vtype = _map_general_vehicle_label(label)
                if vtype is None:
                    continue
                confidence = float(conf)
                x1, y1, x2, y2 = map(int, xyxy)

                vehicle_counts[vtype] += 1
                total_confidence += confidence
                detection_count += 1

                frame_detections.append({
                    'type': vtype,
                    'confidence': round(confidence * 100, 2),
                    'bbox': [x1, y1, x2, y2]
                })

        # ---------- (B) EMERGENCY MODEL: ambulance only (no tracker feed) ----------
        ambulance_bbox, emergency_score = _run_emergency_inference(frame)
        ambulance_detected = emergency_score >= 3
        detected_direction = None

        if ambulance_detected:
            # Detect direction for TWO_WAY and FOUR_WAY roads
            if road_config['road_mode'] in ['TWO_WAY', 'FOUR_WAY']:
                detected_direction = detect_direction_from_bbox(ambulance_bbox, frame.shape)

            # Update emergency state (used by /api/emergency-status and popup logic)
            emergency_state['ambulance_detected'] = True
            emergency_state['ambulance_bbox'] = ambulance_bbox
            emergency_state['last_detection_time'] = time.time()

            if not emergency_state['active']:
                emergency_state['emergency_start_time'] = time.time()

            priority_direction = determine_priority_direction(True, detected_direction)
            print(f"🚨 EMERGENCY TRIGGERED! Score: {emergency_score}. Priority direction: {priority_direction}")
        else:
            # If ambulance left frame, we keep existing timeout-based clearing logic below
            pass
        
        # Check if ambulance left frame or timeout
        if not ambulance_detected and emergency_state['active']:
            current_time = time.time()
            last_detection = emergency_state.get('last_detection_time')
            
            # Clear emergency if timeout expired or no detection for 5 seconds
            if last_detection is None or (current_time - last_detection) > 5:
                if emergency_state.get('emergency_start_time'):
                    elapsed = current_time - emergency_state['emergency_start_time']
                    if elapsed > emergency_state['timeout_seconds']:
                        emergency_state['active'] = False
                        emergency_state['ambulance_detected'] = False
                        emergency_state['priority_direction'] = None
                        emergency_state['ambulance_bbox'] = None
                        print("🚨 Emergency cleared - timeout or ambulance left frame")
        
        # Update Central Alerts Logic
        update_alerts()

        
        avg_confidence = (total_confidence / detection_count * 100) if detection_count > 0 else 0.0
        
        return {
            'counts': dict(vehicle_counts),  # general vehicles only (tracker pipeline)
            'total': sum(vehicle_counts.values()),
            'confidence': round(avg_confidence, 2),
            'detections': frame_detections,  # general vehicles only (required by update_tracker/speed/counting)
            'ambulance_detected': ambulance_detected
        }
    except Exception as e:
        print(f"Error processing frame: {e}")
        return None

def detection_loop():
    """Main detection loop running in background thread"""
    global is_detecting, video_cap, current_stats, current_frame_with_detections, is_paused, current_camera_id

    # Report the timestamp source once per detection session for debugging
    timestamp_source_reported = False
    
    while is_detecting and video_cap is not None:
        try:
            # If a seek is in progress, wait a short amount so seek can safely reposition
            if seek_lock.locked():
                time.sleep(0.01)
                continue

            # Respect pause flag: do not read/process frames while paused
            if is_paused:
                time.sleep(0.1)
                continue

            ret, frame = video_cap.read()
            if not ret:
                time.sleep(0.1)
                continue
        
            # Compute a reliable timestamp for this frame (video timebase preferred)
            pos_msec = video_cap.get(cv2.CAP_PROP_POS_MSEC) or 0
            fps_local_cap = float(video_cap.get(cv2.CAP_PROP_FPS) or 0)
            frame_idx = int(video_cap.get(cv2.CAP_PROP_POS_FRAMES) or 0)

            if pos_msec and pos_msec > 0:
                timestamp_s = float(pos_msec) / 1000.0
                ts_source = 'pos_msec'
            elif fps_local_cap and fps_local_cap > 0:
                timestamp_s = float(frame_idx) / float(fps_local_cap)
                ts_source = 'frame_idx'
            else:
                timestamp_s = time.time()
                ts_source = 'wall_clock'

            # Print which timestamp source is being used (only once)
            if not timestamp_source_reported:
                print(f"Using timestamp source for speed calc: {ts_source}")
                timestamp_source_reported = True

            # Create a copy of the frame for drawing
            frame_copy = frame.copy()
            rois_norm = get_lane_rois_norm(current_camera_id)
            
            result = process_frame(frame)
            if result:
                # Update tracker and check for line crossings with video timestamp
                tracked = update_tracker(result['detections'], frame.shape, timestamp_s)





            # Draw bounding boxes and track IDs
            for track_id, track_info in tracked_vehicles.items():
                # Find corresponding detection
                for det in result['detections']:
                    centroid = get_centroid(det['bbox'])
                    if abs(centroid[0] - track_info['last_position'][0]) < 50 and \
                       abs(centroid[1] - track_info['last_position'][1]) < 50:
                        x1, y1, x2, y2 = det['bbox']
                        color = (0, 255, 0) if track_id in counted_track_ids else (255, 0, 0)
                        cv2.rectangle(frame_copy, (x1, y1), (x2, y2), color, 2)
                        label = f"ID:{track_id} {det['type']} {det['confidence']}%"
                        if track_info.get('speed', 0) > 0:
                            label += f" {track_info['speed']:.1f}km/h"
                        cv2.putText(frame_copy, label, (x1, y1 - 10), 
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
                        break

            # Draw ambulance bbox (emergency model) in RED without feeding tracker
            if emergency_state.get('ambulance_bbox'):
                ax1, ay1, ax2, ay2 = emergency_state['ambulance_bbox']
                cv2.rectangle(frame_copy, (ax1, ay1), (ax2, ay2), (0, 0, 255), 3)
                cv2.putText(frame_copy, "AMBULANCE", (ax1, max(0, ay1 - 12)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)

            # Draw lane ROIs for debugging/verification
            draw_lane_rois(frame_copy, rois_norm)
            
            # Store the frame with detections
            with frame_lock:
                current_frame_with_detections = frame_copy.copy()
            
            # Calculate speed statistics
            speeds = []
            speeds_by_type = defaultdict(list)
            speeding_count = 0
            
            for track_id, track_info in tracked_vehicles.items():
                if 'speed' in track_info and track_info['speed'] > 0:
                    speed = track_info['speed']
                    speeds.append(speed)
                    vehicle_type = track_info.get('type', 'car')
                    # Map singular type to plural key for consistency
                    type_mapping = {'car': 'cars', 'truck': 'trucks', 'bus': 'buses', 'bike': 'bikes'}
                    plural_type = type_mapping.get(vehicle_type, 'cars')
                    speeds_by_type[plural_type].append(speed)
                    
                    if speed > speed_limit_kmh:
                        speeding_count += 1
            
            with stats_lock:
                current_stats['cars'] = result['counts'].get('car', 0)
                current_stats['trucks'] = result['counts'].get('truck', 0)
                current_stats['buses'] = result['counts'].get('bus', 0)
                current_stats['bikes'] = result['counts'].get('bike', 0)
                current_stats['total'] = result['total']
                current_stats['confidence'] = result['confidence']
                
                # Update speed statistics
                if speeds:
                    current_stats['speed_stats']['average_speed'] = round(np.mean(speeds), 2)
                    current_stats['speed_stats']['max_speed'] = round(np.max(speeds), 2)
                    current_stats['speed_stats']['min_speed'] = round(np.min(speeds), 2)
                    current_stats['speed_stats']['speeding_count'] = speeding_count
                    
                    # Average speed by type (using plural keys)
                    for vtype in ['cars', 'trucks', 'buses', 'bikes']:
                        if speeds_by_type[vtype]:
                            current_stats['speed_stats']['speed_by_type'][vtype] = round(
                                np.mean(speeds_by_type[vtype]), 2
                            )
                        else:
                            current_stats['speed_stats']['speed_by_type'][vtype] = 0.0
                else:
                    # Reset if no vehicles
                    current_stats['speed_stats'] = {
                        'average_speed': 0.0,
                        'max_speed': 0.0,
                        'min_speed': 0.0,
                        'speeding_count': 0,
                        'speed_by_type': {'cars': 0.0, 'trucks': 0.0, 'buses': 0.0, 'bikes': 0.0}
                    }
                
                # Update recent detections (keep last 10)
                for det in result['detections']:
                    det['timestamp'] = time.strftime('%H:%M:%S')
                    det['id'] = int(time.time() * 1000)

                current_stats['recent_detections'] = result['detections'][:10]

                # Update structured traffic data (lightweight operation)
                traffic_data.update_from_stats(current_stats)

                # Compute lane loads from tracker + update controller
                lane_metrics = compute_all_lane_loads(tracked_vehicles, frame.shape, speed_limit_kmh, rois_norm)
                signal_controller.update_lane_loads({
                    "NORTH": lane_metrics["NORTH"]["load"],
                    "SOUTH": lane_metrics["SOUTH"]["load"],
                    "EAST": lane_metrics["EAST"]["load"],
                    "WEST": lane_metrics["WEST"]["load"]
                })

                # Update signal controller with current congestion level
                signal_controller.update_congestion(traffic_data.congestion_level)
                signal_controller.advance_phase()

                # Update weather detection (analyze every 30 frames to reduce computation)
                if frame_idx % 30 == 0:
                    detect_weather_from_frame(frame)

            time.sleep(0.033)  # ~30 FPS
        except Exception as e:
            print(f"Error in detection_loop: {e}")
            # Avoid tight crash loops
            time.sleep(0.5)

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'model_loaded': model is not None,
        'detecting': is_detecting,
        'paused': is_paused
    })

@app.route('/api/detect/image', methods=['POST'])
def detect_image():
    """Process a single image and return vehicle counts"""
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400
        
        file = request.files['image']
        if file.filename == '':
            return jsonify({'error': 'Empty file'}), 400
        
        # Read image
        image_bytes = file.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return jsonify({'error': 'Invalid image format'}), 400
        
        # Process frame
        result = process_frame(frame)
        if result is None:
            return jsonify({'error': 'Detection failed'}), 500
        
        return jsonify({
            'success': True,
            'data': {
                'cars': result['counts'].get('car', 0),
                'trucks': result['counts'].get('truck', 0),
                'buses': result['counts'].get('bus', 0),
                'bikes': result['counts'].get('bike', 0),
                'total': result['total'],
                'confidence': result['confidence'],
                'detections': result['detections']
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/detect/start', methods=['POST'])
def start_detection():
    """Start real-time detection from video source"""
    global is_detecting, video_cap, detection_thread, current_frame_with_detections, current_camera_id
    
    try:
        data = request.json
        video_source = data.get('source', 0)  # 0 for webcam, or URL/path
        current_camera_id = f"camera_{video_source}" if isinstance(video_source, int) else str(video_source)
        
        if is_detecting:
            return jsonify({'error': 'Detection already running'}), 400
        
        # Open video source
        video_cap = cv2.VideoCapture(video_source)
        if not video_cap.isOpened():
            return jsonify({'error': f'Could not open video source: {video_source}'}), 400
        
        # Clear stored frame
        with frame_lock:
            current_frame_with_detections = None
        
        is_detecting = True
        detection_thread = threading.Thread(target=detection_loop, daemon=True)
        detection_thread.start()
        
        return jsonify({
            'success': True,
            'message': 'Detection started'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/detect/stop', methods=['POST'])
def stop_detection():
    """Stop real-time detection"""
    global is_detecting, video_cap, tracked_vehicles, current_frame_with_detections, is_paused, counted_track_ids
    
    try:
        is_detecting = False
        is_paused = False
        if video_cap:
            video_cap.release()
            video_cap = None
        tracked_vehicles.clear()  # Clear tracks when stopping
        counted_track_ids.clear()
        with stats_lock:
            current_stats['vehicle_count'] = 0
            current_stats['counts_by_type'] = {'cars': 0, 'trucks': 0, 'buses': 0, 'bikes': 0}
        with frame_lock:
            current_frame_with_detections = None  # Clear stored frame
        
        return jsonify({
            'success': True,
            'message': 'Detection stopped'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/detect/pause', methods=['POST'])
def pause_detection():
    """Pause processing frames (detection loop will not advance frames)"""
    global is_paused
    try:
        is_paused = True
        signal_controller.set_paused(True)
        return jsonify({'success': True, 'paused': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/detect/resume', methods=['POST'])
def resume_detection():
    """Resume processing frames"""
    global is_paused
    try:
        is_paused = False
        signal_controller.set_paused(False)
        return jsonify({'success': True, 'paused': False})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/detect/seek', methods=['POST'])
def seek_detection():
    """Seek forward/backward by a number of frames or set absolute position (works for file-based videos)"""
    global video_cap
    try:
        if video_cap is None:
            return jsonify({'error': 'No active video stream'}), 400
        data = request.json or {}
        offset = data.get('offset', None)
        target = data.get('target', None)
        # Current frame index
        cur = int(video_cap.get(cv2.CAP_PROP_POS_FRAMES) or 0)
        if target is not None:
            target = int(target)
        elif offset is not None:
            target = max(0, cur + int(offset))
        else:
            return jsonify({'error': 'offset or target required'}), 400

        # Clamp to frame count if available
        total = int(video_cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if total > 0:
            target = min(max(0, target), total - 1)

        success = video_cap.set(cv2.CAP_PROP_POS_FRAMES, target)
        if not success:
            return jsonify({'error': 'Seek failed or not supported by this stream'}), 400
        return jsonify({'success': True, 'position': target})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/detect/stats', methods=['GET'])
def get_stats():
    """Get current detection statistics"""
    with stats_lock:
        return jsonify({
            'success': True,
            'data': current_stats.copy()
        })

@app.route('/api/detect/frame', methods=['GET'])
def get_frame():
    """Get current frame with detections (for video preview)"""
    global current_frame_with_detections, video_cap
    
    if not is_detecting:
        return jsonify({'error': 'No active video stream'}), 400
    
    try:
        # Get the stored frame with detections (already processed by detection_loop)
        with frame_lock:
            if current_frame_with_detections is None:
                return jsonify({'error': 'Frame not available yet'}), 503
            
            # Make a copy to avoid issues with concurrent access
            frame = current_frame_with_detections.copy()
        
        # Encode frame as JPEG
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        frame_base64 = base64.b64encode(buffer).decode('utf-8')
        
        # Include position and duration info when available
        position = int(video_cap.get(cv2.CAP_PROP_POS_FRAMES) or 0) if video_cap is not None else None
        total = int(video_cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0) if video_cap is not None else None
        fps_local = float(video_cap.get(cv2.CAP_PROP_FPS) or 0) if video_cap is not None else None
        duration = (total / fps_local) if (total and fps_local) else None
        
        return jsonify({
            'success': True,
            'frame': f'data:image/jpeg;base64,{frame_base64}',
            'position': position,
            'frames': total,
            'fps': fps_local,
            'duration': duration
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500



@app.route('/api/analytics/reset', methods=['POST'])
def reset_analytics():
    """Reset global vehicle analytics counters"""
    global tracked_vehicles, counted_track_ids

    with stats_lock:
        current_stats['vehicle_count'] = 0
        current_stats['counts_by_type'] = {'cars': 0, 'trucks': 0, 'buses': 0, 'bikes': 0}
        tracked_vehicles.clear()
        counted_track_ids.clear()

    return jsonify({
        'success': True,
        'message': 'Analytics reset'
    })

# Backward-compatible alias (line logic removed; now resets analytics)
@app.route('/api/counting/reset', methods=['POST'])
def reset_count():
    return reset_analytics()

@app.route('/api/speed/calibrate', methods=['POST'])
def calibrate_speed():
    """Calibrate pixel-to-meter ratio for speed calculation"""
    global pixel_to_meter_ratio
    
    try:
        data = request.json
        ratio = data.get('pixel_to_meter_ratio')
        speed_limit = data.get('speed_limit_kmh')
        
        if ratio is not None:
            pixel_to_meter_ratio = float(ratio)
        
        if speed_limit is not None:
            global speed_limit_kmh
            speed_limit_kmh = float(speed_limit)
        
        return jsonify({
            'success': True,
            'message': 'Speed calibration updated',
            'pixel_to_meter_ratio': pixel_to_meter_ratio,
            'speed_limit_kmh': speed_limit_kmh
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/speed/stats', methods=['GET'])
def get_speed_stats():
    """Get current speed statistics"""
    with stats_lock:
        return jsonify({
            'success': True,
            'data': current_stats['speed_stats'].copy(),
            'speed_limit_kmh': speed_limit_kmh
        })

@app.route('/api/traffic/data', methods=['GET'])
def get_traffic_data():
    """Get structured traffic management data"""
    return jsonify({
        'success': True,
        'data': traffic_data.to_dict()
    })

@app.route('/api/signal/status', methods=['GET'])
def get_signal_status():
    """Get current traffic signal status"""
    emergency_override = signal_controller.get_emergency_override()
    if emergency_override is not None:
        return jsonify({
            'success': True,
            'data': emergency_override
        })
    return jsonify({
        'success': True,
        'data': signal_controller.get_status()
    })

@app.route('/api/signal/decisions', methods=['GET'])
def get_signal_decisions():
    """Get recent signal controller decisions and alerts"""
    return jsonify({
        'success': True,
        'data': signal_controller.get_decisions()
    })

@app.route('/api/minute-vehicle-count', methods=['GET'])
def get_minute_vehicle_count():
    """Get vehicle counts aggregated by minute for the last 24 hours"""
    return jsonify({
        'success': True,
        'data': minute_vehicle_counts.copy()
    })

@app.route('/api/road-type', methods=['GET'])
def get_road_type():
    """Get the configured road type (static property)"""
    try:
        return jsonify({
            'success': True,
            'data': {
                'type': current_road_type['type'],
                'configured': current_road_type['configured'],
                'last_updated': current_road_type['last_updated'],
                'description': get_road_type_description(current_road_type['type'])
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/road-type', methods=['POST'])
def set_road_type():
    """Configure the road type (static property set once per camera/road)"""
    try:
        data = request.json
        road_type = data.get('type', '').upper()

        if road_type not in ['HIGHWAY', 'ARTERIAL', 'LOCAL']:
            return jsonify({
                'success': False,
                'error': 'Invalid road type. Must be HIGHWAY, ARTERIAL, or LOCAL'
            }), 400

        # Update road type (only if not already configured, or allow reconfiguration)
        current_road_type['type'] = road_type
        current_road_type['configured'] = True
        current_road_type['last_updated'] = time.strftime('%Y-%m-%d %H:%M:%S')

        return jsonify({
            'success': True,
            'data': {
                'type': current_road_type['type'],
                'configured': current_road_type['configured'],
                'last_updated': current_road_type['last_updated'],
                'description': get_road_type_description(current_road_type['type'])
            },
            'message': f'Road type configured as {road_type}'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def get_road_type_description(road_type):
    """Get description for road type"""
    descriptions = {
        'HIGHWAY': 'High-capacity roads designed for high-speed, long-distance travel with limited access points',
        'ARTERIAL': 'Major roads that carry high volumes of traffic, often connecting highways to local streets',
        'LOCAL': 'Neighborhood streets with lower traffic volumes, primarily for local access'
    }
    return descriptions.get(road_type, 'Unknown road type')

@app.route('/api/road-config', methods=['GET'])
def get_road_config():
    """Get road configuration for emergency vehicle priority"""
    return jsonify({
        'success': True,
        'data': road_config.copy()
    })

@app.route('/api/road-config', methods=['POST'])
def set_road_config():
    """Configure road mode and allowed directions (STATIC - set once per camera)"""
    global road_config
    try:
        data = request.json
        road_mode = data.get('road_mode', '').upper()
        allowed_directions = data.get('allowed_directions', [])
        
        if road_mode not in ['ONE_WAY', 'TWO_WAY', 'FOUR_WAY']:
            return jsonify({
                'success': False,
                'error': 'Invalid road_mode. Must be ONE_WAY, TWO_WAY, or FOUR_WAY'
            }), 400
        
        # Validate allowed directions based on road mode
        valid_directions = ['NORTH', 'SOUTH', 'EAST', 'WEST']
        if not all(d in valid_directions for d in allowed_directions):
            return jsonify({
                'success': False,
                'error': 'Invalid direction. Must be NORTH, SOUTH, EAST, or WEST'
            }), 400
        
        if road_mode == 'ONE_WAY' and len(allowed_directions) != 1:
            return jsonify({
                'success': False,
                'error': 'ONE_WAY mode requires exactly one allowed direction'
            }), 400
        elif road_mode == 'TWO_WAY' and len(allowed_directions) != 2:
            return jsonify({
                'success': False,
                'error': 'TWO_WAY mode requires exactly two allowed directions'
            }), 400
        elif road_mode == 'FOUR_WAY' and len(allowed_directions) != 4:
            return jsonify({
                'success': False,
                'error': 'FOUR_WAY mode requires exactly four allowed directions'
            }), 400
        
        road_config['road_mode'] = road_mode
        road_config['allowed_directions'] = allowed_directions
        road_config['configured'] = True
        road_config['last_updated'] = time.strftime('%Y-%m-%d %H:%M:%S')
        
        return jsonify({
            'success': True,
            'data': road_config.copy(),
            'message': f'Road configuration set to {road_mode}'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/roi-config', methods=['GET'])
def get_roi_config():
    """Get ROI configuration for a camera (normalized coordinates)."""
    camera_id = request.args.get('camera_id', 'default')
    rois = get_lane_rois_norm(camera_id)
    return jsonify({
        'success': True,
        'data': {
            'camera_id': camera_id,
            'rois': rois
        }
    })

@app.route('/api/roi-config', methods=['POST'])
def set_roi_config():
    """Set ROI configuration for a camera (normalized coordinates)."""
    try:
        data = request.json or {}
        camera_id = data.get('camera_id', 'default')
        rois = data.get('rois')
        ok, msg = validate_rois_norm(rois)
        if not ok:
            return jsonify({'success': False, 'error': msg}), 400

        existing = {}
        if os.path.exists(ROI_CONFIG_PATH):
            try:
                with open(ROI_CONFIG_PATH, 'r') as f:
                    existing = json.load(f) or {}
            except Exception:
                existing = {}

        existing[str(camera_id)] = rois
        with open(ROI_CONFIG_PATH, 'w') as f:
            json.dump(existing, f, indent=2)

        return jsonify({
            'success': True,
            'data': {
                'camera_id': str(camera_id),
                'rois': rois
            },
            'message': 'ROI configuration saved'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/emergency-status', methods=['GET'])
def get_emergency_status():
    """Get current emergency vehicle status"""
    global emergency_state, road_config
    
    if emergency_state['active']:
        priority_direction = emergency_state.get('priority_direction')
        signal_states = {}
        directions = ['NORTH', 'SOUTH', 'EAST', 'WEST']
        
        for direction in directions:
            if direction == priority_direction:
                signal_states[direction] = 'GREEN'
            else:
                signal_states[direction] = 'RED'
        
        return jsonify({
            'success': True,
            'data': {
                'emergency': True,
                'priority_direction': priority_direction,
                'road_mode': road_config['road_mode'],
                'signal_states': signal_states,
                'ambulance_detected': emergency_state['ambulance_detected']
            }
        })
    else:
        return jsonify({
            'success': True,
            'data': {
                'emergency': False,
                'priority_direction': None,
                'road_mode': road_config['road_mode'],
                'signal_states': {},
                'ambulance_detected': False
            }
        })

def detect_weather_from_frame(frame):
    """Analyze frame to detect weather conditions"""
    global current_weather
    from datetime import datetime, timezone
    
    if frame is None:
        return current_weather
    
    try:
        # Convert to grayscale for analysis
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        
        # Calculate brightness (average pixel value)
        brightness = np.mean(gray)
        
        # Calculate contrast (standard deviation)
        contrast = np.std(gray)
        
        # Detect time of day based on brightness
        if brightness < 50:
            time_of_day = 'Night'
        elif brightness < 100:
            time_of_day = 'Dawn/Dusk'
        else:
            time_of_day = 'Day'
        
        # Detect weather condition
        condition = 'Clear'
        visibility = 'Good'
        confidence = 0.7
        
        # Sunny: High brightness, high contrast
        if brightness > 150 and contrast > 40:
            condition = 'Sunny'
            visibility = 'Excellent'
            confidence = 0.85
        # Cloudy: Medium brightness, lower contrast
        elif brightness > 80 and brightness < 150 and contrast < 40:
            condition = 'Cloudy'
            visibility = 'Good'
            confidence = 0.75
        # Foggy: Low contrast, medium brightness
        elif contrast < 25 and brightness > 60:
            condition = 'Foggy'
            visibility = 'Poor'
            confidence = 0.70
        # Rain detection: Check for water reflections (high saturation areas)
        else:
            # Calculate saturation
            saturation = np.mean(hsv[:, :, 1])
            # Rain often shows as high saturation in certain areas
            if saturation > 100 and contrast > 30:
                condition = 'Rainy'
                visibility = 'Moderate'
                confidence = 0.65
            # Very dark = night or heavy clouds
            elif brightness < 60:
                condition = 'Overcast' if time_of_day == 'Day' else 'Night'
                visibility = 'Moderate' if time_of_day == 'Day' else 'Limited'
                confidence = 0.80
        
        # Update global weather state
        current_weather = {
            'condition': condition,
            'visibility': visibility,
            'time_of_day': time_of_day,
            'confidence': round(confidence, 2),
            'last_updated': datetime.now(timezone.utc).isoformat()
        }
        
        return current_weather
    except Exception as e:
        print(f"Error detecting weather: {e}")
        return current_weather

@app.route('/api/weather', methods=['GET'])
def get_weather():
    """Get current weather condition detected from video"""
    global current_weather, current_frame_with_detections
    
    # If we have a current frame, analyze it for weather
    if current_frame_with_detections is not None:
        try:
            weather = detect_weather_from_frame(current_frame_with_detections)
            return jsonify({
                'success': True,
                'data': weather
            })
        except Exception as e:
            return jsonify({
                'success': False,
                'error': str(e)
            }), 500
    
    # Return cached weather if no frame available
    return jsonify({
        'success': True,
        'data': current_weather
    })

@app.route('/api/alerts', methods=['GET'])
def get_alerts():
    """Get all alerts (active and resolved)"""
    # Sort: HIGH -> MEDIUM -> LOW, then RESOLVED at bottom
    # Within groups, sort by timestamp descending
    
    alerts_list = list(active_alerts.values())
    
    # Custom sort function
    def sort_key(a):
        # 1. Primary Sort: Status (ACTIVE < RESOLVED) -> We want ACTIVE first
        status_rank = 0 if a['status'] == 'ACTIVE' else 1
        
        # 2. Secondary Sort: Priority (HIGH < MEDIUM < LOW)
        priority_map = {'HIGH': 0, 'MEDIUM': 1, 'LOW': 2}
        priority_rank = priority_map.get(a['priority'], 3)
        
        # 3. Tertiary Sort: Timestamp (Newest first) -> neg timestamp
        return (status_rank, priority_rank, -a['timestamp'])
    
    alerts_list.sort(key=sort_key)
    
    return jsonify({
        'success': True,
        'data': alerts_list
    })

if __name__ == '__main__':
    print("Loading YOLOv5 model...")
    if load_model():
        print("Starting Flask server on http://localhost:5000")
        app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
    else:
        print("Failed to load model. Please check your setup.")
