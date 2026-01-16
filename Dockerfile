FROM node:22-alpine

WORKDIR /app

# Server.js copy karein
COPY server.js .

# Dependencies manually install karein
RUN npm init -y && \
    npm install express@4.18.2 axios@1.6.2 crypto@1.0.1 cors@2.8.5 ytsr@3.10.0 yt-search@2.13.2 @distube/ytdl-core@4.11.11

EXPOSE 8080

CMD ["node", "server.js"]
