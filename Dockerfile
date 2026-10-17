FROM node:22-alpine

# Set working directory
WORKDIR /app

# Install curl, tzdata, and tesseract OCR with Spanish language data
RUN apk add --no-cache curl tzdata tesseract-ocr tesseract-ocr-data-spa

# Copy dependency manifests
COPY package*.json ./

# Install production dependencies
RUN npm install

# Copy application source code
COPY . .

# Build Vite React client
RUN cd client && npm install && npm run build

# Ensure upload directory exists and set permissions
RUN mkdir -p /app/uploads/evidences

# Expose server port
EXPOSE 4000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4000/api/health || exit 1

# Start server
CMD ["npm", "start"]
