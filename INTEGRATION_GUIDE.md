# Vehicle Detection Integration Guide

This guide explains how to integrate the YOLOv5 vehicle detection backend with the React frontend.

## Backend Setup

### 1. Install Python Dependencies

Navigate to the `backend` folder and install dependencies:

```bash
cd backend
pip install -r requirements.txt
```

**Note:** First-time installation will download the YOLOv5 model weights (~14MB).

### 2. Start the Backend Server

```bash
python app.py
```

The server will start on `http://localhost:5000`

## Frontend Setup

### 1. Configure API URL (Optional)

Create a `.env` file in the root directory:

```env
VITE_API_URL=http://localhost:5000
```

If not set, it defaults to `http://localhost:5000`

### 2. Start the Frontend

```bash
npm run dev
```

The frontend will start on `http://localhost:8080`

## Usage

### Real-time Video Detection

1. **Webcam Detection:**
   - Enter `0` in the video source field (or leave empty)
   - Click "Start" to begin detection from your webcam

2. **IP Camera:**
   - Enter the camera URL: `http://your-camera-ip/stream.mjpeg`
   - Click "Start"

3. **Video File:**
   - Enter the path to your video file: `path/to/video.mp4`
   - Click "Start"

### Image Detection

1. Click "Upload Image" button
2. Select an image file (JPG, PNG, etc.)
3. The system will process the image and display vehicle counts

## API Endpoints

- `GET /api/health` - Check backend status
- `POST /api/detect/start` - Start real-time detection
  - Body: `{"source": 0}` (0 for webcam, URL, or file path)
- `POST /api/detect/stop` - Stop detection
- `GET /api/detect/stats` - Get current vehicle counts
- `POST /api/detect/image` - Process a single image
- `GET /api/detect/frame` - Get current frame with detections

## Features

- ✅ Real-time vehicle counting (cars, trucks, buses, bikes)
- ✅ Image upload and processing
- ✅ Live statistics updates
- ✅ Confidence scores
- ✅ Recent detections log
- ✅ Connection status indicator

## Troubleshooting

### Backend not connecting

- Ensure Python server is running on port 5000
- Check firewall settings
- Verify `flask-cors` is installed for CORS support

### Model not loading

- Check internet connection (first run downloads model)
- Verify PyTorch is installed correctly
- Check Python version (3.8+ required)

### Video source not working

- For webcam: Try different camera indices (0, 1, 2)
- For IP camera: Verify URL is accessible
- For file: Use absolute path

## Development Notes

- Backend runs on port 5000
- Frontend runs on port 8080
- CORS is enabled for localhost development
- Detection runs at ~30 FPS
- Stats are polled every 1 second from frontend

