FROM node:22-alpine

WORKDIR /app

# Dependencies install (caching ke liye better)
RUN npm init -y --silent
RUN npm install express axios cors ytsr yt-search @distube/ytdl-core --save

# Server.js copy karein
COPY server.js .

EXPOSE 8080

CMD ["node", "server.js"]
