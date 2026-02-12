"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function transposeChord(chord: string, semitones: number): string {
  if (!chord) return chord;
  
  const match = chord?.match?.(/^([A-G][#b]?)(.*)/i);
  if (!match) return chord;
  
  const [, root, suffix] = match ?? [];
  const useFlats = root?.includes?.("b");
  const notes = useFlats ? NOTES_FLAT : NOTES;
  
  let index = NOTES?.indexOf?.(root?.replace?.("b", "")?.toUpperCase?.() ?? '') ?? -1;
  if (index === -1) index = NOTES_FLAT?.indexOf?.(root?.toUpperCase?.() ?? '') ?? -1;
  if (index === -1) return chord;
  
  const newIndex = ((index + semitones) % 12 + 12) % 12;
  return notes?.[newIndex] + (suffix ?? '');
}

function parseChordPro(text: string, semitones: number): { type: "chord" | "text"; content: string }[][] {
  if (!text) return [];
  
  const lines = text?.split?.("\n") ?? [];
  return lines?.map?.((line) => {
    const parts: { type: "chord" | "text"; content: string }[] = [];
    let lastIndex = 0;
    const regex = /\[([^\]]+)\]/g;
    let match;

    while ((match = regex?.exec?.(line ?? '')) !== null) {
      if (match?.index > lastIndex) {
        parts?.push?.({ type: "text", content: line?.slice?.(lastIndex, match?.index) ?? '' });
      }
      parts?.push?.({ type: "chord", content: transposeChord(match?.[1] ?? '', semitones) });
      lastIndex = (match?.index ?? 0) + (match?.[0]?.length ?? 0);
    }

    if (lastIndex < (line?.length ?? 0)) {
      parts?.push?.({ type: "text", content: line?.slice?.(lastIndex) ?? '' });
    }

    return parts;
  }) ?? [];
}

interface ChordProViewerProps {
  chordPro: string;
  initialKey?: string;
  selectedKey?: string;
}

export function ChordProViewer({ chordPro, initialKey, selectedKey }: ChordProViewerProps) {
  const [transpose, setTranspose] = useState(0);

  const semitonesDiff = useMemo(() => {
    if (!initialKey || !selectedKey) return 0;
    const fromIndex = NOTES?.indexOf?.(initialKey?.replace?.("m", "")?.toUpperCase?.() ?? '') ?? -1;
    const toIndex = NOTES?.indexOf?.(selectedKey?.replace?.("m", "")?.toUpperCase?.() ?? '') ?? -1;
    if (fromIndex === -1 || toIndex === -1) return 0;
    return toIndex - fromIndex;
  }, [initialKey, selectedKey]);

  const totalTranspose = semitonesDiff + transpose;

  const parsedLines = useMemo(
    () => parseChordPro(chordPro ?? '', totalTranspose),
    [chordPro, totalTranspose]
  );

  const currentKey = useMemo(() => {
    const baseKey = selectedKey ?? initialKey ?? "C";
    return transposeChord(baseKey, transpose);
  }, [selectedKey, initialKey, transpose]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 dark:text-gray-400">Tom:</span>
          <span className="font-bold text-purple-600 dark:text-purple-400">{currentKey}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTranspose((t) => t - 1)}
          >
            <ChevronDown className="w-4 h-4" />
          </Button>
          <span className="text-sm font-mono w-8 text-center">
            {transpose > 0 ? `+${transpose}` : transpose}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTranspose((t) => t + 1)}
          >
            <ChevronUp className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="font-mono text-sm leading-relaxed bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto">
        {parsedLines?.map?.((line, i) => (
          <div key={i} className="whitespace-pre-wrap">
            {(line?.length ?? 0) === 0 ? (
              <br />
            ) : (
              line?.map?.((part, j) =>
                part?.type === "chord" ? (
                  <span
                    key={j}
                    className="text-purple-600 dark:text-purple-400 font-bold"
                  >
                    [{part?.content ?? ''}]
                  </span>
                ) : (
                  <span key={j}>{part?.content ?? ''}</span>
                )
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
