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

  async setCountingLine(start: [number, number], end: [number, number]): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/counting/line`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ start, end }),
      });
      return response.json();
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async getCountingLine(): Promise<{ success: boolean; line?: [[number, number], [number, number]]; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/counting/line`);
      if (!response.ok) {
        return { success: false, error: 'Failed to fetch counting line' };
      }
      return response.json();
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Network error'
      };
    }
  }

  async resetCount(): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/counting/reset`, {
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

