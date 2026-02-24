const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface DetectionStats {
  cars: number;
  trucks: number;
  buses: number;
  bikes: number;
  total: number;
  confidence: number;
  vehicle_count?: number;  // Total vehicles that crossed the line
  counts_by_type?: {
    cars: number;
    trucks: number;
    buses: number;
    bikes: number;
  };
  speed_stats?: {
    average_speed: number;
    max_speed: number;
    min_speed: number;
    speeding_count: number;
    speed_by_type: {
      cars: number;
      trucks: number;
      buses: number;
      bikes: number;
    };
  };
  recent_detections: Array<{
    id: number;
    type: string;
    confidence: number;
    timestamp: string;
    bbox?: number[];
  }>;
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  impact: string;
  action: string;
  status: 'ACTIVE' | 'RESOLVED';
  timestamp: number;
  formatted_time: string;
}

export interface DetectionResponse {
  success: boolean;
  data: DetectionStats;
  error?: string;
}

class DetectionAPI {

  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  async healthCheck(): Promise<{ status: string; model_loaded: boolean; detecting: boolean }> {
    const response = await fetch(`${this.baseUrl}/api/health`);
    return response.json();
  }

  async detectImage(imageFile: File): Promise<DetectionResponse> {
    const formData = new FormData();
    formData.append('image', imageFile);

    const response = await fetch(`${this.baseUrl}/api/detect/image`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Detection failed', data: this.getEmptyStats() };
    }

    return response.json();
  }

  async startDetection(source: string | number = 0): Promise<{ success: boolean; message?: string; error?: string }> {
    const response = await fetch(`${this.baseUrl}/api/detect/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ source }),
    });

    return response.json();
  }

  async stopDetection(): Promise<{ success: boolean; message?: string; error?: string }> {
    const response = await fetch(`${this.baseUrl}/api/detect/stop`, {
      method: 'POST',
    });

    return response.json();
  }

  async pauseDetection(): Promise<{ success: boolean; paused?: boolean; error?: string }> {
    const response = await fetch(`${this.baseUrl}/api/detect/pause`, {
      method: 'POST',
    });
    return response.json();
  }

  async resumeDetection(): Promise<{ success: boolean; paused?: boolean; error?: string }> {
    const response = await fetch(`${this.baseUrl}/api/detect/resume`, {
      method: 'POST',
    });
    return response.json();
  }

  async seekDetection(offsetOrTarget: number, isTarget = false, signal?: AbortSignal): Promise<{ success: boolean; position?: number; error?: string }> {
    const body: any = isTarget ? { target: offsetOrTarget } : { offset: offsetOrTarget };
    try {
      const response = await fetch(`${this.baseUrl}/api/detect/seek`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Seek failed' }));
        return { success: false, error: error.error || 'Seek failed' };
      }
      return response.json();
    } catch (error) {
      if ((error as any)?.name === 'AbortError') return { success: false, error: 'aborted' };
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  async getPosition(signal?: AbortSignal): Promise<{ success: boolean; position?: number; frames?: number; fps?: number; duration?: number; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/detect/frame`, { signal });
      if (!response.ok) return { success: false, error: 'Failed to fetch position' };
      const data = await response.json();
      return {
        success: true,
        position: data.position,
        frames: data.frames,
        fps: data.fps,
        duration: data.duration
      };
    } catch (error) {
      if ((error as any)?.name === 'AbortError') return { success: false, error: 'aborted' };
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  async getStats(): Promise<DetectionResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/detect/stats`);
      if (!response.ok) {
        return { success: false, error: 'Failed to fetch stats', data: this.getEmptyStats() };
      }
      return response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
        data: this.getEmptyStats()
      };
    }
  }

  async getFrame(signal?: AbortSignal): Promise<{ success: boolean; frame?: string; position?: number; frames?: number; fps?: number; duration?: number; stats?: any; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/detect/frame`, { signal });
      if (!response.ok) {
        return { success: false, error: 'Failed to fetch frame' };
      }
      return response.json();
    } catch (error) {
      if ((error as any)?.name === 'AbortError') return { success: false, error: 'aborted' };
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async resetAnalytics(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/analytics/reset`, {
        method: 'POST',
      });
      return response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async getRoiConfig(cameraId: string): Promise<{ success: boolean; data?: { camera_id: string; rois: Record<string, number[][]> }; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/roi-config?camera_id=${encodeURIComponent(cameraId)}`);
      if (!response.ok) {
        return { success: false, error: 'Failed to fetch ROI config' };
      }
      return response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async setRoiConfig(cameraId: string, rois: Record<string, number[][]>): Promise<{ success: boolean; data?: any; message?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/roi-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ camera_id: cameraId, rois }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to save ROI config' }));
        return { success: false, error: error.error || 'Failed to save ROI config' };
      }
      return response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async calibrateSpeed(pixelToMeterRatio?: number, speedLimitKmh?: number): Promise<{
    success: boolean;
    message?: string;
    pixel_to_meter_ratio?: number;
    speed_limit_kmh?: number;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/speed/calibrate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pixel_to_meter_ratio: pixelToMeterRatio,
          speed_limit_kmh: speedLimitKmh,
        }),
      });
      return response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async getSpeedStats(): Promise<{
    success: boolean;
    data?: {
      average_speed: number;
      max_speed: number;
      min_speed: number;
      speeding_count: number;
      speed_by_type: {
        cars: number;
        trucks: number;
        buses: number;
        bikes: number;
      };
    };
    speed_limit_kmh?: number;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/speed/stats`);
      if (!response.ok) {
        return { success: false, error: 'Failed to fetch speed stats' };
      }
      return response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async getTrafficData(): Promise<{
    success: boolean;
    data?: {
      timestamp: string;
      intersection_id: string;
      vehicle_count: number;
      average_speed: number;
      traffic_density: string;
      queue_length: number;
      congestion_level: string;
      last_updated: string;
    };
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/traffic/data`);
      if (!response.ok) {
        return { success: false, error: 'Failed to fetch traffic data' };
      }
      return response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async getMinuteVehicleCount(): Promise<{
    success: boolean;
    data?: Record<string, number>; // e.g., {"14:01": 5, "14:02": 8, "14:03": 6}
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/minute-vehicle-count`);
      if (!response.ok) {
        return { success: false, error: 'Failed to fetch minute vehicle count' };
      }
      return response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async getRoadType(): Promise<{
    success: boolean;
    data?: {
      type: string;
      configured: boolean;
      last_updated: string | null;
      description: string;
    };
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/road-type`);
      if (!response.ok) {
        return { success: false, error: 'Failed to fetch road type data' };
      }
      return response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async getWeather(): Promise<{
    success: boolean;
    data?: {
      condition: string;
      visibility: string;
      time_of_day: string;
      confidence: number;
      last_updated: string | null;
    };
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/weather`);
      if (!response.ok) {
        return { success: false, error: 'Failed to fetch weather data' };
      }
      return response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async getEmergencyStatus(): Promise<{
    success: boolean;
    data?: {
      emergency: boolean;
      priority_direction: string | null;
      road_mode: string;
      signal_states: Record<string, string>;
      ambulance_detected: boolean;
    };
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/emergency-status`);
      if (!response.ok) {
        return { success: false, error: 'Failed to fetch emergency status' };
      }
      return response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async getAlerts(): Promise<{
    success: boolean;
    data?: Alert[];
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/alerts`);
      if (!response.ok) {
        return { success: false, error: 'Failed to fetch alerts' };
      }
      return response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async getMetrics(): Promise<{
    success: boolean;
    data?: {
      efficiency_improvement: number;
      average_wait_time: number | null;
      vehicle_throughput_last_min: number;
    };
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/metrics`);
      if (!response.ok) {
        return { success: false, error: 'Failed to fetch metrics' };
      }
      return response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async getRoadConfig(): Promise<{
    success: boolean;
    data?: {
      road_mode: string;
      allowed_directions: string[];
      configured: boolean;
      last_updated: string | null;
    };
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/road-config`);
      if (!response.ok) {
        return { success: false, error: 'Failed to fetch road config' };
      }
      return response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async setRoadConfig(roadMode: string, allowedDirections: string[]): Promise<{
    success: boolean;
    data?: any;
    message?: string;
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/road-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          road_mode: roadMode,
          allowed_directions: allowedDirections
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error || 'Failed to set road config' };
      }
      return response.json();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }


  private getEmptyStats(): DetectionStats {
    return {
      cars: 0,
      trucks: 0,
      buses: 0,
      bikes: 0,
      total: 0,
      confidence: 0,
      vehicle_count: 0,
      counts_by_type: { cars: 0, trucks: 0, buses: 0, bikes: 0 },
      recent_detections: [],
    };
  }
}

export const detectionAPI = new DetectionAPI();
