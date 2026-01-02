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

const AnalyticsDashboard = () => {
  const hourlyData = [
    { hour: "06:00", vehicles: 120, efficiency: 85 },
    { hour: "07:00", vehicles: 245, efficiency: 72 },
    { hour: "08:00", vehicles: 398, efficiency: 68 },
    { hour: "09:00", vehicles: 356, efficiency: 75 },
    { hour: "10:00", vehicles: 289, efficiency: 82 },
    { hour: "11:00", vehicles: 267, efficiency: 88 },
    { hour: "12:00", vehicles: 312, efficiency: 79 },
  ];

  const roadTypeData = [
    { type: "Highway", vehicles: 1240, percentage: 45, efficiency: 88 },
    { type: "Arterial", vehicles: 856, percentage: 31, efficiency: 75 },
    { type: "Local", vehicles: 663, percentage: 24, efficiency: 92 },
  ];

  const peakHours = [
    { period: "Morning Rush", time: "7:30 - 9:30 AM", intensity: 92 },
    { period: "Lunch Hour", time: "12:00 - 1:00 PM", intensity: 65 },
    { period: "Evening Rush", time: "5:00 - 7:00 PM", intensity: 89 },
  ];

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
              <h4 className="text-sm font-medium mb-3">Hourly Vehicle Count</h4>
              <div className="space-y-2">
                {hourlyData.map((data, index) => (
                  <div key={data.hour} className="flex items-center space-x-4">
                    <div className="w-16 text-sm font-medium">{data.hour}</div>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm text-muted-foreground">{data.vehicles} vehicles</span>
                        <span className="text-sm text-muted-foreground">{data.efficiency}% efficiency</span>
                      </div>
                      <div className="relative">
                        <Progress value={(data.vehicles / 400) * 100} className="h-2" />
                        <Progress 
                          value={data.efficiency} 
                          className="h-1 mt-1 opacity-60" 
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
              {peakHours.map((peak) => (
                <div key={peak.period} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">{peak.period}</div>
                      <div className="text-sm text-muted-foreground">{peak.time}</div>
                    </div>
                    <Badge 
                      variant={peak.intensity > 85 ? "destructive" : peak.intensity > 70 ? "default" : "secondary"}
                    >
                      {peak.intensity}%
                    </Badge>
                  </div>
                  <Progress 
                    value={peak.intensity} 
                    className={`h-2 ${
                      peak.intensity > 85 
                        ? "[&>div]:bg-destructive" 
                        : peak.intensity > 70 
                        ? "[&>div]:bg-warning" 
                        : "[&>div]:bg-success"
                    }`}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-card shadow-card border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <TrendingUp className="h-4 w-4 mr-2 text-success" />
              Efficiency Improvement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-success">+18%</div>
            <p className="text-muted-foreground text-sm mt-1">vs last month</p>
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
            <div className="text-3xl font-bold text-primary">2.4min</div>
            <p className="text-muted-foreground text-sm mt-1">-25% reduction</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card shadow-card border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center">
              <Calendar className="h-4 w-4 mr-2 text-warning" />
              Events Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-warning">2</div>
            <p className="text-muted-foreground text-sm mt-1">Traffic affecting</p>
          </CardContent>
        </Card>
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
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => {
              const volume = [85, 88, 92, 89, 95, 65, 45][index];
              return (
                <div key={day} className="text-center space-y-2">
                  <div className="text-sm font-medium">{day}</div>
                  <div className="bg-secondary/30 rounded-lg p-3 h-24 flex flex-col justify-end">
                    <div 
                      className="bg-gradient-primary rounded-sm transition-all duration-1000" 
                      style={{ height: `${volume}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">{volume}%</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AnalyticsDashboard;