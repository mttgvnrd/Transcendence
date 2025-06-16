// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

contract ScoreStorage {
    struct Match {
        string team;
        string score;
        string tournament_name;
    }

    mapping(string => Match) public matches;
    mapping(string => bool) public isMatchRegistered;
    address public owner;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    function setMatchResult(string memory matchId, string memory team, string memory score, string memory tournamentName) public onlyOwner {
        require(!isMatchRegistered[matchId], "Match already registered");
        matches[matchId] = Match(team, score, tournamentName);
        isMatchRegistered[matchId] = true;
    }

    function getMatchResult(string memory matchId) public view returns (string memory, string memory, string memory) {
        Match memory m = matches[matchId];
        return (m.team, m.score, m.tournament_name);
    }
}
