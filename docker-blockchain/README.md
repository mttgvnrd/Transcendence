# Blockchain Module – ft_transcendence

This module handles interaction with the Ethereum Sepolia network for smart contract deployment and data synchronization.

## 🐳 Docker Usage

### Clean and Rebuild Everything
```  


docker compose down -v --remove-orphans
docker image prune -a -f
docker compose up --build
Blocked Port Fix
If port 5432 or 5433 is busy:

  


  


  


sudo lsof -i :5432  # or :5433
sudo kill <PID>
🔧 Local Development (Without Docker)
1. Activate Python Environment (if needed)
  


  


  


conda activate mio_ambiente
2. Install Dependencies
  


  


  


npm install
3. Compile Contracts
  


  


  


npx hardhat compile
4. Run Scripts
  


  


  


npm run deploy   # Deploy smart contract
npm run sync     # Sync matches with blockchain
npm run both     # Deploy + Sync
🧼 Clean Script (Optional)
  


  


  


chmod +x clean.sh
./clean.sh
📂 Git Commands
Push Changes
  


  


  


git add .
git commit -m "Your message"
git push
First Push of a New Branch
  


  


  


git push --set-upstream origin gbarone
🐘 PostgreSQL Access
  


  


  


psql -h localhost -p 5433 -U django -d django_db
psql -U barone -d blockchain_test
💸 Check Sepolia ETH Balance
  


  


  


npx hardhat console --network sepolia
Then inside the console:

js
  


  


const balance = await ethers.provider.getBalance("0xYourAddressHere");
console.log(ethers.utils.formatEther(balance));
🔗 Docker Compose Service (blockchain)
  


  


  


  blockchain:
    build:
      context: ./docker-blockchain
      dockerfile: Dockerfile
    working_dir: /app
    command: ["npm", "run", "both"]
    env_file:
      - ./docker-blockchain/.env
    volumes:
      - ./docker-blockchain:/app
    depends_on:
      - postgres
📦 Important Notes
node_modules/ and artifacts/ are created inside the Docker container and do not need to be committed.

Make sure hardhat.config.js is in the root of docker-blockchain/.

Run npm install --save-dev hardhat if setting up from scratch.

