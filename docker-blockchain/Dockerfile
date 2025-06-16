FROM node:18

WORKDIR /app

# Install hardhat & dependencies
COPY package*.json ./
RUN npm install

# Copy remaining files (like .contract.json, scripts/, etc.)
COPY . .

CMD ["npm", "run", "both"]
