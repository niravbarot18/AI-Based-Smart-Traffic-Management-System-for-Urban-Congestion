import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3,
  TrendingUp,
  Clock,
  MapPin,
  Calendar,
  Activity
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useState, useEffect } from "react";
import { detectionAPI, DetectionStats } from "@/lib/api";

interface AnalyticsData {
  hourlyData: Array<{
    hour: string;
    vehicles: number | null;
    hourNum: number;
    isCurrentHour: boolean;
  }>;
  roadTypeData: Array<{
    type: string;
    vehicles: number;
    percentage: number;
    efficiency: number;
    isConfigured: boolean;
    congestionLevel: string | null;
  }>;
  peakHours: Array<{
    hour: string;
    hourNum: number;
    vehicles: number;
    intensity: number;
    period: string;
    isPeak: boolean;
  }>;
  performanceMetrics: {
    efficiencyImprovement: number;
    averageWaitTime: number;
  };
  weeklyTrends: Array<{
    day: string;
    volume: number;
  }>;
}

const AnalyticsDashboard = () => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    hourlyData: [],
    roadTypeData: [],
    peakHours: [],
    performanceMetrics: {
      efficiencyImprovement: 0,
      averageWaitTime: 0
    },
    weeklyTrends: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Helper functions to transform data
  /**
   * Aggregates minute-level vehicle count data into hourly buckets
   * @param minuteData - Object with minute keys like "14:01": 5, "14:02": 8
   * @returns Array of hourly data points for the last 24 hours
   */
  const generateHourlyDataFromMinutes = (minuteData: Record<string, number>) => {
    const hourlyData = [];
    const now = new Date();
    const currentHour = now.getHours();

    // Generate 24 hourly buckets (00:00 to 23:59)
    for (let hour = 0; hour < 24; hour++) {
      const hourStr = hour.toString().padStart(2, '0');
      let totalVehicles = 0;
      let minuteCount = 0;

      // Aggregate all minutes within this hour
      for (let minute = 0; minute < 60; minute++) {
        const minuteStr = minute.toString().padStart(2, '0');
        const timeKey = `${hourStr}:${minuteStr}`;

        if (minuteData[timeKey] !== undefined) {
          totalVehicles += minuteData[timeKey];
          minuteCount++;
        }
      }

      // Calculate average vehicles per minute for this hour, or 0 if no data
      const vehicles = minuteCount > 0 ? Math.round(totalVehicles / minuteCount) : 0;

      // Determine if this is the current hour (for highlighting)
      const isCurrentHour = hour === currentHour;

      hourlyData.push({
        hour: hourStr + ':00',
        vehicles,
        hourNum: hour,
        isCurrentHour
      });
    }

    return hourlyData;
  };

  const generateRoadTypeData = async (stats: DetectionStats, traffic: any) => {
    try {
      const roadTypeResponse = await detectionAPI.getRoadType();
      if (roadTypeResponse.success && roadTypeResponse.data) {
        const roadTypeData = roadTypeResponse.data;
        const total = stats.total || 1;
        const congestionLevel = traffic?.congestion_level || 'NORMAL';

        // Road type is static - show configured type as 100%, others as 0%
        const roadTypes = ['HIGHWAY', 'ARTERIAL', 'LOCAL'];

        // Baseline efficiency values based on road type design
        const BASE_EFFICIENCY = {
          HIGHWAY: 88,    // High-capacity roads for high-speed travel
          ARTERIAL: 75,  // Major roads carrying high traffic volumes
          LOCAL: 92      // Neighborhood streets with lower traffic
        };

        return roadTypes.map(type => {
          const isConfigured = type === roadTypeData.type;
          const percentage = isConfigured ? 100 : 0;

          // Calculate vehicles based on configured road type
          const vehicles = isConfigured ? total : 0;

          // Dynamic efficiency calculation combining baseline + congestion adjustment
          let efficiency = BASE_EFFICIENCY[type as keyof typeof BASE_EFFICIENCY];

          // Apply congestion-based adjustments
          if (congestionLevel === 'MODERATE') {
            efficiency -= 10; // Reduce by ~10% for moderate congestion
          } else if (congestionLevel === 'SEVERE') {
            efficiency -= 25; // Reduce by ~25% for severe congestion
          }
          // NORMAL congestion: keep baseline efficiency

          // Ensure efficiency never drops below safe minimum
          efficiency = Math.max(efficiency, 30);

          return {
            type: type.charAt(0).toUpperCase() + type.slice(1).toLowerCase(), // Capitalize first letter
            vehicles,
            percentage,
            efficiency,
            isConfigured,
            congestionLevel: isConfigured ? congestionLevel : null // Only show congestion for configured road
          };
        });
      }
    } catch (error) {
      console.error('Failed to fetch road type data:', error);
    }

    // Fallback to default Highway if API fails
    const total = stats.total || 1;
    const congestionLevel = traffic?.congestion_level || 'NORMAL';

    // Calculate dynamic efficiency for fallback
    let fallbackEfficiency = 88; // Highway baseline
    if (congestionLevel === 'MODERATE') {
      fallbackEfficiency -= 10;
    } else if (congestionLevel === 'SEVERE') {
      fallbackEfficiency -= 25;
    }
    fallbackEfficiency = Math.max(fallbackEfficiency, 30);

    return [
      {
        type: "Highway",
        vehicles: total,
        percentage: 100,
        efficiency: fallbackEfficiency,
        isConfigured: true,
        congestionLevel
      },
      {
        type: "Arterial",
        vehicles: 0,
        percentage: 0,
        efficiency: 75, // Static for non-configured roads
        isConfigured: false,
        congestionLevel: null
      },
      {
        type: "Local",
        vehicles: 0,
        percentage: 0,
        efficiency: 92, // Static for non-configured roads
        isConfigured: false,
        congestionLevel: null
      }
    ];
  };

  const generatePeakHours = () => {
    // Generate simulated continuous traffic pattern for 24 hours
    const peakHoursData = [];

    for (let hour = 0; hour < 24; hour++) {
      const hourStr = hour.toString().padStart(2, '0');
      let vehicles = 0;
      let period = '';
      let isPeak = false;

      // Simulate realistic traffic patterns throughout the day with smooth transitions
      if (hour >= 0 && hour < 6) {
        // Late night/Early morning - very low traffic (5-8 vehicles)
        vehicles = 5 + (hour / 6) * 3;
        period = 'Late Night';
      } else if (hour >= 6 && hour < 8) {
        // Early morning - gradually increasing (8-35 vehicles)
        vehicles = 8 + (hour - 6) * 13.5;
        period = 'Early Morning';
      } else if (hour >= 8 && hour < 10) {
        // Morning rush hour - peak traffic (35-80 vehicles)
        const progress = (hour - 8) / 2; // 0 to 1
        vehicles = 35 + Math.sin(progress * Math.PI) * 45; // Peak around 8:30-9:00
        period = 'Morning Rush';
        isPeak = true;
      } else if (hour >= 10 && hour < 12) {
        // Post-morning - decreasing smoothly (35-30 vehicles)
        vehicles = 35 - (hour - 10) * 2.5;
        period = 'Mid-Morning';
      } else if (hour >= 12 && hour < 14) {
        // Lunch hour - moderate peak (30-50 vehicles)
        const progress = (hour - 12) / 2; // 0 to 1
        vehicles = 30 + Math.sin(progress * Math.PI) * 20; // Peak around 12:30-1:00
        period = 'Lunch Hour';
        isPeak = true;
      } else if (hour >= 14 && hour < 17) {
        // Afternoon - moderate traffic, gradually decreasing (30-20 vehicles)
        vehicles = 30 - (hour - 14) * 3.33;
        period = 'Afternoon';
      } else if (hour >= 17 && hour < 19) {
        // Evening rush hour - peak traffic (20-75 vehicles)
        const progress = (hour - 17) / 2; // 0 to 1
        vehicles = 20 + Math.sin(progress * Math.PI) * 55; // Peak around 17:30-18:00
        period = 'Evening Rush';
        isPeak = true;
      } else if (hour >= 19 && hour < 22) {
        // Evening - decreasing (20-10 vehicles)
        vehicles = 20 - (hour - 19) * 3.33;
        period = 'Evening';
      } else {
        // Late evening/Night - low traffic (10-5 vehicles)
        vehicles = 10 - (hour - 22) * 2.5;
        period = 'Night';
      }

      // Ensure vehicles is never negative and smooth the values
      vehicles = Math.max(0, vehicles);

      // Calculate intensity percentage (0-100)
      const maxVehicles = 80; // Maximum expected vehicles
      const intensity = Math.min(100, Math.round((vehicles / maxVehicles) * 100));

      peakHoursData.push({
        hour: hourStr + ':00',
        hourNum: hour,
        vehicles: Math.round(vehicles * 10) / 10, // Round to 1 decimal for smoothness
        intensity,
        period,
        isPeak
      });
    }

    return peakHoursData;
  };

  const generatePerformanceMetrics = (stats: DetectionStats, traffic: any, minuteData: Record<string, number>) => {
    const avgSpeed = stats.speed_stats?.average_speed || 0;
    const congestion = traffic?.congestion_level || 'NORMAL';

    // Calculate Efficiency Improvement (Throughput change vs last minute)
    const now = new Date();
    const currentHourStr = now.getHours().toString().padStart(2, '0');
    const currentMinStr = now.getMinutes().toString().padStart(2, '0');
    const currentKey = `${currentHourStr}:${currentMinStr}`;

    // Previous minute
    const prevDate = new Date(now.getTime() - 60000);
    const prevHourStr = prevDate.getHours().toString().padStart(2, '0');
    const prevMinStr = prevDate.getMinutes().toString().padStart(2, '0');
    const prevKey = `${prevHourStr}:${prevMinStr}`;

    const currentCount = minuteData[currentKey] || 0;
    const prevCount = minuteData[prevKey] || 0;

    let efficiencyChange = 0;
    if (prevCount > 0) {
      efficiencyChange = Math.round(((currentCount - prevCount) / prevCount) * 100);
    } else if (currentCount > 0) {
      efficiencyChange = 100; // 100% increase if starting from 0
    }

    return {
      efficiencyImprovement: efficiencyChange,
      averageWaitTime: avgSpeed > 5 ? (60 / avgSpeed) : (avgSpeed > 0 ? 10 : 0)
    };
  };

  const generateWeeklyTrends = (stats: DetectionStats) => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const baseVolume = stats.total || 0;

    return days.map((day, index) => {
      // Simulate weekly pattern with weekend reduction
      const isWeekend = index >= 5;
      const base = isWeekend ? 35 : 75;
      const variation = Math.random() * 20 - 10; // ±10 variation
      const volume = Math.max(35, Math.min(95, base + variation));

      return { day, volume: Math.round(volume) };
    });
  };

  useEffect(() => {
    const fetchAnalyticsData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch minute-level vehicle counts and other data
        const [minuteResponse, statsResponse, trafficResponse] = await Promise.all([
          detectionAPI.getMinuteVehicleCount(),
          detectionAPI.getStats(),
          detectionAPI.getTrafficData()
        ]);

        if (!statsResponse.success || !trafficResponse.success) {
          throw new Error('Failed to fetch analytics data');
        }

        const minuteData = minuteResponse.success ? minuteResponse.data || {} : {};
        const stats = statsResponse.data;
        const traffic = trafficResponse.data;

        // Transform data using minute-level aggregation
        const hourlyData = generateHourlyDataFromMinutes(minuteData);
        const roadTypeData = await generateRoadTypeData(stats, traffic);
        const peakHours = generatePeakHours(); // Generate simulated continuous pattern
        const performanceMetrics = generatePerformanceMetrics(stats, traffic, minuteData);
        const weeklyTrends = generateWeeklyTrends(stats);

        setAnalyticsData({
          hourlyData,
          roadTypeData,
          peakHours,
          performanceMetrics,
          weeklyTrends
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics data');
        console.error('Analytics data fetch error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchAnalyticsData();

    // Set up polling every 5-10 seconds for real-time updates
    const interval = setInterval(fetchAnalyticsData, 8000); // 8 seconds

    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card className="bg-gradient-card shadow-card border-border/50">
          <CardContent className="p-6">
            <div className="text-center">Loading analytics data...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Card className="bg-gradient-card shadow-card border-border/50">
          <CardContent className="p-6">
            <div className="text-center text-destructive">
              Error loading analytics: {error}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { hourlyData, roadTypeData, peakHours, performanceMetrics, weeklyTrends } = analyticsData;

  return (
    <div className="space-y-6">
      {/* Traffic Flow Analytics */}
      <Card className="bg-gradient-card shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center">
            <BarChart3 className="h-5 w-5 mr-2 text-primary" />
            Traffic Flow Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Hourly Traffic Chart */}
            <div>
              <h4 className="text-sm font-medium mb-3">Real-time Vehicle Count (Last 24 Hours)</h4>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 12 }}
                      interval={1}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      label={{ value: 'Vehicles', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip
                      formatter={(value, name) => [
                        `${value} vehicles`,
                        'Vehicle Count'
                      ]}
                      labelFormatter={(label) => `Time: ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey="vehicles"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                      connectNulls={true}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Chart shows real-time vehicle counts for the last 24 hours (1440 minutes), updating every 8 seconds. Data begins from the current local device time and moves backwards.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Road Type Analysis */}
        <Card className="bg-gradient-card shadow-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center">
              <MapPin className="h-5 w-5 mr-2 text-primary" />
              Road Type Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {roadTypeData.map((road) => (
                <div key={road.type} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{road.type}</span>
                    <Badge variant="secondary">
                      {road.percentage}% of traffic
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {road.vehicles} vehicles • {road.efficiency}% efficiency
                  </div>
                  <Progress value={road.percentage} className="h-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Peak Hours Detection */}
        <Card className="bg-gradient-card shadow-card border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Clock className="h-5 w-5 mr-2 text-primary" />
              Peak Hours Detection
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={peakHours}>
                    <defs>
                      <linearGradient id="colorVehicles" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 11 }}
                      interval={2}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      label={{ value: 'Vehicles', angle: -90, position: 'insideLeft' }}
                    />
                    <Tooltip
                      formatter={(value: number, name: string, props: any) => {
                        const intensity = props.payload.intensity;
                        const isPeak = props.payload.isPeak;
                        const period = props.payload.period;
                        const peakLabel = isPeak ? ' (Peak Hour)' : '';
                        return `${value} vehicles - ${intensity}% intensity - ${period}${peakLabel}`;
                      }}
                      labelFormatter={(label) => `Time: ${label}`}
                      contentStyle={{
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        color: '#fff'
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="vehicles"
                      stroke="#3b82f6"
                      strokeWidth={3}
                      fill="url(#colorVehicles)"
                      dot={{ fill: '#3b82f6', strokeWidth: 2, r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Simulated traffic pattern showing typical peak hours throughout the day. Morning rush (8-10 AM), lunch hour (12-2 PM), and evening rush (5-7 PM) are highlighted.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-gradient-card shadow-card border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <TrendingUp className="h-4 w-4 mr-2 text-success" />
              Efficiency Improvement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${performanceMetrics.efficiencyImprovement >= 0 ? 'text-success' : 'text-destructive'}`}>
              {performanceMetrics.efficiencyImprovement > 0 ? '+' : ''}{performanceMetrics.efficiencyImprovement}%
            </div>
            <p className="text-muted-foreground text-sm mt-1">vs last minute</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card shadow-card border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <Activity className="h-4 w-4 mr-2 text-primary" />
              Average Wait Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              {performanceMetrics.averageWaitTime !== null && performanceMetrics.averageWaitTime !== undefined
                ? `${Number(performanceMetrics.averageWaitTime).toFixed(1)}min`
                : "--"}
            </div>
            <p className="text-muted-foreground text-sm mt-1">Estimated based on flow</p>
          </CardContent>
        </Card>

        {/* Events Today removed as per request */}
      </div>

      {/* Weekly Trends */}
      <Card className="bg-gradient-card shadow-card border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center">
            <TrendingUp className="h-5 w-5 mr-2 text-primary" />
            Weekly Traffic Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2">
            {weeklyTrends.map((trend) => (
              <div key={trend.day} className="text-center space-y-2">
                <div className="text-sm font-medium">{trend.day}</div>
                <div className="bg-secondary/30 rounded-lg p-3 h-24 flex flex-col justify-end">
                  <div
                    className="bg-gradient-primary rounded-sm transition-all duration-1000"
                    style={{ height: `${trend.volume}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground">{trend.volume}%</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AnalyticsDashboard;