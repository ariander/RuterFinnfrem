"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Image from "next/image";

interface TimeSelectorProps {
  lastMileMode: "walk" | "scooter";
  transitTime: number;
  walkTime: number;
  onLastMileModeChange: (mode: "walk" | "scooter") => void;
  onTransitChange: (val: string) => void;
  onWalkChange: (val: string) => void;
}

export function TimeSelector({
  lastMileMode,
  transitTime,
  walkTime,
  onLastMileModeChange,
  onTransitChange,
  onWalkChange,
}: TimeSelectorProps) {
  const isScooter = lastMileMode === "scooter";

  return (
    <div className="flex items-center justify-between sm:justify-start sm:gap-4 px-1 w-full">
      {/* Transit */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 relative shrink-0">
          <Image src="/public-transport.svg" alt="Kollektiv" fill />
        </div>
        <Select
          value={`${transitTime} min`}
          onValueChange={(val) => { if (val) onTransitChange(val); }}
        >
          <SelectTrigger className="border-none bg-ink-primary/5 rounded-md h-8 w-20 font-medium text-ink-primary text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-md border-none shadow-xl">
            <SelectItem value="0 min">0 min</SelectItem>
            <SelectItem value="5 min">5 min</SelectItem>
            <SelectItem value="10 min">10 min</SelectItem>
            <SelectItem value="15 min">15 min</SelectItem>
            <SelectItem value="20 min">20 min</SelectItem>
            <SelectItem value="30 min">30 min</SelectItem>
            <SelectItem value="45 min">45 min</SelectItem>
            <SelectItem value="60 min">60 min</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <span className="text-ink-primary/50 text-base shrink-0">+</span>

      {/* Last-mile: toggle icon + time */}
      <div className="flex items-center gap-2">
        {/* Toggle switch: walk ↔ scooter */}
        <button
          onClick={() => onLastMileModeChange(isScooter ? "walk" : "scooter")}
          className="relative flex items-center shrink-0 h-8 w-14 gap-0.5 rounded-full bg-ink-primary/10 p-1 transition-colors"
          title={isScooter ? "Bytt til gange" : "Bytt til sparkesykkel"}
        >
          {/* Sliding pill */}
          <span
            className={`absolute top-0.5 h-7 w-7 rounded-full bg-white shadow-md transition-all duration-200 ${
              isScooter ? "left-[calc(100%-1.85rem)]" : "left-0.5"
            }`}
          />
          {/* Walk icon */}
          <span className={`relative z-10 flex h-7 w-7 items-center justify-center transition-opacity ${isScooter ? "opacity-50" : "opacity-100"}`}>
            <Image src="/walk.svg" alt="Gange" width={16} height={16} />
          </span>
          {/* Scooter icon */}
          <span className={`relative z-10 flex h-7 w-7 items-center justify-center transition-opacity ${isScooter ? "opacity-100" : "opacity-50"}`}>
            <Image src="/scooter.svg" alt="Sparkesykkel" width={16} height={16} />
          </span>
        </button>

        <Select
          value={`${walkTime} min`}
          onValueChange={(val) => { if (val) onWalkChange(val); }}
        >
          <SelectTrigger className="border-none bg-ink-primary/5 rounded-lg h-8 w-20 font-medium text-ink-primary text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-md border-none shadow-xl">
            <SelectItem value="0 min">0 min</SelectItem>
            <SelectItem value="5 min">5 min</SelectItem>
            <SelectItem value="10 min">10 min</SelectItem>
            <SelectItem value="15 min">15 min</SelectItem>
            <SelectItem value="20 min">20 min</SelectItem>
            <SelectItem value="30 min">30 min</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <span className="hidden sm:block text-ink-primary/50 text-base shrink-0">=</span>
      <div className="hidden sm:block shrink-0 font-bold text-sm text-ink-primary">
        {transitTime + walkTime} min
      </div>
    </div>
  );
}
