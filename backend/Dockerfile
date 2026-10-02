FROM node:20-alpine

WORKDIR /app

# Copy package files first for caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code
COPY src/ ./src/

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 3000

CMD ["npm", "start"]