import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Camera, Car, Truck, Bike, Bus, AlertTriangle, Play, Square, Upload, Loader2, Activity, Gauge, Maximize2, BarChart3 } from "lucide-react";
import { detectionAPI } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const VehicleDetection = () => {
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [detectionData, setDetectionData] = useState({
    totalVehicles: 0,
    cars: 0,
    trucks: 0,
    buses: 0,
    bikes: 0,
    confidence: 0,
    vehicleCount: 0,  // Vehicles that crossed the line
    countsByType: { cars: 0, trucks: 0, buses: 0, bikes: 0 },
    speedStats: {
      averageSpeed: 0,
      maxSpeed: 0,
      minSpeed: 0,
      speedingCount: 0,
      speedByType: { cars: 0, trucks: 0, buses: 0, bikes: 0 }
    },
    speedLimit: 60,
    illegalParking: 2,
    streetVendors: 1
  });

  const [recentDetections, setRecentDetections] = useState<Array<{
    id: number;
    type: string;
    confidence: number;
    timestamp: string;
    location?: string;
  }>>([]);

  const [videoSource, setVideoSource] = useState<string>("");
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [isFullscreenModalOpen, setIsFullscreenModalOpen] = useState<boolean>(false);
  const [position, setPosition] = useState<number>(0);
  const [isSeeking, setIsSeeking] = useState<boolean>(false);
  const seekingRef = useRef<boolean>(false);
  const [frames, setFrames] = useState<number>(0);
  const [fpsLocal, setFpsLocal] = useState<number>(30);
  const [duration, setDuration] = useState<number | null>(null);
  const seekStep = 30; // frames (~1s at 30fps)
  const positionPollRef = useRef<number | null>(null);
  const frameAbortRef = useRef<AbortController | null>(null);
  const positionAbortRef = useRef<AbortController | null>(null);
  const seekAbortRef = useRef<AbortController | null>(null);

  // Traffic data state
  const [trafficData, setTrafficData] = useState<{
    timestamp: string;
    intersection_id: string;
    vehicle_count: number;
    average_speed: number;
    traffic_density: string;
    queue_length: number;
    congestion_level: string;
    last_updated: string;
  } | null>(null);

  // Counting line management
  const [countingLine, setCountingLine] = useState<{start: [number, number], end: [number, number]} | null>(null);
  const [isAdjustingLine, setIsAdjustingLine] = useState(false);
  const [lineAdjustmentMode, setLineAdjustmentMode] = useState<'start' | 'end' | null>(null);
  const seekInFlightRef = useRef<boolean>(false);
  const pendingSeekRef = useRef<{ offsetOrTarget: number; isTarget: boolean } | null>(null);

  // Check backend connection on mount
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const health = await detectionAPI.healthCheck();
        setIsConnected(health.model_loaded);
        if (health.detecting) {
          setIsDetecting(true);
        }
      } catch (error) {
        setIsConnected(false);
        console.error("Backend not connected:", error);
      }
    };
    checkConnection();
  }, []);

  // Poll for stats when detecting
  useEffect(() => {
    if (!isDetecting) return;

    const interval = setInterval(async () => {
      try {
        const response = await detectionAPI.getStats();
        if (response.success && response.data) {
            const speedStats = response.data.speed_stats;
            setDetectionData(prev => ({
              totalVehicles: response.data.total || 0,
              cars: response.data.cars || 0,
              trucks: response.data.trucks || 0,
              buses: response.data.buses || 0,
              bikes: response.data.bikes || 0,
              confidence: response.data.confidence || 0,
              vehicleCount: response.data.vehicle_count || 0,
              countsByType: response.data.counts_by_type || { cars: 0, trucks: 0, buses: 0, bikes: 0 },
              speedStats: speedStats ? {
                averageSpeed: speedStats.average_speed || 0,
                maxSpeed: speedStats.max_speed || 0,
                minSpeed: speedStats.min_speed || 0,
                speedingCount: speedStats.speeding_count || 0,
                speedByType: speedStats.speed_by_type || { cars: 0, trucks: 0, buses: 0, bikes: 0 }
              } : prev.speedStats,
              speedLimit: prev.speedLimit || 60,
              illegalParking: prev.illegalParking, // Keep existing
              streetVendors: prev.streetVendors // Keep existing
            }));
          
          // Update recent detections
          if (response.data.recent_detections) {
            setRecentDetections(
              response.data.recent_detections.map((det: any) => ({
                id: det.id || Date.now(),
                type: det.type,
                confidence: det.confidence,
                timestamp: det.timestamp || new Date().toLocaleTimeString(),
                location: "Camera Feed"
              }))
            );
          }
        }
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
    }, 1000); // Poll every second

    return () => clearInterval(interval);
  }, [isDetecting]);

  // Poll for video frame and position when detecting
  useEffect(() => {
    if (!isDetecting) {
      setCurrentFrame(null);
      setPosition(0);
      setFrames(0);
      setDuration(null);
      if (positionPollRef.current) {
        window.clearInterval(positionPollRef.current);
        positionPollRef.current = null;
      }
      return;
    }

    const frameInterval = setInterval(async () => {
      if (seekingRef.current) return;
      try {
        // Abort previous frame fetch if it exists
        if (frameAbortRef.current) {
          try { frameAbortRef.current.abort(); } catch (e) { /* ignore */ }
        }
        frameAbortRef.current = new AbortController();
        const response = await detectionAPI.getFrame(frameAbortRef.current.signal);
        if (response.success && response.frame) {
          setCurrentFrame(response.frame);
          // field names available: position, frames, fps, duration
          if (typeof (response as any).position === 'number') setPosition((response as any).position);
          if (typeof (response as any).frames === 'number') setFrames((response as any).frames);
          if (typeof (response as any).fps === 'number') setFpsLocal((response as any).fps);
          if (typeof (response as any).duration === 'number') setDuration((response as any).duration);
        }
      } catch (error) {
        if ((error as any)?.name === 'AbortError') return; // expected when aborting
        console.error("Error fetching frame:", error);
      }
    }, 100); // Poll every 100ms for smooth video (~10 FPS)

    // Also poll position at a lower rate to update the timeline when not fetching frames
    positionPollRef.current = window.setInterval(async () => {
      if (seekingRef.current) return;
      try {
        if (positionAbortRef.current) {
          try { positionAbortRef.current.abort(); } catch (e) { /* ignore */ }
        }
        positionAbortRef.current = new AbortController();
        const p = await detectionAPI.getPosition(positionAbortRef.current.signal);
        if (p.success) {
          if (typeof p.position === 'number') setPosition(p.position);
          if (typeof p.frames === 'number') setFrames(p.frames);
          if (typeof p.fps === 'number') setFpsLocal(p.fps);
          if (typeof p.duration === 'number') setDuration(p.duration);
        }
      } catch (e) {
        if ((e as any)?.name === 'AbortError') return;
        // ignore other errors
      }
    }, 1000);

    return () => {
      clearInterval(frameInterval);
      if (positionPollRef.current) {
        window.clearInterval(positionPollRef.current);
        positionPollRef.current = null;
      }
      // abort any pending requests when stopping
      try { frameAbortRef.current?.abort(); } catch (e) { /* ignore */ }
      try { positionAbortRef.current?.abort(); } catch (e) { /* ignore */ }
    };
  }, [isDetecting]);

  // Fetch traffic data periodically
  useEffect(() => {
    const fetchTrafficData = async () => {
      try {
        const result = await detectionAPI.getTrafficData();
        if (result.success && result.data) {
          setTrafficData(result.data);
        }
      } catch (error) {
        console.error('Failed to fetch traffic data:', error);
      }
    };

    fetchTrafficData();
    const interval = setInterval(fetchTrafficData, 2000); // Update every 2 seconds
    return () => clearInterval(interval);
  }, []);

  // Fetch counting line when detection starts
  useEffect(() => {
    const fetchCountingLine = async () => {
      try {
        const result = await detectionAPI.getCountingLine();
        if (result.success && result.line) {
          setCountingLine({
            start: result.line[0],
            end: result.line[1]
          });
        }
      } catch (error) {
        console.error('Failed to fetch counting line:', error);
      }
    };

    if (isDetecting) {
      fetchCountingLine();
    } else {
      setCountingLine(null);
    }
  }, [isDetecting]);

  const handleStartDetection = async () => {
    // reset paused state before starting
    setIsPaused(false);
    if (!videoSource.trim()) {
      toast({
        title: "Error",
        description: "Please enter a video source (URL or file path)",
        variant: "destructive",
      });
      return;
    }

    // Allow numeric camera indexes (webcam) — send as number if applicable
    const sourceToSend: string | number = !isNaN(Number(videoSource)) && videoSource.trim() !== "" ? Number(videoSource) : videoSource;

    setIsLoading(true);
    try {
      const response = await detectionAPI.startDetection(sourceToSend);
      
      if (response.success) {
        setIsDetecting(true);
        toast({
          title: "Detection Started",
          description: "Real-time vehicle detection is now active",
        });
      } else {
        toast({
          title: "Error",
          description: response.error || "Failed to start detection",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error starting detection:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to connect to backend",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopDetection = async () => {
    setIsLoading(true);
    try {
      const response = await detectionAPI.stopDetection();
      if (response.success) {
        setIsDetecting(false);
        setCurrentFrame(null); // Clear video frame when stopping
        setIsPaused(false);
        toast({
          title: "Detection Stopped",
          description: "Real-time detection has been stopped",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to stop detection",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePause = async () => {
    try {
      const r = await detectionAPI.pauseDetection();
      if (r.success) {
        setIsPaused(true);
        toast({ title: 'Paused', description: 'Video paused' });
      }
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to pause', variant: 'destructive' });
    }
  };

  const handleResume = async () => {
    try {
      const r = await detectionAPI.resumeDetection();
      if (!r.success) throw new Error(r.error || 'Resume failed');

      // Poll health a few times to ensure backend cleared paused state
      for (let i = 0; i < 6; i++) {
        const health = await detectionAPI.healthCheck();
        if (health && (health as any).paused === false) {
          setIsPaused(false);
          toast({ title: 'Resumed', description: 'Video resumed' });
          return;
        }
        await new Promise((res) => setTimeout(res, 200));
      }

      // If still paused, show warning
      toast({ title: 'Warning', description: 'Resume requested but backend still paused', variant: 'destructive' });
    } catch (e) {
      toast({ title: 'Error', description: 'Failed to resume', variant: 'destructive' });
    }
  };

  const handleSeek = async (offsetOrTarget: number, isTarget = false) => {
    // If a seek is already running, queue the latest seek (coalesce rapid seeks)
    if (seekInFlightRef.current) {
      pendingSeekRef.current = { offsetOrTarget, isTarget };
      setIsSeeking(true);
      seekingRef.current = true;
      return;
    }

    seekInFlightRef.current = true;

    // if detection is running, pause it before seeking to avoid freezes
    let autoPaused = false;
    if (!isPaused) {
      try {
        const pr = await detectionAPI.pauseDetection();
        if (pr.success) {
          // wait briefly for backend to reflect paused state
          for (let i = 0; i < 6; i++) {
            const h = await detectionAPI.healthCheck();
            if (h && (h as any).paused === true) {
              setIsPaused(true);
              autoPaused = true;
              break;
            }
            await new Promise((res) => setTimeout(res, 150));
          }
        }
      } catch (e) {
        // ignore pause failures; proceed with seek but aborting in-flight requests may still help
      }
    }

    // abort any in-flight frame/position fetches first to avoid overlapping backend operations
    try { frameAbortRef.current?.abort(); } catch (e) { /* ignore */ }
    try { positionAbortRef.current?.abort(); } catch (e) { /* ignore */ }
    // small pause to let backend clear any active decode
    await new Promise((res) => setTimeout(res, 80));

    setIsSeeking(true);
    seekingRef.current = true;
    const prevFrame = currentFrame;
    const prevPos = position;

    // flags to coordinate flow
    let gotFresh = false;
    let skipRetries = false;

    try {
      const startTime = Date.now();

      // create seek abort controller
      try { seekAbortRef.current?.abort(); } catch (e) { /* ignore */ }
      seekAbortRef.current = new AbortController();

      const r = await detectionAPI.seekDetection(offsetOrTarget, isTarget, seekAbortRef.current.signal);

      if (r.success) {
        if (typeof r.position === 'number') setPosition(r.position);

        // First immediate fetch to get a fast response
        try {
          const immediateCtrl = new AbortController();
          const f0 = await detectionAPI.getFrame(immediateCtrl.signal);
          if (f0.success && f0.frame) {
            setCurrentFrame(f0.frame);
            if (typeof f0.position === 'number') setPosition(f0.position);
            if (typeof f0.frames === 'number') setFrames(f0.frames);
            if (typeof f0.fps === 'number') setFpsLocal(f0.fps);
            if (typeof f0.duration === 'number') setDuration(f0.duration);

            if (f0.frame !== prevFrame || (typeof f0.position === 'number' && f0.position !== prevPos)) {
              gotFresh = true;
              skipRetries = true;
            }
          }
        } catch (err) {
          // ignore immediate fetch error
        }

        // Rapid retry loop with tighter timeout: total ~= 1.25s (5 * 250ms + immediate)
        const maxRetries = 5;
        if (!skipRetries) {
          for (let i = 0; i < maxRetries; i++) {
            await new Promise((res) => setTimeout(res, 250));
            try {
              // ensure we use an abortable controller for each retry
              const retryCtrl = new AbortController();
              const f = await detectionAPI.getFrame(retryCtrl.signal);
              if (f.success && f.frame) {
                setCurrentFrame(f.frame);
                if (typeof f.position === 'number') setPosition(f.position);
                if (typeof f.frames === 'number') setFrames(f.frames);
                if (typeof f.fps === 'number') setFpsLocal(f.fps);
                if (typeof f.duration === 'number') setDuration(f.duration);

                // Consider fresh if frame string changed or position changed
                if (f.frame !== prevFrame || (typeof f.position === 'number' && f.position !== prevPos)) {
                  gotFresh = true;
                  break;
                }
              }
            } catch (e) {
              if ((e as any)?.name === 'AbortError') {
                // if aborted externally (new seek), break to let new seek run
                gotFresh = false;
                break;
              }
              // ignore other errors and retry
            }
          }
        }

        const elapsed = Date.now() - startTime;
        if (!gotFresh) {
          // If we didn't get a fresh frame within ~1.25s, do one final quicker position check
          try {
            const p = await detectionAPI.getPosition();
            if (p.success && typeof p.position === 'number') {
              setPosition(p.position);
              if (typeof p.frames === 'number') setFrames(p.frames);
              if (typeof p.fps === 'number') setFpsLocal(p.fps);
              if (typeof p.duration === 'number') setDuration(p.duration);
            }
          } catch (e) {
            // ignore
          }

          // If still no fresh frame, warn but do not block UI for long
          toast({ title: 'Warning', description: `Seek may be slow (took ~${Math.round(elapsed/1000)}s).`, variant: 'destructive' });
        } else {
          toast({ title: 'Seeked', description: `Position: ${r.position}` });
        }
      } else {
        if (r.error === 'aborted') {
          // seek was canceled by another seek; do not show error
        } else {
          toast({ title: 'Error', description: r.error || 'Seek failed', variant: 'destructive' });
        }
      }
    } catch (e) {
      // if aborted, a new seek likely kicked in; swallow the error
      if ((e as any)?.name === 'AbortError') {
        // noop
      } else {
        toast({ title: 'Error', description: 'Seek request failed', variant: 'destructive' });
      }
    } finally {
      // finished this seek; check pending seek and run it immediately
      seekInFlightRef.current = false;
      seekingRef.current = false;

      if (pendingSeekRef.current) {
        const next = pendingSeekRef.current;
        pendingSeekRef.current = null;
        // run next seek shortly after to avoid tight loops
        setTimeout(() => handleSeek(next.offsetOrTarget, next.isTarget), 30);
        return;
      }

      setIsSeeking(false);
      try { seekAbortRef.current?.abort(); } catch (e) { /* ignore */ }
      seekAbortRef.current = null;

      // auto-resume if we auto-paused and no pending seeks
      if (autoPaused && !pendingSeekRef.current) {
        try {
          const rr = await detectionAPI.resumeDetection();
          if (rr.success) {
            // poll health to ensure resumed
            for (let i = 0; i < 6; i++) {
              const h = await detectionAPI.healthCheck();
              if (h && (h as any).paused === false) {
                setIsPaused(false);
                toast({ title: 'Resumed', description: 'Video resumed' });
                break;
              }
              await new Promise((res) => setTimeout(res, 200));
            }
          }
        } catch (e) {
          // ignore resume failures
        }
      }
    }
  };

  const toggleZoom = () => {
    setIsZoomed(prev => !prev);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const response = await detectionAPI.detectImage(file);
      if (response.success && response.data) {
        const speedStats = response.data.speed_stats;
        setDetectionData(prev => ({
          totalVehicles: response.data.total || 0,
          cars: response.data.cars || 0,
          trucks: response.data.trucks || 0,
          buses: response.data.buses || 0,
          bikes: response.data.bikes || 0,
          confidence: response.data.confidence || 0,
          vehicleCount: response.data.vehicle_count || 0,
          countsByType: response.data.counts_by_type || { cars: 0, trucks: 0, buses: 0, bikes: 0 },
          speedStats: speedStats ? {
            averageSpeed: speedStats.average_speed || 0,
            maxSpeed: speedStats.max_speed || 0,
            minSpeed: speedStats.min_speed || 0,
            speedingCount: speedStats.speeding_count || 0,
            speedByType: speedStats.speed_by_type || { cars: 0, trucks: 0, buses: 0, bikes: 0 }
          } : prev.speedStats,
          speedLimit: prev.speedLimit || 60,
          illegalParking: prev.illegalParking,
          streetVendors: prev.streetVendors
        }));
        
        if (response.data.recent_detections) {
          setRecentDetections(
            response.data.recent_detections.map((det: any) => ({
              id: det.id || Date.now(),
              type: det.type,
              confidence: det.confidence,
              timestamp: new Date().toLocaleTimeString(),
              location: "Uploaded Image"
            }))
          );
        }
        
        toast({
          title: "Image Processed",
          description: `Detected ${response.data.total} vehicles`,
        });
      } else {
        toast({
          title: "Error",
          description: response.error || "Failed to process image",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process image",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleVideoClick = async (event: React.MouseEvent<HTMLImageElement>) => {
    if (!isAdjustingLine || !lineAdjustmentMode) return;

    const img = event.currentTarget;
    const rect = img.getBoundingClientRect();

    // Calculate click position relative to the image
    const x = Math.round(event.clientX - rect.left);
    const y = Math.round(event.clientY - rect.top);

    // Convert to actual image coordinates (accounting for object-fit: contain)
    const imgAspectRatio = img.naturalWidth / img.naturalHeight;
    const containerAspectRatio = rect.width / rect.height;

    let scaleX, scaleY, offsetX = 0, offsetY = 0;

    if (imgAspectRatio > containerAspectRatio) {
      // Image is wider than container (letterboxing on top/bottom)
      scaleX = rect.width / img.naturalWidth;
      scaleY = scaleX;
      offsetY = (rect.height - img.naturalHeight * scaleX) / 2;
    } else {
      // Image is taller than container (letterboxing on sides)
      scaleY = rect.height / img.naturalHeight;
      scaleX = scaleY;
      offsetX = (rect.width - img.naturalWidth * scaleY) / 2;
    }

    // Adjust click coordinates for letterboxing
    const adjustedX = Math.max(0, Math.min(img.naturalWidth, (x - offsetX) / scaleX));
    const adjustedY = Math.max(0, Math.min(img.naturalHeight, (y - offsetY) / scaleY));

    const clickPoint: [number, number] = [Math.round(adjustedX), Math.round(adjustedY)];

    try {
      if (lineAdjustmentMode === 'start') {
        // Set start point, keep existing end point
        const endPoint = countingLine?.end || [Math.round(img.naturalWidth * 0.8), Math.round(img.naturalHeight * 0.5)];
        const response = await detectionAPI.setCountingLine(clickPoint, endPoint);
        if (response.success) {
          setCountingLine({ start: clickPoint, end: endPoint });
          toast({ title: "Start Point Set", description: `Position: (${clickPoint[0]}, ${clickPoint[1]})` });
        }
      } else if (lineAdjustmentMode === 'end') {
        // Set end point, keep existing start point
        const startPoint = countingLine?.start || [Math.round(img.naturalWidth * 0.2), Math.round(img.naturalHeight * 0.5)];
        const response = await detectionAPI.setCountingLine(startPoint, clickPoint);
        if (response.success) {
          setCountingLine({ start: startPoint, end: clickPoint });
          toast({ title: "End Point Set", description: `Position: (${clickPoint[0]}, ${clickPoint[1]})` });
        }
      }

      // Auto-switch to the other mode for convenience
      setLineAdjustmentMode(lineAdjustmentMode === 'start' ? 'end' : 'start');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update counting line",
        variant: "destructive",
      });
    }
  };

  const getVehicleIcon = (type: string) => {
    switch (type) {
      case "car": return <Car className="h-4 w-4" />;
      case "truck": return <Truck className="h-4 w-4" />;
      case "bike": return <Bike className="h-4 w-4" />;
      case "bus": return <Bus className="h-4 w-4" />;
      default: return <Car className="h-4 w-4" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return "text-success";
    if (confidence >= 75) return "text-warning";
    return "text-destructive";
  };

  return (
    <Card className="bg-gradient-card shadow-card border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center">
            <Camera className="h-5 w-5 mr-2 text-primary" />
            Vehicle Detection
          </CardTitle>
          <Badge 
            variant="secondary" 
            className={isDetecting ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}
          >
            {isDetecting ? "Active" : isConnected ? "Ready" : "Offline"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Controls */}
        <div className="space-y-3 p-4 bg-secondary/30 rounded-lg">
          <div className="flex items-center gap-2">
            <Input
              type="text"
              placeholder="Video source — URL, file path, or camera index"
              aria-label="Video source"
              value={videoSource}
              onChange={(e) => setVideoSource(e.target.value)}
              className="flex-1"
              disabled={isDetecting}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              variant="outline"
              size="sm"
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Image
            </Button>
            {!isDetecting ? (
              <Button 
                onClick={handleStartDetection} 
                disabled={isLoading || !isConnected}
                size="sm"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Start
              </Button>
            ) : (
              <Button 
                onClick={handleStopDetection} 
                disabled={isLoading}
                variant="destructive"
                size="sm"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Square className="h-4 w-4 mr-2" />
                )}
                Stop
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              aria-label="Upload image file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
          </div>
          {!isConnected && (
            <p className="text-xs text-muted-foreground">
              Backend not connected. Please start the Python server on port 5000.
            </p>
          )}
        </div>

        {/* Video Display */}
        {isDetecting && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Live Video Feed</h4>
            <div className="relative w-full bg-black rounded-lg overflow-hidden border-2 border-primary/20 aspect-video">
              {/* Zoom button top-right - opens fullscreen modal */}
              <button
                title={isFullscreenModalOpen ? 'Close' : 'Open fullscreen'}
                onClick={() => setIsFullscreenModalOpen(true)}
                className="absolute top-2 right-2 z-20 bg-secondary/40 hover:bg-secondary/60 rounded p-1"
              >
                <Maximize2 className="h-4 w-4 text-primary" />
              </button>

              {/* Fullscreen modal */}
              {isFullscreenModalOpen && (
                <div
                  role="dialog"
                  aria-modal="true"
                  className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
                  onClick={() => setIsFullscreenModalOpen(false)}
                >
                  <div className="relative w-full h-full max-w-7xl max-h-full" onClick={(e) => e.stopPropagation()}>
                    <button
                      aria-label="Close fullscreen"
                      className="absolute top-2 right-2 z-50 bg-secondary/20 rounded p-2"
                      onClick={() => setIsFullscreenModalOpen(false)}
                    >
                      ✕
                    </button>
                    {currentFrame ? (
                      <img src={currentFrame} alt="Fullscreen feed" className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Loader2 className="h-12 w-12 animate-spin mb-2" />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {currentFrame ? (
                <img
                  src={currentFrame}
                  alt="Live detection feed"
                  className={`w-full h-full object-contain ${isAdjustingLine ? 'cursor-crosshair' : ''}`}
                  onClick={handleVideoClick}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                    <p className="text-sm">Loading video feed...</p>
                  </div>
                </div>
              )}

              {/* Timeline and playback controls overlay */}
              {isDetecting && (
                <div className="absolute left-1/2 transform -translate-x-1/2 bottom-3 z-20 flex items-center space-x-2 bg-secondary/30 rounded px-2 py-1">
                  <button onClick={() => handleSeek(-seekStep)} disabled={isSeeking} className="btn btn-ghost p-2 rounded bg-muted/30 text-muted-foreground text-sm">◀◀</button>
                  {isPaused ? (
                    <button onClick={handleResume} disabled={isSeeking} className="btn btn-primary px-3 py-1 text-sm">Resume</button>
                  ) : (
                    <button onClick={handlePause} disabled={isSeeking} className="btn btn-outline px-3 py-1 text-sm">Pause</button>
                  )}
                  <button onClick={() => handleSeek(seekStep)} disabled={isSeeking} className="btn btn-ghost p-2 rounded bg-muted/30 text-muted-foreground text-sm">▶▶</button>
                  {isSeeking && (
                    <div className="flex items-center ml-2 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      Seeking...
                    </div>
                  )}
                </div>
              )}

              {/* Timeline bar */}
              <div className="absolute left-0 right-0 bottom-12 px-4 z-20">
                <div className="flex items-center space-x-2">
                  <div className="text-xs text-muted-foreground">{formatTimeFromFrames(position, fpsLocal)}</div>
                  <input
                    type="range"
                    aria-label="Video timeline"
                    min={0}
                    max={Math.max(0, frames - 1)}
                    value={position}
                    onChange={async (e) => {
                      const target = Number(e.target.value);
                      setPosition(target);
                      // seek to absolute target
                      await handleSeek(target, true);
                    }}
                    disabled={isSeeking}
                    className="flex-1"
                  />
                  <div className="text-xs text-muted-foreground">{formatTimeFromSeconds(duration)}</div>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Real-time vehicle detection with bounding boxes and tracking IDs
            </p>
          </div>
        )}

        {/* Detection Stats - Current Frame */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Current Frame Detection</h4>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Car className="h-5 w-5 text-primary mr-1" />
              </div>
              <div className="text-2xl font-bold text-primary">{detectionData.cars}</div>
              <div className="text-xs text-muted-foreground">Cars in Frame</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Truck className="h-5 w-5 text-success mr-1" />
              </div>
              <div className="text-2xl font-bold text-success">{detectionData.trucks}</div>
              <div className="text-xs text-muted-foreground">Trucks in Frame</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Bike className="h-5 w-5 text-warning mr-1" />
              </div>
              <div className="text-2xl font-bold text-warning">{detectionData.bikes}</div>
              <div className="text-xs text-muted-foreground">Bikes in Frame</div>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <Bus className="h-5 w-5 text-warning mr-1" />
              </div>
              <div className="text-2xl font-bold text-warning">{detectionData.buses}</div>
              <div className="text-xs text-muted-foreground">Buses in Frame</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Shows vehicles currently detected in the frame (real-time)
          </p>
        </div>

        {/* Counting Line Management */}
        {isDetecting && countingLine && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-medium flex items-center">
              <Gauge className="h-4 w-4 mr-2 text-primary" />
              Counting Line Configuration
            </h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-muted-foreground mb-1">Start Point</div>
                <div className="font-mono bg-secondary/30 px-2 py-1 rounded">
                  ({countingLine.start[0]}, {countingLine.start[1]})
                </div>
              </div>
              <div>
                <div className="text-muted-foreground mb-1">End Point</div>
                <div className="font-mono bg-secondary/30 px-2 py-1 rounded">
                  ({countingLine.end[0]}, {countingLine.end[1]})
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setIsAdjustingLine(!isAdjustingLine)}
                variant={isAdjustingLine ? "default" : "outline"}
                size="sm"
                className="flex-1"
              >
                {isAdjustingLine ? "Cancel Adjustment" : "Adjust Line"}
              </Button>
              <Button
                onClick={async () => {
                  const response = await detectionAPI.resetCount();
                  if (response.success) {
                    toast({ title: "Count Reset", description: "Vehicle count has been reset" });
                  }
                }}
                variant="outline"
                size="sm"
              >
                Reset Count
              </Button>
            </div>
            {isAdjustingLine && (
              <div className="bg-secondary/20 rounded-lg p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  Click on the video to set the counting line position. First click sets start point, second click sets end point.
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setLineAdjustmentMode('start')}
                    variant={lineAdjustmentMode === 'start' ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                  >
                    Set Start
                  </Button>
                  <Button
                    onClick={() => setLineAdjustmentMode('end')}
                    variant={lineAdjustmentMode === 'end' ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                  >
                    Set End
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Vehicle Count (Line Crossing) */}
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium flex items-center">
              <Activity className="h-4 w-4 mr-2 text-primary" />
              Total Vehicles Counted (Line Crossing)
            </h4>
            {!isDetecting && (
              <Button
                onClick={async () => {
                  const response = await detectionAPI.resetCount();
                  if (response.success) {
                    toast({ title: "Count Reset", description: "Vehicle count has been reset" });
                  }
                }}
                variant="outline"
                size="sm"
              >
                Reset
              </Button>
            )}
          </div>
          <div className="text-3xl font-bold text-primary mb-2">{detectionData.vehicleCount}</div>
          <p className="text-xs text-muted-foreground mb-3">
            Cumulative count of vehicles that crossed the counting line
          </p>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div className="text-center">
              <div className="font-semibold text-primary">{detectionData.countsByType.cars}</div>
              <div className="text-muted-foreground">Cars</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-success">{detectionData.countsByType.trucks}</div>
              <div className="text-muted-foreground">Trucks</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-warning">{detectionData.countsByType.buses || 0}</div>
              <div className="text-muted-foreground">Buses</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-warning">{detectionData.countsByType.bikes}</div>
              <div className="text-muted-foreground">Bikes</div>
            </div>
          </div>
        </div>

        {/* Speed Statistics */}
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-medium flex items-center">
            <Gauge className="h-4 w-4 mr-2 text-primary" />
            Speed Statistics
          </h4>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Average</div>
              <div className="text-xl font-bold text-primary">
                {(detectionData.speedStats?.averageSpeed || 0).toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground">km/h</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Max</div>
              <div className="text-xl font-bold text-warning">
                {(detectionData.speedStats?.maxSpeed || 0).toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground">km/h</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Speeding</div>
              <div className="text-xl font-bold text-destructive">
                {detectionData.speedStats?.speedingCount || 0}
              </div>
              <div className="text-xs text-muted-foreground">vehicles</div>
            </div>
          </div>
          <div className="pt-2 border-t border-primary/20">
            <div className="text-xs text-muted-foreground mb-2">Speed by Type</div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div>
                <div className="font-semibold text-primary">
                  {(detectionData.speedStats?.speedByType?.cars || 0).toFixed(1)} km/h
                </div>
                <div className="text-muted-foreground">Cars</div>
              </div>
              <div>
                <div className="font-semibold text-success">
                  {(detectionData.speedStats?.speedByType?.trucks || 0).toFixed(1)} km/h
                </div>
                <div className="text-muted-foreground">Trucks</div>
              </div>
              <div>
                <div className="font-semibold text-warning">
                  {(detectionData.speedStats?.speedByType?.buses || 0).toFixed(1)} km/h
                </div>
                <div className="text-muted-foreground">Buses</div>
              </div>
              <div>
                <div className="font-semibold text-warning">
                  {(detectionData.speedStats?.speedByType?.bikes || 0).toFixed(1)} km/h
                </div>
                <div className="text-muted-foreground">Bikes</div>
              </div>
            </div>
          </div>
        </div>

        {/* Traffic Data Analytics */}
        {trafficData && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-medium flex items-center">
              <BarChart3 className="h-4 w-4 mr-2 text-primary" />
              Traffic Data Analytics
            </h4>
            <div className="grid grid-cols-2 gap-6 text-center">
              <div>
                <div className="text-xs text-muted-foreground mb-2">Traffic Density</div>
                <Badge
                  variant="secondary"
                  className={
                    trafficData.traffic_density === 'HIGH' ? 'bg-destructive/20 text-destructive border-destructive/30 text-sm px-3 py-1' :
                    trafficData.traffic_density === 'MEDIUM' ? 'bg-warning/20 text-warning border-warning/30 text-sm px-3 py-1' :
                    'bg-success/20 text-success border-success/30 text-sm px-3 py-1'
                  }
                >
                  {trafficData.traffic_density}
                </Badge>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-2">Congestion Level</div>
                <Badge
                  variant="secondary"
                  className={
                    trafficData.congestion_level === 'SEVERE' ? 'bg-destructive/20 text-destructive border-destructive/30 text-sm px-3 py-1' :
                    trafficData.congestion_level === 'MODERATE' ? 'bg-warning/20 text-warning border-warning/30 text-sm px-3 py-1' :
                    'bg-success/20 text-success border-success/30 text-sm px-3 py-1'
                  }
                >
                  {trafficData.congestion_level}
                </Badge>
              </div>
            </div>
            <div className="text-xs text-muted-foreground text-center">
              Last Updated: {new Date(trafficData.last_updated).toLocaleTimeString()}
            </div>
          </div>
        )}

        {/* AI Confidence */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>AI Confidence</span>
            <span className={getConfidenceColor(detectionData.confidence)}>
              {detectionData.confidence.toFixed(1)}%
            </span>
          </div>
          <Progress 
            value={detectionData.confidence} 
            className="h-2" 
          />
        </div>

        {/* Violations */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center">
            <AlertTriangle className="h-4 w-4 mr-2 text-destructive" />
            Active Violations
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <div className="text-lg font-bold text-destructive">{detectionData.illegalParking}</div>
              <div className="text-xs text-muted-foreground">Illegal Parking</div>
            </div>
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-3">
              <div className="text-lg font-bold text-warning">{detectionData.streetVendors}</div>
              <div className="text-xs text-muted-foreground">Street Vendors</div>
            </div>
          </div>
        </div>

        {/* Recent Detections */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Recent Detections</h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {recentDetections.map((detection) => (
              <div key={detection.id} className="flex items-center justify-between text-xs bg-secondary/30 rounded-md p-2">
                <div className="flex items-center space-x-2">
                  {getVehicleIcon(detection.type)}
                  <span className="capitalize">{detection.type}</span>
                  <span className="text-muted-foreground">@{detection.location}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={getConfidenceColor(detection.confidence)}>
                    {detection.confidence}%
                  </span>
                  <span className="text-muted-foreground">{detection.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Helper formatting
function formatTimeFromFrames(frames: number, fps: number) {
  if (!frames || !fps) return '00:00';
  const seconds = Math.floor(frames / fps);
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function formatTimeFromSeconds(seconds: number | null) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default VehicleDetection;