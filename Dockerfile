FROM node:18-bookworm

RUN apt-get clean && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y \
  cmake \
  build-essential \
  libopencv-dev \
  pkg-config \
  python3 \
  python3-pip \
  git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "server.js"]
