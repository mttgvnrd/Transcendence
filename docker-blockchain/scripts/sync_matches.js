require("dotenv").config();
const fs = require("fs");
const { Client } = require("pg");
const { ethers } = require("hardhat");

async function getMatchesFromDB() {
  const client = new Client({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
  });

  await client.connect();

  try {
    const res = await client.query(`
      SELECT
        tm.id AS match_id,
        t.id AS tournament_id,
        tp.nickname AS winner,
        tm.score_player_1 || '-' || tm.score_player_2 AS score,
        COALESCE(tm.tournament_name, t.name) AS tournament_name
      FROM game_tournamentmatch tm
      JOIN game_tournament t ON tm.tournament_id = t.id
      JOIN game_tournamentparticipant tp ON tp.id = tm.winner_id
      WHERE tm.winner_id IS NOT NULL;
    `);
    return res.rows;
  } catch (err) {
    console.error("❌ Error querying DB:", err.message);
    return [];
  } finally {
    await client.end();
  }
}

async function syncMatches() {
  const [deployer] = await ethers.getSigners();
  const contractJson = JSON.parse(fs.readFileSync("./.contract.json", "utf8"));
  const contract = await ethers.getContractAt("ScoreStorage", contractJson.address);

  console.log("🚀 Syncing tournament matches from DB every 45s...");

  setInterval(async () => {
    console.log("🔄 Checking for new matches...");
    const matches = await getMatchesFromDB();

    for (const match of matches) {
      console.log(`🎯 Preparing match: ${match.match_id} | Tournament: ${match.tournament_name} | Winner: ${match.winner} | Score: ${match.score}`);
      try {
        const gasPrice = await ethers.provider.getGasPrice();
        console.log("Current gas price:", ethers.utils.formatUnits(gasPrice, "gwei"), "gwei");

        const tx = await contract.setMatchResult(
          match.match_id,         // match ID as unique ID
          match.winner,           // winner nickname
          match.score,            // score result
          match.tournament_name   // tournament name
        );
        await tx.wait();
        
        const logLine = `✅ Match ${match.match_id} (${match.tournament_name}) recorded at address: ${tx.hash}\n`;
        console.log(logLine.trim());
        fs.appendFileSync("BC_record.txt", logLine, "utf8");
      } catch (err) {
        if (err.error && err.error.message.includes("Match already registered")) {
          console.log(`⚠️ Match ${match.match_id} already registered. Skipping.`);
        } else {
          console.error(`❌ Error recording match ${match.match_id}:`, err.message);
        }
      }
    }
  }, 45000); // every 45 seconds
}

syncMatches();
