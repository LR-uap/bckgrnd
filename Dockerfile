FROM node:18

# Install system dependencies for OpenCV
RUN apt-get update && apt-get install -y \
  build-essential \
  cmake \
  libopencv-dev \
  pkg-config \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 10000
CMD [ "node", "server.js" ]