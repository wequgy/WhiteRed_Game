// server.js
// Node 18+ recommended
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// allow CORS from your frontend origin(s)
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGIN || "http://localhost:8080").split(",");
const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGINS,
    methods: ["GET", "POST"],
  },
});

// In-memory rooms storage. For production, move to Redis.
const rooms = {};
const RECONNECT_WINDOW_MS = 60_000; // 60s to reconnect
const ROOM_TTL_EMPTY_MS = 60 * 60_1000; // 1 hour for empty rooms
const RATE_LIMIT_WINDOW = 60_000; // 1 min
const RATE_LIMIT_MAX = 60; // max actions per minute per IP
const rateMap = new Map();

// helpers
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
function isRateLimited(ip) {
  if (!ip) return false;
  const t = now();
  const arr = rateMap.get(ip) || [];
  const filtered = arr.filter(ts => t - ts < RATE_LIMIT_WINDOW);
  filtered.push(t);
  rateMap.set(ip, filtered);
  return filtered.length > RATE_LIMIT_MAX;
}

// cleanup interval for stale rooms
setInterval(() => {
  const t = now();
  for (const [code, r] of Object.entries(rooms)) {
    if (Object.keys(r.players).length === 0 && (t - (r.createdAt || t) > ROOM_TTL_EMPTY_MS)) {
      delete rooms[code];
    }
  }
}, 60_000);

// Join helpers
function broadcastNames(roomCode) {
  const r = rooms[roomCode];
  if (!r) return;
  for (const id of Object.keys(r.players)) {
    const self = r.players[id].name;
    const opponentEntry = Object.entries(r.players).find(([otherId]) => otherId !== id);
    const opponent = opponentEntry ? opponentEntry[1].name : null;
    io.to(id).emit("playerNames", { self, opponent });
  }
}

io.on("connection", (socket) => {
  const ip = socket.handshake.address;
  console.log("connect", socket.id, ip);

  // CREATE ROOM
  socket.on("createRoom", (payload = {}) => {
    if (isRateLimited(ip)) return socket.emit("error", { code: "rate_limited" });

    const name = (payload && payload.name && validateName(payload.name)) ? payload.name.trim() : "Host";
    const room = makeCode();
    rooms[room] = {
      code: room,
      players: { [socket.id]: { name, secret: null, connected: true, createdAt: now() } },
      creatorId: socket.id,
      createdAt: now(),
      started: false,
      status: "waiting",
      currentTurn: null,
      guessHistory: [],
      rematchRequests: new Set(),
    };
    socket.join(room);
    socket.emit("roomCreated", room);
    // send names
    broadcastNames(room);
    console.log("room created", room, "by", name);
  });

  // JOIN ROOM
  socket.on("joinRoom", (payload) => {
    if (isRateLimited(ip)) return socket.emit("error", { code: "rate_limited" });

    // payload can be string or object
    let room, name;
    if (typeof payload === "string") {
      room = payload;
      name = null;
    } else if (typeof payload === "object") {
      room = payload.room;
      name = payload.name;
    }

    if (!room || !rooms[room]) return socket.emit("error", { code: "room_not_found" });
    const r = rooms[room];

    // enforce max 2 players
    if (Object.keys(r.players).length >= 2) return socket.emit("error", { code: "room_full" });

    // sanitize name
    const playerName = validateName(name) ? name.trim() : `Player-${socket.id.slice(0,4)}`;

    // prevent duplicate name
    if (Object.values(r.players).some(p => p.name === playerName)) {
      return socket.emit("error", { code: "name_taken" });
    }

    r.players[socket.id] = { name: playerName, secret: null, connected: true, createdAt: now() };
    socket.join(room);

    // notify
    socket.emit("joined", { room });
    io.to(room).emit("playerJoined", { name: playerName });

    // broadcast names to everyone
    broadcastNames(room);
    console.log(socket.id, "joined", room, "as", playerName);
  });

  // HOST START GAME - only host can call
  socket.on("startGame", ({ room }) => {
    const r = rooms[room];
    if (!r) return socket.emit("error", { code: "room_not_found" });
    if (socket.id !== r.creatorId) return socket.emit("error", { code: "not_creator" });
    if (Object.keys(r.players).length < 2) return socket.emit("error", { code: "need_two_players" });

    r.started = true;
    r.status = "started";
    io.to(room).emit("gameStarted");
    console.log("gameStarted", room);
  });

  // RECONNECT to existing slot by name (client may do this on load)
  socket.on("reconnectToRoom", ({ room, name }) => {
    const r = rooms[room];
    if (!r) return socket.emit("error", { code: "room_not_found" });

    // find disconnected entry by name
    const entry = Object.entries(r.players).find(([id, p]) => p.name === name && (!p.connected));
    if (!entry) return socket.emit("error", { code: "no_reconnect_slot" });

    const [oldId, pdata] = entry;
    // cleanup old timer if present
    if (pdata._reconnectTimeout) clearTimeout(pdata._reconnectTimeout);
    // remove old id, reassign
    delete r.players[oldId];
    r.players[socket.id] = { ...pdata, connected: true, _reconnectTimeout: null };
    socket.join(room);
    io.to(room).emit("playerReconnected", { id: socket.id, name });
    broadcastNames(room);
    socket.emit("reconnected", { ok: true });
    console.log("reconnected", name, "as", socket.id, "in", room);
  });

  // SET SECRET - must be started
  socket.on("setSecret", ({ room, secret }) => {
    const r = rooms[room];
    if (!r) return socket.emit("error", { code: "room_not_found" });
    if (!r.started) return socket.emit("error", { code: "game_not_started" });
    if (!validateSecret(secret)) return socket.emit("error", { code: "invalid_secret" });
    if (!r.players[socket.id]) return socket.emit("error", { code: "not_in_room" });

    r.players[socket.id].secret = secret;
    r.players[socket.id].connected = true;

    const readyCount = Object.values(r.players).filter(p => p.secret).length;
    if (readyCount === 2) {
      r.status = "playing";
      r.currentTurn = (Math.random() < 0.5) ? Object.keys(r.players)[0] : Object.keys(r.players)[1];
      r.guessHistory = [];
      r.rematchRequests = new Set();
      io.to(room).emit("bothReady", { currentTurn: r.currentTurn });
      console.log("bothReady", room, "starter", r.currentTurn);
    } else {
      io.to(room).emit("playerLocked", { by: socket.id });
    }
  });

  // GUESS
  socket.on("guess", ({ room, guess }) => {
    const r = rooms[room];
    if (!r) return socket.emit("error", { code: "room_not_found" });
    if (!r.started || r.status !== "playing") return socket.emit("error", { code: "game_not_playing" });
    if (!r.players[socket.id]) return socket.emit("error", { code: "not_in_room" });
    if (r.currentTurn !== socket.id) return socket.emit("error", { code: "not_your_turn" });
    if (!validateSecret(guess)) return socket.emit("error", { code: "invalid_guess" });

    const opponentId = Object.keys(r.players).find(id => id !== socket.id);
    if (!opponentId) return socket.emit("error", { code: "no_opponent" });
    const opponentSecret = r.players[opponentId].secret;
    if (!opponentSecret) return socket.emit("error", { code: "opponent_no_secret" });

    const { whites, reds } = computeHits(opponentSecret, guess);
    r.guessHistory.unshift({ by: socket.id, guess, whites, reds, at: now() });

    // reply to guesser and opponent
    socket.emit("guessResult", { whites, reds, guess });
    io.to(opponentId).emit("opponentGuessed", { guess, whites, reds });

    if (whites === 4) {
      r.status = "finished";
      io.to(room).emit("gameOver", { winner: socket.id });
      return;
    }

    r.currentTurn = opponentId;
    io.to(room).emit("turnChanged", { currentTurn: r.currentTurn });
  });

  // CHAT
  socket.on("sendChat", ({ room, message, name }) => {
    if (!rooms[room]) return;
    const safeMsg = String(message).slice(0, 500);
    const senderName = (name && typeof name === "string") ? name.slice(0, 32) : (rooms[room].players[socket.id] && rooms[room].players[socket.id].name) || "Player";
    const msg = { from: socket.id, name: senderName, message: safeMsg, at: now() };
    io.to(room).emit("chatMessage", msg);
  });

  socket.on("typing", ({ room, isTyping }) => {
    io.to(room).emit("typing", { from: socket.id, isTyping });
  });

  // REMATCH
  socket.on("requestRematch", ({ room }) => {
    const r = rooms[room];
    if (!r) return;
    r.rematchRequests.add(socket.id);
    io.to(room).emit("rematchStatus", { count: r.rematchRequests.size });
    if (r.rematchRequests.size === Object.keys(r.players).length) {
      for (const id of Object.keys(r.players)) r.players[id].secret = null;
      r.status = "waiting";
      r.started = true;
      r.currentTurn = null;
      r.guessHistory = [];
      r.rematchRequests = new Set();
      io.to(room).emit("rematchStarted");
    }
  });

  // LEAVE ROOM
  socket.on("leaveRoom", ({ room }) => {
    const r = rooms[room];
    if (!r) return;
    if (r.players[socket.id]) delete r.players[socket.id];
    socket.leave(room);
    io.to(room).emit("playerLeft", { by: socket.id });
    if (Object.keys(r.players).length === 0) delete rooms[room];
  });

  // DISCONNECT handling with short grace window
  socket.on("disconnect", () => {
    for (const [roomCode, r] of Object.entries(rooms)) {
      if (r.players[socket.id]) {
        r.players[socket.id].connected = false;
        r.players[socket.id].disconnectedAt = now();
        // schedule removal after RECONNECT_WINDOW_MS if not reconnected
        r.players[socket.id]._reconnectTimeout = setTimeout(() => {
          // if still disconnected remove
          if (r.players[socket.id] && !r.players[socket.id].connected) {
            delete r.players[socket.id];
            io.to(roomCode).emit("playerLeft", { by: socket.id });
            // if host left transfer host to other player
            if (socket.id === r.creatorId) {
              const other = Object.keys(r.players)[0];
              if (other) {
                r.creatorId = other;
                io.to(roomCode).emit("hostChanged", { newHost: other, name: r.players[other].name });
              }
            }
            if (Object.keys(r.players).length === 0) delete rooms[roomCode];
          }
        }, RECONNECT_WINDOW_MS);
      }
    }
    console.log("disconnect", socket.id);
  });
});

// health
app.get("/", (req, res) => res.send("White & Red backend OK"));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log("listening on", PORT));
