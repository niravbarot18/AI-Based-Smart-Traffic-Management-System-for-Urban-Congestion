from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import torch
import numpy as np
import base64
from io import BytesIO
from PIL import Image
import threading
import time
from collections import defaultdict
from scipy.spatial import distance

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Global variables for detection
model = None
detection_thread = None
is_detecting = False
is_paused = False  # If true, detection loop will pause processing frames
current_stats = {
    'cars': 0,
    'trucks': 0,
    'buses': 0,
    'bikes': 0,
    'total': 0,
    'confidence': 0.0,
    'recent_detections': [],
    'vehicle_count': 0,  # Total vehicles that crossed the line
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

class SignalController:
    """Adaptive traffic signal controller based on congestion levels"""
    def __init__(self):
        self.phase = 'RED'  # Current phase: RED, GREEN, YELLOW
        self.remaining_time = 0  # Seconds remaining in current phase
        self.last_congestion = 'NORMAL'  # Track last congestion level for alerts
        self.alerts = []  # List of recent alerts
        self.phase_start_time = time.time()
        self.green_timings = {
            'NORMAL': 30,
            'MODERATE': 45,
            'SEVERE': 60
        }
        self.yellow_time = 5
        self.red_time = 10  # Fixed red time between cycles

    def update_congestion(self, congestion_level):
        """Update signal timing based on congestion level"""
        if congestion_level != self.last_congestion:
            # Generate alert when congestion changes
            alert_msg = f"{congestion_level.capitalize()} congestion detected. Signal timing adjusted."
            self.alerts.append({
                'message': alert_msg,
                'timestamp': time.strftime('%H:%M:%S'),
                'congestion': congestion_level
            })
            # Keep only last 5 alerts
            if len(self.alerts) > 5:
                self.alerts = self.alerts[-5:]
            self.last_congestion = congestion_level

    def get_current_timing(self):
        """Get current green time based on congestion"""
        return self.green_timings.get(self.last_congestion, 30)

    def advance_phase(self):
        """Advance to next phase in cycle"""
        current_time = time.time()
        elapsed = current_time - self.phase_start_time

        if self.phase == 'RED':
            if elapsed >= self.red_time:
                self.phase = 'GREEN'
                self.remaining_time = self.get_current_timing()
                self.phase_start_time = current_time
        elif self.phase == 'GREEN':
            if elapsed >= self.get_current_timing():
                self.phase = 'YELLOW'
                self.remaining_time = self.yellow_time
                self.phase_start_time = current_time
        elif self.phase == 'YELLOW':
            if elapsed >= self.yellow_time:
                self.phase = 'RED'
                self.remaining_time = self.red_time
                self.phase_start_time = current_time

    def get_status(self):
        """Get current signal status"""
        current_time = time.time()
        elapsed = current_time - self.phase_start_time
        self.remaining_time = max(0, self.remaining_time - elapsed)
        return {
            'phase': self.phase,
            'remaining_time': int(self.remaining_time),
            'congestion_level': self.last_congestion,
            'green_time': self.get_current_timing()
        }

    def get_decisions(self):
        """Get recent signal decisions/alerts"""
        return self.alerts.copy()

# Initialize signal controller
signal_controller = SignalController()
video_cap = None
stats_lock = threading.Lock()
current_frame_with_detections = None  # Store the latest frame with detections drawn
frame_lock = threading.Lock()  # Lock for frame access
seek_lock = threading.Lock()  # Lock to make seek operations atomic


# Vehicle tracking and counting
counting_line = [(100, 300), (500, 300)]  # Default counting line [start, end]
tracked_vehicles = {}  # {track_id: {'last_position': (x, y), 'counted': False, 'type': str, 'last_seen': time, 'speed': float, 'position_history': [(x, y, time)], 'speed_history': [speed]}}
next_track_id = 0
max_disappeared = 30  # Frames before removing a track
max_distance = 100  # Max distance for centroid matching

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

def orientation(p, q, r):
    """Find orientation of ordered triplet (p, q, r)"""
    val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1])
    if val == 0:
        return 0  # Collinear
    return 1 if val > 0 else 2  # Clockwise or Counterclockwise

def is_crossing_line(point, line_start, line_end, prev_point=None):
    """Check if a point crosses a line"""
    if prev_point is None:
        return False
    
    o1 = orientation(line_start, line_end, prev_point)
    o2 = orientation(line_start, line_end, point)
    o3 = orientation(prev_point, point, line_start)
    o4 = orientation(prev_point, point, line_end)
    
    # General case: line segments intersect
    if o1 != o2 and o3 != o4:
        return True
    
    return False

def update_tracker(detections, frame_shape, timestamp_s=None):
    """Update vehicle tracker and check for line crossings

    timestamp_s: seconds in video timebase (preferred). If None, wall-clock will be used.
    """
    global tracked_vehicles, next_track_id, current_stats
    
    if not detections:
        # Increment disappeared count for all tracks
        for track_id in list(tracked_vehicles.keys()):
            tracked_vehicles[track_id]['disappeared'] = tracked_vehicles[track_id].get('disappeared', 0) + 1
            if tracked_vehicles[track_id]['disappeared'] > max_disappeared:
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
    
    # If no timestamp provided, fall back to wall-clock
    if timestamp_s is None:
        timestamp_s = time.time()

    # If no existing tracks, create new ones
    if len(tracked_vehicles) == 0:
        current_time = timestamp_s
        for i, det_info in enumerate(detection_info):
            tracked_vehicles[next_track_id] = {
                'last_position': det_info['centroid'],
                'counted': False,
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
                prev_position = tracked_vehicles[track_id]['last_position']
                current_position = det_info['centroid']
                
                # Check for line crossing
                if not tracked_vehicles[track_id]['counted'] and \
                   is_crossing_line(current_position, counting_line[0], counting_line[1], prev_position):
                    tracked_vehicles[track_id]['counted'] = True
                    vehicle_type = det_info['type']
                    # Map singular vehicle type to plural key for consistency
                    type_mapping = {'car': 'cars', 'truck': 'trucks', 'bus': 'buses', 'bike': 'bikes'}
                    plural_type = type_mapping.get(vehicle_type, 'cars')
                    with stats_lock:
                        current_stats['vehicle_count'] += 1
                        current_stats['counts_by_type'][plural_type] = \
                            current_stats['counts_by_type'].get(plural_type, 0) + 1
                    print(f"Vehicle {track_id} ({vehicle_type}) crossed the line. Total count: {current_stats['vehicle_count']}")
                
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
            
            # Handle unmatched tracks (increment disappeared)
            for row in range(len(track_ids)):
                if row not in used_track_ids:
                    track_id = track_ids[row]
                    tracked_vehicles[track_id]['disappeared'] += 1
                    if tracked_vehicles[track_id]['disappeared'] > max_disappeared:
                        del tracked_vehicles[track_id]
            
            # Create new tracks for unmatched detections
            for col in range(len(current_centroids)):
                if col not in used_detection_indices:
                    det_info = detection_info[col]
                    current_time = time.time()
                    tracked_vehicles[next_track_id] = {
                        'last_position': det_info['centroid'],
                        'counted': False,
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
    """Load YOLOv5 model"""
    global model
    try:
        model = torch.hub.load('ultralytics/yolov5', 'yolov5s', pretrained=True)
        model.conf = 0.5  # Confidence threshold (50% - filters out low confidence detections)
        model.iou = 0.45  # IoU threshold for NMS
        print("YOLOv5 model loaded successfully")
        return True
    except Exception as e:
        print(f"Error loading model: {e}")
        return False

def process_frame(frame):
    """Process a single frame and return detections"""
    if model is None:
        return None
    
    try:
        results = model(frame)
        detections = results.pred[0]  # Get detections for current frame
        
        vehicle_counts = defaultdict(int)
        vehicle_types = {
            'car': ['car'],
            'truck': ['truck'],
            'bus': ['bus'],
            'bike': ['bicycle', 'motorcycle']
        }
        
        frame_detections = []
        total_confidence = 0.0
        detection_count = 0
        
        for *xyxy, conf, cls in detections:
            label = model.names[int(cls)].lower()
            confidence = float(conf)
            
            # Only process detections with confidence >= 0.5 (50%)
            if confidence < 0.5:
                continue
            
            # Check if it's a vehicle type we're tracking
            for vehicle_category, labels in vehicle_types.items():
                if label in labels:
                    vehicle_counts[vehicle_category] += 1
                    total_confidence += confidence
                    detection_count += 1
                    
                    x1, y1, x2, y2 = map(int, xyxy)
                    frame_detections.append({
                        'type': vehicle_category,
                        'confidence': round(confidence * 100, 2),
                        'bbox': [x1, y1, x2, y2]
                    })
                    break
        
        avg_confidence = (total_confidence / detection_count * 100) if detection_count > 0 else 0.0
        
        return {
            'counts': dict(vehicle_counts),
            'total': sum(vehicle_counts.values()),
            'confidence': round(avg_confidence, 2),
            'detections': frame_detections
        }
    except Exception as e:
        print(f"Error processing frame: {e}")
        return None

def detection_loop():
    """Main detection loop running in background thread"""
    global is_detecting, video_cap, current_stats, current_frame_with_detections, is_paused, counting_line

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
            
            result = process_frame(frame)
            if result:
                # Update tracker and check for line crossings with video timestamp
                tracked = update_tracker(result['detections'], frame.shape, timestamp_s)





            # Draw counting line
            cv2.line(frame_copy, counting_line[0], counting_line[1], (0, 0, 255), 2)
            cv2.putText(frame_copy, "Counting Line", 
                       (counting_line[0][0], counting_line[0][1] - 10),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
            
            # Draw bounding boxes and track IDs
            for track_id, track_info in tracked_vehicles.items():
                # Find corresponding detection
                for det in result['detections']:
                    centroid = get_centroid(det['bbox'])
                    if abs(centroid[0] - track_info['last_position'][0]) < 50 and \
                       abs(centroid[1] - track_info['last_position'][1]) < 50:
                        x1, y1, x2, y2 = det['bbox']
                        color = (0, 255, 0) if track_info['counted'] else (255, 0, 0)
                        cv2.rectangle(frame_copy, (x1, y1), (x2, y2), color, 2)
                        label = f"ID:{track_id} {det['type']} {det['confidence']}%"
                        if track_info.get('speed', 0) > 0:
                            label += f" {track_info['speed']:.1f}km/h"
                        if track_info['counted']:
                            label += " [COUNTED]"
                        cv2.putText(frame_copy, label, (x1, y1 - 10), 
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
                        break
            
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

                # Update signal controller with current congestion level
                signal_controller.update_congestion(traffic_data.congestion_level)
                signal_controller.advance_phase()

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
    global is_detecting, video_cap, detection_thread, current_frame_with_detections
    
    try:
        data = request.json
        video_source = data.get('source', 0)  # 0 for webcam, or URL/path
        
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
    global is_detecting, video_cap, tracked_vehicles, current_frame_with_detections, is_paused
    
    try:
        is_detecting = False
        is_paused = False
        if video_cap:
            video_cap.release()
            video_cap = None
        tracked_vehicles.clear()  # Clear tracks when stopping
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
        return jsonify({'success': True, 'paused': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/detect/resume', methods=['POST'])
def resume_detection():
    """Resume processing frames"""
    global is_paused
    try:
        is_paused = False
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



@app.route('/api/counting/line', methods=['POST'])
def set_counting_line():
    """Set the counting line coordinates"""
    global counting_line
    
    try:
        data = request.json
        if 'start' not in data or 'end' not in data:
            return jsonify({'error': 'start and end coordinates required'}), 400
        
        counting_line = [tuple(data['start']), tuple(data['end'])]
        
        # Reset counts when line is changed
        with stats_lock:
            current_stats['vehicle_count'] = 0
            current_stats['counts_by_type'] = {'cars': 0, 'trucks': 0, 'buses': 0, 'bikes': 0}
            tracked_vehicles.clear()
        
        return jsonify({
            'success': True,
            'message': 'Counting line updated',
            'line': counting_line
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/counting/line', methods=['GET'])
def get_counting_line():
    """Get current counting line coordinates"""
    return jsonify({
        'success': True,
        'line': counting_line
    })

@app.route('/api/counting/reset', methods=['POST'])
def reset_count():
    """Reset vehicle count"""
    global tracked_vehicles
    
    with stats_lock:
        current_stats['vehicle_count'] = 0
        current_stats['counts_by_type'] = {'cars': 0, 'trucks': 0, 'buses': 0, 'bikes': 0}
        tracked_vehicles.clear()
    
    return jsonify({
        'success': True,
        'message': 'Count reset'
    })

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

if __name__ == '__main__':
    print("Loading YOLOv5 model...")
    if load_model():
        print("Starting Flask server on http://localhost:5000")
        app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
    else:
        print("Failed to load model. Please check your setup.")

