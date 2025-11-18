// src/components/JoinRoomSheet.tsx
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { socket } from "@/socket";

interface Props { isOpen: boolean; onClose: () => void; }

const JoinRoomSheet = ({ isOpen, onClose }: Props) => {
  const [roomCode, setRoomCode] = useState("");
  const [name, setName] = useState(localStorage.getItem("wr-name") || "");
  const navigate = useNavigate();

  const joinRoom = () => {
    if (!roomCode.trim() || !name.trim()) { alert("Enter name and room code"); return; }
    localStorage.setItem("wr-name", name);
    socket.emit("joinRoom", { room: roomCode.toUpperCase(), name });
    navigate(`/game?room=${roomCode.toUpperCase()}`);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="bg-card border-t border-border rounded-t-3xl">
        <SheetHeader><SheetTitle className="text-center">Join Room</SheetTitle></SheetHeader>

        <div className="space-y-6 mt-6 pb-6">
          <Input placeholder="Your name" value={name} onChange={(e)=>setName(e.target.value)} className="text-center"/>
          <Input placeholder="ROOM CODE" value={roomCode} onChange={(e)=>setRoomCode(e.target.value.toUpperCase())} className="text-center" maxLength={6}/>
          <Button onClick={joinRoom} className="w-full h-14">Join Room</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default JoinRoomSheet;
