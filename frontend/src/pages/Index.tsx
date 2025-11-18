// src/pages/Index.tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import JoinRoomSheet from "@/components/JoinRoomSheet";
import { Plus, Users, Share2 } from "lucide-react";
import { socket } from "@/socket";

const Index = () => {
  const [showJoin, setShowJoin] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [name, setName] = useState<string>(localStorage.getItem("wr-name") || "");
  const navigate = useNavigate();

  useEffect(() => {
    socket.on("roomCreated", (code: string) => setRoomCode(code));
    return () => { socket.off("roomCreated"); };
  }, []);

  const createRoom = () => {
    if (!name.trim()) { alert("Enter your name"); return; }
    localStorage.setItem("wr-name", name);
    socket.emit("createRoom", { name });
  };

  const startGame = () => {
    if (!roomCode) return;
    navigate(`/game?room=${roomCode}`);
    socket.emit("startGame", { room: roomCode });
  };

  const copyCode = async () => {
    if (!roomCode) return;
    await navigator.clipboard.writeText(roomCode);
    alert("Copied");
  };

  const shareNative = async () => {
    if (!roomCode) return;
    const url = `${window.location.origin}/game?room=${roomCode}`;
    if ((navigator as any).share) {
      try { await (navigator as any).share({ title: "Join my White & Red game", text: roomCode, url }); }
      catch {}
    } else {
      await navigator.clipboard.writeText(`${roomCode} ${url}`);
      alert("Copied link");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold">White & Red</h1>
          <p className="text-sm text-muted-foreground">A fast 2-player duel</p>
        </div>

        <div className="space-y-3">
          <input className="w-full p-3 rounded-xl bg-card border border-border" value={name} onChange={(e)=>setName(e.target.value)} placeholder="Your name" />
          <Button className="w-full" onClick={createRoom}><Plus className="mr-2" />Create Room</Button>
          <Button className="w-full" variant="outline" onClick={()=>setShowJoin(true)}><Users className="mr-2" />Join Room</Button>
        </div>

        {roomCode && (
          <div className="p-4 rounded-2xl bg-card border border-border text-center">
            <div className="text-xs text-muted-foreground">Room created</div>
            <div className="text-3xl font-mono my-3">{roomCode}</div>
            <p className="text-xs text-muted-foreground">Share this with a friend</p>
            <div className="flex gap-2 mt-4">
              <Button className="flex-1" onClick={copyCode}>Copy Code</Button>
              <Button className="flex-1" onClick={shareNative}><Share2 className="mr-2" />Share</Button>
            </div>
            <div className="flex gap-2 mt-3">
              <Button variant="outline" className="flex-1" onClick={()=>setRoomCode(null)}>Close</Button>
              <Button className="flex-1" onClick={startGame}>Start Game</Button>
            </div>
          </div>
        )}

      </div>

      <JoinRoomSheet isOpen={showJoin} onClose={()=>setShowJoin(false)} />
    </div>
  );
};

export default Index;
