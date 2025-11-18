// src/components/WinnerModal.tsx
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trophy, X } from "lucide-react";

interface Props {
  isOpen: boolean;
  isWinner: boolean;
  onPlayAgain: () => void;
  onExit: () => void;
  onClose?: () => void;
}

const WinnerModal = ({ isOpen, isWinner, onPlayAgain, onExit, onClose }: Props) => {
  return (
    <Dialog open={isOpen}>
      <DialogContent className="bg-background border-border max-w-sm mx-auto">
        <div className="text-right">
          <button onClick={() => onClose ? onClose() : onExit()} className="p-1 rounded hover:bg-muted"><X /></button>
        </div>

        <div className="text-center py-4 space-y-4">
          {isWinner ? (
            <>
              <Trophy className="h-20 w-20 text-primary mx-auto" />
              <h2 className="text-3xl font-bold">You Win!</h2>
              <p className="text-muted-foreground">You guessed the secret first!</p>
            </>
          ) : (
            <>
              <X className="h-20 w-20 text-destructive mx-auto" />
              <h2 className="text-3xl font-bold">You Lost</h2>
              <p className="text-muted-foreground">Opponent guessed your secret first</p>
            </>
          )}
          <div className="space-y-3 pt-2">
            <Button onClick={onPlayAgain} className="w-full bg-primary">Play Again</Button>
            <Button onClick={onExit} variant="outline" className="w-full">Exit to Home</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WinnerModal;
