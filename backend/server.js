// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || "http://localhost:8080").split(",");
const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGINS,
    methods: ["GET", "POST"],
  },
});

const rooms = {};
const RECONNECT_WINDOW_MS = 60000;

function now() { return Date.now(); }
function validateSecret(s) { return /^\d{4}$/.test(s) && new Set(s).size === 4; }
function validateName(n) { return typeof n === "string" && n.trim().length >= 1 && n.trim().length <= 32; }
function makeCode() { return Math.random().toString(36).substring(2, 6).toUpperCase(); }
function computeHits(secret, guess) {
  let whites = 0, reds = 0;
  for (let i = 0; i < 4; i++) {
    if (guess[i] === secret[i]) whites++;
    else if (secret.includes(guess[i])) reds++;
  }
  return { whites, reds };
}

function broadcastNames(room) {
  const r = rooms[room];
  if (!r) return;
  for (const id of Object.keys(r.players)) {
    const self = r.players[id].name;
    const oppEntry = Object.entries(r.players).find(([oid]) => oid !== id);
    const opponent = oppEntry ? oppEntry[1].name : null;
    io.to(id).emit("playerNames", { self, opponent });
    io.to(id).emit("hostInfo", { hostId: r.creatorId });  // ⭐ send host id
  }
}

io.on("connection", (socket) => {

  // CREATE ROOM (host)
  socket.on("createRoom", (payload = {}) => {
    const name = validateName(payload.name) ? payload.name.trim() : "Host";
    const room = makeCode();

    rooms[room] = {
      code: room,
      players: { [socket.id]: { name, secret: null, connected: true } },
      creatorId: socket.id,
      started: false,
      status: "waiting",
      currentTurn: null,
    };

    socket.join(room);
    socket.emit("roomCreated", room);
    broadcastNames(room);
  });


  // JOIN ROOM
  socket.on("joinRoom", ({ room, name }) => {
    const r = rooms[room];
    if (!r) return socket.emit("error", { code: "room_not_found" });

    if (Object.keys(r.players).length >= 2)
      return socket.emit("error", { code: "room_full" });

    const playerName = validateName(name) ? name.trim() : "Player";
    r.players[socket.id] = { name: playerName, secret: null, connected: true };
    socket.join(room);

    // Send hostId to the joining player
    socket.emit("hostInfo", { hostId: r.creatorId });

    // Send joined + whether game already started
    socket.emit("joined", { room, started: r.started });

    // Notify both
    io.to(room).emit("playerJoined", { name: playerName, started: r.started });

    // If game already started earlier (host started too early), start for this player too
    if (r.started) socket.emit("gameStarted");

    broadcastNames(room);
  });


  // START GAME (HOST ONLY)
  socket.on("startGame", ({ room }) => {
    const r = rooms[room];
    if (!r) return;

    if (socket.id !== r.creatorId)
      return socket.emit("errorMessage", "Only host can start the game.");

    if (Object.keys(r.players).length < 2)
      return socket.emit("errorMessage", "Opponent has not joined yet.");

    r.started = true;
    r.status = "started";

    io.to(room).emit("gameStarted");
  });


  // SET SECRET
  socket.on("setSecret", ({ room, secret }) => {
    const r = rooms[room];
    if (!r) return;
    if (!validateSecret(secret)) return;

    r.players[socket.id].secret = secret;

    const readyCount = Object.values(r.players).filter(p => p.secret).length;

    if (readyCount === 2) {
      r.status = "playing";
      const ids = Object.keys(r.players);
      r.currentTurn = ids[Math.floor(Math.random() * ids.length)];
      io.to(room).emit("bothReady", { currentTurn: r.currentTurn });
    } else {
      io.to(room).emit("playerLocked", { by: socket.id });
    }
  });


  // GUESS
  socket.on("guess", ({ room, guess }) => {
    const r = rooms[room];
    if (!r) return;
    if (r.currentTurn !== socket.id) return;

    const opponentId = Object.keys(r.players).find(id => id !== socket.id);
    const { whites, reds } = computeHits(r.players[opponentId].secret, guess);

    socket.emit("guessResult", { whites, reds, guess });
    io.to(opponentId).emit("opponentGuessed", { guess, whites, reds });

    if (whites === 4) {
      io.to(room).emit("gameOver", { winner: socket.id });
      return;
    }

    r.currentTurn = opponentId;
    io.to(room).emit("turnChanged", { currentTurn: opponentId });
  });


  // CHAT
  socket.on("sendChat", ({ room, message, name }) => {
    const msg = { from: socket.id, name, message, at: now() };
    io.to(room).emit("chatMessage", msg);
  });

  socket.on("typing", ({ room, isTyping }) => {
    io.to(room).emit("typing", { from: socket.id, isTyping });
  });


  // REMATCH
  socket.on("requestRematch", ({ room }) => {
    io.to(room).emit("rematchStarted");
  });


  socket.on("disconnect", () => {});

});

app.get("/", (req, res) => res.send("White & Red backend OK"));
server.listen(process.env.PORT || 5000);
