import { useEffect, useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import WinnerModal from "@/components/WinnerModal";
import { Lock, Send, MessageCircle } from "lucide-react";
import { socket } from "@/socket";
import NotificationBubble from "@/components/NotificationBubble";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const isValid = (s: string) => /^\d{4}$/.test(s) && new Set(s).size === 4;

const Game = () => {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");

  if (!room) {
    window.location.href = "/";
    return null;
  }

  const storedName = localStorage.getItem("wr-name") || "";
  const [askNameOpen, setAskNameOpen] = useState(!storedName);
  const [tempName, setTempName] = useState("");
  const [myName, setMyName] = useState(storedName || "");
  const [opponentName, setOpponentName] = useState("Opponent");

  const [myId, setMyId] = useState("");
  const [hostId, setHostId] = useState(""); // NEW

  const [gameStarted, setGameStarted] = useState(false);
  const [status, setStatus] = useState("Waiting for players…");

  const [secret, setSecret] = useState("");
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [turn, setTurn] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<null | "joining" | "locking">(null);

  const [history, setHistory] = useState<any[]>([]);

  const [chat, setChat] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [opponentTyping, setOpponentTyping] = useState(false);

  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState("");
  const notifyRef = useRef<number | null>(null);

  const [winnerOpen, setWinnerOpen] = useState(false);
  const [iWon, setIWon] = useState(false);

  const confirmName = () => {
    if (!tempName.trim()) return;

    localStorage.setItem("wr-name", tempName.trim());
    setMyName(tempName.trim());
    setAskNameOpen(false);

    socket.emit("joinRoom", { room, name: tempName.trim() });
    socket.emit("reconnectToRoom", { room, name: tempName.trim() });
    localStorage.setItem("wr-room", room);
  };

  useEffect(() => {
    setMyId(socket.id);

    if (!storedName) return;

    socket.emit("joinRoom", { room, name: storedName });
    socket.emit("reconnectToRoom", { room, name: storedName });
    localStorage.setItem("wr-room", room);

    socket.on("playerNames", ({ self, opponent }) => {
      if (self) setMyName(self);
      if (opponent) setOpponentName(opponent);
    });

    socket.on("hostInfo", ({ hostId }) => {
      setHostId(hostId);
    });

    socket.on("joined", ({ started }) => {
      setLoadingState("joining");
      if (started) {
        setGameStarted(true);
        setStatus("Game started. Enter your secret.");
      } else {
        setStatus("Joining room…");
      }
    });

    socket.on("playerJoined", ({ name, started }) => {
      if (name) setOpponentName(name);
      setLoadingState(null);

      if (started) {
        setGameStarted(true);
        setStatus("Game started. Enter your secret.");
      } else {
        setStatus("Opponent joined. Waiting for host to start");
      }
    });

    socket.on("gameStarted", () => {
      setGameStarted(true);
      setStatus("Game started. Enter your secret.");
    });

    socket.on("playerLocked", () => {
      setLoadingState("locking");
      setStatus("Opponent locked. Waiting...");
      setTimeout(() => setLoadingState(null), 600);
    });

    socket.on("bothReady", ({ currentTurn }) => {
      setReady(true);
      setTurn(currentTurn);
      setStatus(currentTurn === socket.id ? "Your turn" : `${opponentName}'s turn`);
    });

    socket.on("guessResult", ({ whites, reds, guess }) => {
      setHistory(h => [{ guess, whites, reds, by: socket.id }, ...h]);
      setStatus(`${opponentName}'s turn`);
    });

    socket.on("opponentGuessed", ({ guess, whites, reds }) => {
      setHistory(h => [{ guess, whites, reds, by: "opponent" }, ...h]);
      setStatus("Your turn");
    });

    socket.on("turnChanged", ({ currentTurn }) => {
      setTurn(currentTurn);
      setStatus(currentTurn === socket.id ? "Your turn" : `${opponentName}'s turn`);
    });

    socket.on("gameOver", ({ winner }) => {
      setWinnerOpen(true);
      setIWon(winner === socket.id);
    });

    socket.on("chatMessage", (msg) => {
      setChat(prev => [msg, ...prev]);

      if (!chatOpen) {
        setUnreadCount(c => c + 1);
        setNotifyMsg(`${msg.name}: ${msg.message}`);
        setNotifyOpen(true);

        if (notifyRef.current) clearTimeout(notifyRef.current);
        notifyRef.current = window.setTimeout(() => setNotifyOpen(false), 1500);
      }
    });

    socket.on("typing", ({ from, isTyping }) => {
      if (from !== socket.id) setOpponentTyping(isTyping);
    });

    socket.on("rematchStarted", () => {
      setSecret("");
      setLocked(false);
      setReady(false);
      setGuess("");
      setChat([]);
      setHistory([]);
      setWinnerOpen(false);
      setStatus("Enter secret");
      setGameStarted(true);
    });

    socket.on("playerLeft", () => {
      setStatus("Opponent left the room.");
    });

    socket.on("errorMessage", (msg) => {
      setStatus(msg);
    });

    return () => {
      socket.off("playerNames");
      socket.off("hostInfo");
      socket.off("joined");
      socket.off("playerJoined");
      socket.off("gameStarted");
      socket.off("playerLocked");
      socket.off("bothReady");
      socket.off("guessResult");
      socket.off("opponentGuessed");
      socket.off("turnChanged");
      socket.off("gameOver");
      socket.off("chatMessage");
      socket.off("typing");
      socket.off("rematchStarted");
      socket.off("playerLeft");
    };
  }, [room, chatOpen]);

  const lockSecret = () => {
    if (!isValid(secret)) return;

    if (!gameStarted) {
      setStatus("Waiting for host to start the game");
      return;
    }

    setLocked(true);
    setLoadingState("locking");
    socket.emit("setSecret", { room, secret });
  };

  const [guess, setGuess] = useState("");

  const submitGuess = () => {
    if (!isValid(guess)) return;
    if (turn !== socket.id) return;

    socket.emit("guess", { room, guess });
    setGuess("");
  };

  const openChatPanel = () => {
    setChatOpen(true);
    setUnreadCount(0);
    setNotifyOpen(false);
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;

    socket.emit("sendChat", { room, message: chatInput, name: myName });
    setChatInput("");
  };

  const copyRoom = async () => {
    await navigator.clipboard.writeText(room);
    setNotifyMsg("Room code copied");
    setNotifyOpen(true);
    setTimeout(() => setNotifyOpen(false), 1200);
  };

  const requestRematch = () => socket.emit("requestRematch", { room });

  return (
    <div className="min-h-screen p-4 pb-24 max-w-md mx-auto space-y-4 text-foreground">

      <NotificationBubble open={notifyOpen} message={notifyMsg} onClick={openChatPanel} />

      {askNameOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <Card className="p-6 w-80 space-y-4 bg-card text-center">
            <h2 className="text-lg font-semibold">Enter your name</h2>
            <Input
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              placeholder="Your name"
              className="text-center"
            />
            <Button className="w-full" onClick={confirmName}>
              Continue
            </Button>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">White & Red</h1>
          <p className="text-xs text-muted-foreground">Room #{room}</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-sm text-muted-foreground" onClick={copyRoom}>Copy</button>
          {loadingState && <LoadingSpinner size={22} />}
        </div>
      </div>

      <p className="text-center text-sm">{status}</p>

      {/* ⭐ HOST START GAME BUTTON */}
      {myId === hostId && !gameStarted && opponentName !== "Opponent" && (
        <Card className="p-4 text-center">
          <Button
            className="w-full"
            onClick={() => socket.emit("startGame", { room })}
          >
            Start Game
          </Button>
        </Card>
      )}

      {/* ⭐ OPPONENT VIEW */}
      {myId !== hostId && !gameStarted && (
        <Card className="p-4 text-center">
          <h2 className="text-lg font-medium">Waiting for host to start</h2>
        </Card>
      )}

      {!locked ? (
        gameStarted ? (
          <Card className="p-4 space-y-3">
            <h2 className="text-lg">Enter Secret Number</h2>
            <Input
              maxLength={4}
              value={secret}
              onChange={(e) => setSecret(e.target.value.replace(/\D/g, ""))}
              className="text-center text-xl tracking-widest"
            />
            <Button className="w-full" disabled={!isValid(secret)} onClick={lockSecret}>
              <Lock className="mr-2" /> Lock Secret
            </Button>
          </Card>
        ) : null
      ) : (
        <Card className="p-4 text-center">Secret Locked</Card>
      )}

      {locked && ready && (
        <Card className="p-4 space-y-3">
          <h2 className="text-lg">Make a Guess</h2>
          <Input
            maxLength={4}
            value={guess}
            disabled={turn !== socket.id}
            onChange={(e) => setGuess(e.target.value.replace(/\D/g, ""))}
            className="text-center text-xl"
          />
          <Button className="w-full" disabled={!isValid(guess) || turn !== socket.id} onClick={submitGuess}>
            <Send className="mr-2" /> Submit Guess
          </Button>
        </Card>
      )}

      {history.length > 0 && (
        <div className="space-y-4">

          <div>
            <h3 className="text-sm font-semibold text-accent">Your Guesses</h3>
            <div className="mt-2 space-y-2">
              {history.filter(h => h.by === socket.id).map((h, i) => (
                <Card key={i} className="p-3 flex justify-between">
                  <span className="font-mono">{h.guess}</span>
                  <div className="flex gap-2">
                    {[...Array(h.whites)].map((_, j) => <div key={j} className="w-4 h-4 bg-accent rounded-full" />)}
                    {[...Array(h.reds)].map((_, j) => <div key={j} className="w-4 h-4 bg-primary rounded-full" />)}
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-primary">{opponentName}'s Guesses</h3>
            <div className="mt-2 space-y-2">
              {history.filter(h => h.by === "opponent").map((h, i) => (
                <Card key={i} className="p-3 flex justify-between">
                  <span className="font-mono">{h.guess}</span>
                  <div className="flex gap-2">
                    {[...Array(h.whites)].map((_, j) => <div key={j} className="w-4 h-4 bg-accent rounded-full" />)}
                    {[...Array(h.reds)].map((_, j) => <div key={j} className="w-4 h-4 bg-primary rounded-full" />)}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={openChatPanel}
        className={`fixed bottom-6 right-5 z-40 h-14 w-14 bg-card rounded-full flex items-center justify-center shadow-xl ${
          unreadCount ? "animate-bounce" : ""
        }`}
      >
        <MessageCircle className="h-6 w-6" />
        {unreadCount > 0 && (
          <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-white text-xs flex items-center justify-center">
            {unreadCount}
          </div>
        )}
      </button>

      <Sheet open={chatOpen} onOpenChange={setChatOpen}>
        <SheetContent
          side="bottom"
          className="chat-sheet h-[60vh] rounded-t-2xl px-4"
        >
          <SheetHeader>
            <SheetTitle className="text-center">Chat</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col h-full pt-4">
            <div className="flex-1 overflow-y-auto space-y-2">
              {chat.map((m, i) => (
                <div key={i} className={m.from === socket.id ? "text-right" : "text-left"}>
                  <div className="inline-block px-3 py-2 bg-muted rounded-xl">
                    <div className="text-xs text-muted-foreground">{m.name}</div>
                    <div>{m.message}</div>
                  </div>
                </div>
              ))}
              {opponentTyping && (
                <p className="text-xs text-muted-foreground">{opponentName} typing…</p>
              )}
            </div>

            <div className="flex gap-2 pb-2">
              <Input
                className="ios-fix-input"
                value={chatInput}
                onFocus={() => {
                  // iOS safe scroll-to-view
                  setTimeout(() => {
                    document.activeElement?.scrollIntoView({ behavior: "smooth", block: "center" });
                  }, 200);
                }}
                onChange={(e) => {
                  setChatInput(e.target.value);
                  socket.emit("typing", { room, isTyping: true });
                }}
                onBlur={() => socket.emit("typing", { room, isTyping: false })}
                placeholder="Message..."
              />

              <Button onClick={sendChat}>Send</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <WinnerModal
        isOpen={winnerOpen}
        isWinner={iWon}
        onPlayAgain={() => { requestRematch(); setWinnerOpen(false); }}
        onExit={() => (window.location.href = "/")}
        onClose={() => setWinnerOpen(false)}
      />
    </div>
  );
};

export default Game;
