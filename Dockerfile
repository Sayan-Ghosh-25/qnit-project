# Use Node Image
FROM node:22

# Set Working Directory
WORKDIR /app

# Copy Package Files
COPY package*.json ./

# Install Dependencies
RUN npm install

# Copy All Files
COPY . .

# Expose Backend Port
EXPOSE 5000

# Start Server
CMD ["node", "server.js"]