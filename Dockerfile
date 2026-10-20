FROM node:22-bookworm-slim
# Build tools are the fallback for platforms without a prebuilt @discordjs/opus binary.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && apt-get clean
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY *.js ./
USER node
CMD ["node", "index.js"]
