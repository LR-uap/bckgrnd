# Utilise une image node avec build tools
FROM node:18-bullseye

# Install OpenCV dependencies
RUN apt-get update && apt-get install -y \
  cmake \
  build-essential \
  libopencv-dev \
  pkg-config \
  python3 \
  python3-pip \
  git \
  && rm -rf /var/lib/apt/lists/*

# Set workdir
WORKDIR /usr/src/app

# Copy package.json files
COPY package*.json ./

# INSTALL node modules (opencv4nodejs va détecter opencv système déjà présent)
RUN npm install

# Copy all other files
COPY . .

# Start server
CMD ["node", "server.js"]
