"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// word list from the original wordle bank (~2315 words), hosted on github
const WORD_LIST_URL =
    "https://raw.githubusercontent.com/tabatkins/wordle-list/main/words";

// daily answer from date seed
function pickDailyWord(words: string[]): string {
    const now = new Date();
    const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    return words[seed % words.length].toUpperCase();
}

// check if word exists via datamuse api (free, no key)
// fails open so players arent blocked if api is down
async function isRealWord(word: string): Promise<boolean> {
    try {
        const res = await fetch(
            `https://api.datamuse.com/words?sp=${word.toLowerCase()}&max=1`
        );
        const data: { word: string }[] = await res.json();
        return data.length > 0 && data[0].word.toUpperCase() === word;
    } catch {
        return true; // fail open if api is down
    }
}

const MAX_GUESSES = 6;
const WORD_LEN = 5;

type LetterState = "correct" | "present" | "absent" | "empty" | "active";

interface LetterTile {
    letter: string;
    state: LetterState;
}

function evaluateGuess(guess: string, answer: string): LetterState[] {
    const result: LetterState[] = Array(WORD_LEN).fill("absent");
    const answerArr = answer.split("");
    const guessArr = guess.split("");
    const used = Array(WORD_LEN).fill(false);

    // first pass: greens
    for (let i = 0; i < WORD_LEN; i++) {
        if (guessArr[i] === answerArr[i]) {
            result[i] = "correct";
            used[i] = true;
        }
    }
    // second pass: yellows
    for (let i = 0; i < WORD_LEN; i++) {
        if (result[i] === "correct") continue;
        const idx = answerArr.findIndex((c, j) => !used[j] && c === guessArr[i]);
        if (idx !== -1) {
            result[i] = "present";
            used[idx] = true;
        }
    }
    return result;
}

const TILE_COLORS: Record<LetterState, string> = {
    correct: "bg-green-600 border-green-600 text-white",
    present: "bg-yellow-500 border-yellow-500 text-white",
    absent: "bg-gray-600 border-gray-600 text-white dark:bg-gray-700 dark:border-gray-700",
    empty: "bg-transparent border-border",
    active: "bg-transparent border-foreground",
};

const KEY_COLORS: Record<LetterState, string> = {
    correct: "bg-green-600 text-white border-green-600",
    present: "bg-yellow-500 text-white border-yellow-500",
    absent: "bg-gray-500 text-white border-gray-500 dark:bg-gray-700",
    empty: "bg-border/60 text-foreground border-border",
    active: "bg-border/60 text-foreground border-border",
};

const KEYBOARD_ROWS = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "⌫"],
];

export default function BlorbPage() {
    const [words, setWords] = useState<string[]>([]);
    const [answer, setAnswer] = useState("");
    const [loadingWords, setLoadingWords] = useState(true);
    const [validating, setValidating] = useState(false);

    const [board, setBoard] = useState<LetterTile[][]>(() =>
        Array.from({ length: MAX_GUESSES }, () =>
            Array.from({ length: WORD_LEN }, () => ({ letter: "", state: "empty" as LetterState }))
        )
    );
    const [currentRow, setCurrentRow] = useState(0);
    const [currentCol, setCurrentCol] = useState(0);
    const [gameOver, setGameOver] = useState(false);
    const [won, setWon] = useState(false);
    const [message, setMessage] = useState("");
    const [keyStates, setKeyStates] = useState<Record<string, LetterState>>({});
    const [shakeRow, setShakeRow] = useState<number | null>(null);
    const [revealRow, setRevealRow] = useState<number | null>(null);

    // fetch word list on mount
    useEffect(() => {
        fetch(WORD_LIST_URL)
            .then(r => r.text())
            .then(text => {
                const list = text.trim().split("\n").map(w => w.trim().toUpperCase()).filter(w => w.length === 5);
                setWords(list);
                setAnswer(pickDailyWord(list));
            })
            .catch(() => {
                // github down? use hardcoded fallback
                const fallback = ["CRANE", "SLATE", "ADIEU", "RAISE", "LIGHT", "PLANT", "STORM", "BRAVE", "CHUNK", "GLOOM"];
                setWords(fallback);
                setAnswer(pickDailyWord(fallback));
            })
            .finally(() => setLoadingWords(false));
    }, []);

    const showMessage = (msg: string, duration = 1800) => {
        setMessage(msg);
        setTimeout(() => setMessage(""), duration);
    };

    const submitGuess = useCallback(async () => {
        if (gameOver || !answer) return;
        const guess = board[currentRow].map(t => t.letter).join("");
        if (guess.length < WORD_LEN) { showMessage("Not enough letters"); setShakeRow(currentRow); setTimeout(() => setShakeRow(null), 600); return; }

        // validate word
        setValidating(true);
        const valid = await isRealWord(guess);
        setValidating(false);
        if (!valid) { showMessage("Not a word"); setShakeRow(currentRow); setTimeout(() => setShakeRow(null), 600); return; }

        const result = evaluateGuess(guess, answer);

        // animate
        setRevealRow(currentRow);
        setTimeout(() => setRevealRow(null), WORD_LEN * 300 + 200);

        const newBoard = board.map(r => [...r]);
        result.forEach((state, i) => { newBoard[currentRow][i] = { letter: guess[i], state }; });
        setBoard(newBoard);

        // update kb colors
        setKeyStates(prev => {
            const next = { ...prev };
            result.forEach((state, i) => {
                const key = guess[i];
                const priority: LetterState[] = ["correct", "present", "absent", "empty"];
                if (priority.indexOf(state) < priority.indexOf(next[key] ?? "empty")) next[key] = state;
            });
            return next;
        });

        if (result.every(s => s === "correct")) {
            const praise = ["Genius!", "Magnificent!", "Impressive!", "Splendid!", "Great!", "Phew!"];
            setTimeout(() => { showMessage(praise[currentRow] ?? "Blorb!!", 3000); setWon(true); setGameOver(true); }, WORD_LEN * 300 + 100);
        } else if (currentRow + 1 === MAX_GUESSES) {
            setTimeout(() => { showMessage(answer, 4000); setGameOver(true); }, WORD_LEN * 300 + 100);
        } else {
            setCurrentRow(r => r + 1);
            setCurrentCol(0);
        }
    }, [board, currentRow, gameOver, answer, validating]);

    const handleKey = useCallback((key: string) => {
        if (gameOver || validating) return;
        if (key === "ENTER") { submitGuess(); return; }
        if (key === "⌫" || key === "BACKSPACE") {
            if (currentCol === 0) return;
            const newBoard = board.map(r => [...r]);
            newBoard[currentRow][currentCol - 1] = { letter: "", state: "empty" };
            setBoard(newBoard);
            setCurrentCol(c => c - 1);
            return;
        }
        if (/^[A-Z]$/.test(key) && currentCol < WORD_LEN) {
            const newBoard = board.map(r => [...r]);
            newBoard[currentRow][currentCol] = { letter: key, state: "active" };
            setBoard(newBoard);
            setCurrentCol(c => c + 1);
        }
    }, [board, currentRow, currentCol, gameOver, submitGuess]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            handleKey(e.key.toUpperCase());
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [handleKey]);

    return (
        <div className="min-h-screen flex flex-col items-center pt-8 pb-16 select-none">

            {/* Header */}
            <div className="text-center mb-2 border-b border-border pb-5 w-full max-w-lg px-4">
                <h1 className="font-serif text-5xl font-bold tracking-tight text-foreground">Blorb</h1>
                <p className="font-sans text-xs font-bold uppercase tracking-[0.25em] text-gray-500 mt-1">Wordle but worse</p>
            </div>

            {loadingWords ? (
                <div className="flex flex-col items-center gap-3 mt-16 text-gray-500 font-sans">
                    <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
                    <span className="text-xs uppercase tracking-widest">Loading words…</span>
                </div>
            ) : (
                <>
                    {/* Toast */}
                    <div className={`transition-all duration-200 mb-4 h-10 flex items-center justify-center ${(message || validating) ? 'opacity-100' : 'opacity-0'}`}>
                        <span className="bg-foreground text-background font-sans text-sm font-bold px-4 py-2 rounded-md shadow-lg tracking-wide">
                            {validating ? "Checking…" : message}
                        </span>
                    </div>

                    {/* Board */}
                    <div className="grid gap-1.5 mb-6">
                        {board.map((row, r) => (
                            <div
                                key={r}
                                className={`flex gap-1.5 ${shakeRow === r ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}
                            >
                                {row.map((tile, c) => (
                                    <div
                                        key={c}
                                        className={`w-14 h-14 flex items-center justify-center border-2 text-2xl font-bold font-sans
                                            ${TILE_COLORS[tile.state]}
                                            ${tile.letter && tile.state === 'active' ? 'scale-110' : ''}
                                        `}
                                        style={revealRow === r ? { animationDelay: `${c * 300}ms` } : undefined}
                                    >
                                        {tile.letter}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    {/* Keyboard */}
                    <div className="flex flex-col items-center gap-1.5">
                        {KEYBOARD_ROWS.map((row, ri) => (
                            <div key={ri} className="flex gap-1.5">
                                {row.map((key) => {
                                    const state = keyStates[key] ?? "empty";
                                    const isWide = key === "ENTER" || key === "⌫";
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => handleKey(key)}
                                            className={`h-14 ${isWide ? 'px-3 text-xs min-w-[56px]' : 'w-10'} rounded font-bold font-sans text-sm border transition-colors active:scale-95 ${KEY_COLORS[state]}`}
                                        >
                                            {key}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    {/* Win / lose banner */}
                    {gameOver && (
                        <div className={`mt-8 px-8 py-5 rounded-sm border text-center max-w-xs ${won ? 'border-green-600 bg-green-600/10' : 'border-border bg-border/10'}`}>
                            {won ? (
                                <>
                                    <p className="font-serif text-2xl font-bold text-foreground mb-1">Blorbed it! 🎉</p>
                                    <p className="font-sans text-sm text-gray-500">Come back tomorrow for a new word.</p>
                                </>
                            ) : (
                                <>
                                    <p className="font-serif text-2xl font-bold text-foreground mb-1">The word was</p>
                                    <p className="font-serif text-4xl font-bold text-accent mb-2">{answer}</p>
                                    <p className="font-sans text-sm text-gray-500">Better luck tomorrow.</p>
                                </>
                            )}
                        </div>
                    )}
                </>
            )}

            <style>{`
                @keyframes shake {
                    0%,100% { transform: translateX(0); }
                    20% { transform: translateX(-6px); }
                    40% { transform: translateX(6px); }
                    60% { transform: translateX(-4px); }
                    80% { transform: translateX(4px); }
                }
            `}</style>
        </div>
    );
}
