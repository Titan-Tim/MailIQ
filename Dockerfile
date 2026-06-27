FROM node:18

WORKDIR /app

# Copy backend package files and install dependencies
COPY backend/package*.json ./
RUN npm install

# Copy backend source
COPY backend/ .

# Generate Prisma client
RUN npx prisma generate

EXPOSE 3002

CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
