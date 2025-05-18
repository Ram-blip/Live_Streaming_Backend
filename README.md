This is the **backend** for the video conferencing project using **Mediasoup**. It handles WebRTC media routing, socket signaling, room management, and real-time communication. Built with **Node.js, Express.js, and Socket.IO**, it ensures a scalable and efficient backend infrastructure for many-to-many video conferencing.

## Features
- **Manages Mediasoup Workers, Routers, and Transports**
- **Handles WebRTC Producer & Consumer Streams**
- **Supports up to 5 Active Speakers per Room**
- **Real-time Signaling with Socket.IO**
- **Efficient SFU-based Media Streaming**
- **Room Creation and Management**

## Tech Stack
- **Node.js** - Backend runtime environment
- **Express.js** - Lightweight web framework
- **Socket.IO** - WebSocket-based real-time communication
- **Mediasoup** - WebRTC Selective Forwarding Unit (SFU)

## Installation
### Prerequisites
Ensure you have the following installed:
- **Node.js** (Latest LTS recommended)
- **NPM or Yarn**

### Setup
1. **Clone the Repository**
   ```bash
   git clone https://github.com/your-username/your-repo-name.git
   cd your-repo-name/backend
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   - Create a `.env` file in the root directory.
   - Add necessary Mediasoup and WebRTC configurations.

4. **Start the Backend Server**
   ```bash
   npm start
   ```

## How It Works
1. **Users Join a Room**
   - They connect via WebRTC and are assigned producer/consumer roles.
2. **Mediasoup Manages Media Routing**
   - Optimizes video/audio streams for efficient bandwidth usage.
3. **Socket.IO Handles Communication**
   - Provides real-time updates between clients.
4. **Active Speaker Detection**
   - Dynamically updates the UI to display the top 5 active speakers.

## Contact
For any queries, feel free to reach out or create an issue in the repository.



