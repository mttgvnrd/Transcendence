const { Wallet } = require("ethers");

const wallet = Wallet.createRandom();

console.log("🚀 New Ethereum Wallet Generated:");
console.log("Address:", wallet.address);
console.log("Private Key:", wallet.privateKey);
console.log("Mnemonic:", wallet.mnemonic.phrase);
