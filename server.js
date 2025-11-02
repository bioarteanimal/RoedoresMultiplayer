const express = require("express");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 10000;

// Servir archivos estáticos desde la raíz del proyecto
app.use(express.static(path.resolve(__dirname)));

// Ruta raíz: enviar index.html desde la raíz
app.get("/", (req, res) => {
  res.sendFile(path.resolve(__dirname, "index.html"));
});

// In-memory rooms
const rooms = {}; // code -> { host, code, round, players, bots, teams, scores, duels }

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}
function createBot(idSuffix) {
  const levels = ["torpe", "normal", "bueno"];
  const mode = levels[Math.floor(Math.random() * levels.length)];
  return {
    id: "BOT_" + idSuffix,
    name: "Bot-" + mode,
    mode,
    team: null,
    points: 0
  };
}
function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}
function pairTeams(teamA, teamB) {
  const shuffledA = shuffle(teamA);
  const shuffledB = shuffle(teamB);
  const pairs = [];
  for (let i = 0; i < Math.min(shuffledA.length, shuffledB.length); i++) {
    pairs.push([shuffledA[i], shuffledB[i]]);
  }
  return pairs;
}
function broadcastState(code) {
  const room = rooms[code];
  if (!room) return;
  io.to(code).emit("updateState", {
    round: room.round,
    teams: room.teams,
    scores: room.scores,
    duels: room.duels
  });
}

io.on("connection", (socket) => {
  console.log("connect", socket.id);

  socket.on("createRoom", ({ name }) => {
    const code = generateRoomCode();
    rooms[code] = {
      host: socket.id,
      code,
      round: 1,
      players: [],
      bots: [],
      teams: { A: [], B: [] },
      scores: { A: 0, B: 0 },
      duels: []
    };
    const player = { id: socket.id, name, team: null, points: 0, host: true };
    rooms[code].players.push(player);
    player.team = 'A';
    rooms[code].teams.A.push(player);
    socket.join(code);
    socket.emit("roomCreated", { code });
    console.log(`Room ${code} created by ${name}`);
    broadcastState(code);
  });

  socket.on("joinRoom", ({ code, name }) => {
    const room = rooms[code];
    if (!room) {
      socket.emit("invalidCode");
      return;
    }
    const player = { id: socket.id, name, team: null, points: 0, host: false };
    const diff = room.teams.A.length - room.teams.B.length;
    player.team = diff > 0 ? "B" : "A";
    room.teams[player.team].push(player);
    room.players.push(player);
    socket.join(code);
    io.to(code).emit("playerJoined", { name, team: player.team });
    broadcastState(code);
  });

  socket.on("startGame", (code) => {
    const room = rooms[code];
    if (!room) return;
    if (room.teams.A.length !== room.teams.B.length) {
      const bot = createBot(room.bots.length + 1);
      const target = room.teams.A.length < room.teams.B.length ? "A" : "B";
      bot.team = target;
      room.bots.push(bot);
      room.teams[target].push(bot);
      io.to(code).emit("botAdded", { botName: bot.name, team: bot.team });
    }
    startRound(code);
  });

  socket.on("playerResult", ({ code, playerId, winnerTeam }) => {
    const room = rooms[code];
    if (!room) return;
    const player = room.players.find(p => p.id === playerId);
    if (player) player.points += 10;
    if (winnerTeam) room.scores[winnerTeam] += 1;
    const duel = room.duels.find(d => d.ids.includes(playerId));
    if (duel) { duel.finished = true; duel.winner = winnerTeam; }
    const allDone = room.duels.every(d => d.finished);
    if (allDone) {
      io.to(code).emit("roundEnded", {
        round: room.round,
        teams: room.teams,
        scores: room.scores,
        duels: room.duels
      });
      setTimeout(() => {
        if (room.round < 3) {
          room.round++;
          startRound(code);
        } else {
          endMatch(code);
        }
      }, 14000);
    }
    broadcastState(code);
  });

  socket.on("disconnect", () => {
    for (const code in rooms) {
      const room = rooms[code];
      room.players = room.players.filter(p => p.id !== socket.id);
      room.teams.A = room.teams.A.filter(p => p.id !== socket.id);
      room.teams.B = room.teams.B.filter(p => p.id !== socket.id);
      if (room.host === socket.id) {
        if (room.players.length > 0) {
          room.host = room.players[0].id;
        } else {
          delete rooms[code];
        }
      }
      broadcastState(code);
    }
    console.log("disconnect", socket.id);
  });
});

function startRound(code) {
  const room = rooms[code];
  if (!room) return;
  const pairs = pairTeams(room.teams.A, room.teams.B);
  room.duels = pairs.map(p => ({
    ids: [p[0].id, p[1].id],
    names: [p[0].name, p[1].name],
    winner: null,
    finished: false
  }));
  io.to(code).emit("newRound", { round: room.round, duels: room.duels });
  broadcastState(code);

  room.bots.forEach(bot => {
    const delay =
      bot.mode === "torpe"
        ? Math.random() * 5000 + 25000
        : bot.mode === "normal"
        ? Math.random() * 5000 + 22000
        : Math.random() * 3000 + 17000;
    setTimeout(() => {
      const correct = bot.mode === "bueno" || (bot.mode === "normal" && Math.random() > 0.4);
      const winner = correct ? bot.team : (bot.team === "A" ? "B" : "A");
      io.to(code).emit("botAnswer", { botId: bot.id, botTeam: bot.team, correct, winner });
      const duel = room.duels.find(d => d.ids.includes(bot.id));
      if (duel && !duel.finished) {
        duel.finished = true;
        duel.winner = winner;
      }
      broadcastState(code);
    }, delay);
  });
}

function endMatch(code) {
  const room = rooms[code];
  if (!room) return;
  const winner =
    room.scores.A > room.scores.B ? "A" :
    room.scores.B > room.scores.A ? "B" : "Empate";
  io.to(code).emit("matchEnded", { scores: room.scores, winner });
  console.log(`Room ${code} ended. Winner: ${winner}`);
}

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
