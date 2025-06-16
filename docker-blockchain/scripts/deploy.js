const fs = require("fs");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🎯Deploying contract with:", deployer.address);

  const ScoreStorage = await ethers.getContractFactory("ScoreStorage");
  const contract = await ScoreStorage.deploy();
  await contract.deployed();

  console.log("🎯Contract deployed at:", contract.address);

  fs.writeFileSync(
    "./.contract.json",
    JSON.stringify({ address: contract.address }, null, 2)
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});