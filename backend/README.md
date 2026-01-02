# Vehicle Detection Backend

Python Flask backend for real-time vehicle detection using YOLOv5.

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Run the server:
```bash
python app.py
```

The server will start on `http://localhost:5000`

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/detect/image` - Process a single image (multipart/form-data with 'image' file)
- `POST /api/detect/start` - Start real-time detection from video source
  - Body: `{"source": 0}` (0 for webcam, or URL/path to video)
- `POST /api/detect/stop` - Stop real-time detection
- `GET /api/detect/stats` - Get current vehicle counts and statistics
- `GET /api/detect/frame` - Get current frame with detections (base64 encoded)

## Notes

- First run will download YOLOv5 model weights (~14MB)
- For webcam, use `source: 0`
- For IP camera, use `source: "http://your-camera-ip/stream.mjpeg"`
- For video file, use `source: "path/to/video.mp4"`

