# Next-Client-YOLO: Real-Time Object Detection

A Next.js application that performs real-time object detection using TensorFlow.js and the COCO-SSD model. This project provides an interactive web interface for detecting and tracking multiple objects through your device's camera.

## Features

- Real-time object detection using TensorFlow.js and COCO-SSD model
- Multi-object tracking with persistence
- Interactive detection log with object history
- Category filtering
- Adjustable detection threshold
- Responsive design for desktop and mobile
- Color-coded object categories
- Detection confidence display

## Prerequisites

- Node.js 16.x or higher
- Yarn or npm
- Modern web browser with camera access
- Device with webcam

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/next-client-yolo.git
cd next-client-yolo
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Start the development server:
```bash
npm run dev
# or
yarn dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. Allow camera access when prompted
2. Objects will be automatically detected and tracked in real-time
3. Use the threshold slider to adjust detection sensitivity
4. Click category buttons to filter specific types of objects
5. View the detection log panel for detailed information about detected objects

## Technical Details

- Built with Next.js 14 and TypeScript
- Uses TensorFlow.js for ML operations
- COCO-SSD model for object detection
- Custom object tracking implementation
- Tailwind CSS for styling

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- TensorFlow.js team for the COCO-SSD model
- Next.js team for the fantastic framework
- Vercel for the deployment platform

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyourusername%2Fnext-client-yolo)
