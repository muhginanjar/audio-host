import type { AudioDTO } from "@shared/types";
import { formatDuration } from "../lib/format";
import { cn } from "./ui";

/**
 * Native HTML5 player per brief §22 (play/pause, progress, duration, volume,
 * speed via browser controls) — deliberately not a custom player.
 */
export function AudioPlayer({ audio, className }: { audio: AudioDTO; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <audio controls preload="metadata" className="h-10 w-full">
        <source src={audio.url} type={audio.mime_type} />
        Your browser does not support the audio element.
      </audio>
      <p className="text-[11px] text-slate-400">
        {audio.filename}
        {audio.duration !== null ? ` · ${formatDuration(audio.duration)}` : ""}
      </p>
    </div>
  );
}
