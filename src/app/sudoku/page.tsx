"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { getSudoku } from "sudoku-gen";
import { format } from "date-fns";
import Link from "next/link";
import { ArrowLeft, RefreshCw, PenTool, Eraser, CheckCircle, Trash2 } from "lucide-react";

type Cell = {
    value: string;
    notes: string[];
    isInitial: boolean;
    isErr: boolean;
};

// seeded prng so puzzle is the same all day
function seededRandom(seed: number) {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

// monkeypatch Math.random because brendan eich in his infinite goddamn wisdom made it impossible to seed. so we just overwrite a global like fucking animals.
function generateDailyPuzzle() {
    const today = new Date();
    // seed from date
    const seedString = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    let seed = parseInt(seedString, 10); // yes the radix is required. thanks brendan

    const originalRandom = Math.random;
    try {
        Math.random = () => seededRandom(seed++);
        return getSudoku("medium");
    } finally {
        Math.random = originalRandom; // restore
    }
}

export default function SudokuPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    const [board, setBoard] = useState<Cell[][]>([]);
    const [solution, setSolution] = useState<string>("");
    const [isComplete, setIsComplete] = useState(false);

    const [mode, setMode] = useState<"normal" | "notes">("normal");
    const [selectedCell, setSelectedCell] = useState<{ r: number, c: number } | null>(null);

    // gen puzzle once on mount
    useEffect(() => {
        const puzzle = generateDailyPuzzle();

        // parse 81-char string into 9x9 grid
        const initialBoard: Cell[][] = [];
        for (let i = 0; i < 9; i++) {
            const row: Cell[] = [];
            for (let j = 0; j < 9; j++) {
                const char = puzzle.puzzle[i * 9 + j];
                row.push({
                    value: char === '-' ? "" : char,
                    notes: [],
                    isInitial: char !== '-',
                    isErr: false,
                });
            }
            initialBoard.push(row);
        }


        setSolution(puzzle.solution);
        setBoard(initialBoard);
    }, []);

    // auth guard
    useEffect(() => {
        if (!loading && !user) {
            router.push("/");
        }
    }, [user, loading, router]);

    const handleInput = useCallback((char: string) => {
        if (!selectedCell || isComplete) return;

        setBoard(prevBoard => {
            const newBoard = prevBoard.map(r => [...r]);
            const oldCell = newBoard[selectedCell.r][selectedCell.c];

            if (oldCell.isInitial) return prevBoard;

            const newCell = { ...oldCell };

            // clear
            if (char === "clear") {
                newCell.value = "";
                newCell.notes = [];
                newCell.isErr = false;
            } else if (mode === "normal") {
                newCell.value = newCell.value === char ? "" : char;
                newCell.notes = [];
                newCell.isErr = false;
            } else { // notes mode
                if (newCell.value) return prevBoard; // cant add notes to filled cell

                if ((newCell.notes || []).includes(char)) {
                    newCell.notes = (newCell.notes || []).filter(n => n !== char);
                } else {
                    newCell.notes = [...(newCell.notes || []), char].sort();
                }
            }

            newBoard[selectedCell.r][selectedCell.c] = newCell;
            return newBoard;
        });
    }, [selectedCell, isComplete, mode]);

    // keyboard
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key >= '1' && e.key <= '9') {
                handleInput(e.key);
            } else if (e.key === 'Backspace' || e.key === 'Delete') {
                handleInput("clear");
            } else if (e.key.toLowerCase() === 'n') {
                setMode(prev => prev === "normal" ? "notes" : "normal");
            } else if (selectedCell && !isComplete) {
                let { r, c } = selectedCell;
                if (e.key === 'ArrowUp') r = Math.max(0, r - 1);
                else if (e.key === 'ArrowDown') r = Math.min(8, r + 1);
                else if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
                else if (e.key === 'ArrowRight') c = Math.min(8, c + 1);

                if (r !== selectedCell.r || c !== selectedCell.c) {
                    setSelectedCell({ r, c });
                    e.preventDefault();
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedCell, isComplete, handleInput]);

    const checkSolution = () => {
        let complete = true;
        const newBoard = [...board].map(row => [...row]);

        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                const cell = newBoard[i][j];
                const correctValue = solution[i * 9 + j];

                if (!cell.isInitial) {
                    if (cell.value !== correctValue) {
                        cell.isErr = true;
                        complete = false;
                    } else if (cell.value === "") {
                        complete = false;
                    }
                }
            }
        }
        setBoard(newBoard);
        setIsComplete(complete);
    };

    const resetBoard = () => {
        if (!confirm("Are you sure you want to clear your progress?")) return;
        setBoard(prev => prev.map(row =>
            row.map(cell => cell.isInitial ? cell : { ...cell, value: "", notes: [], isErr: false })
        ));
        setIsComplete(false);
        setSelectedCell(null);
    };

    // count how many of each digit are placed
    const digitCounts: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0 };
    board.forEach(row => row.forEach(cell => {
        if (cell.value && digitCounts[cell.value] !== undefined) {
            digitCounts[cell.value]++;
        }
    }));

    if (loading || !user || board.length === 0) {
        return (
            <div className="flex justify-center items-center min-h-[60vh]">
                <RefreshCw className="w-8 h-8 text-border animate-spin" />
            </div>
        );
    }

    const todayStr = format(new Date(), "EEEE, MMMM do, yyyy");

    return (
        <div className="max-w-4xl mx-auto px-2 sm:px-6 py-12 flex flex-col items-center select-none animate-in fade-in duration-500">
            <div className="w-full mb-8 flex justify-center">
                <Link href="/" className="inline-flex items-center text-gray-400 hover:text-foreground font-sans text-xs uppercase tracking-[0.2em] font-bold transition-colors group">
                    <ArrowLeft className="w-3 h-3 mr-2 transform group-hover:-translate-x-1 transition-transform" />
                    Back to Front Page
                </Link>
            </div>

            <div className="text-center mb-10">
                <h1 className="font-serif text-5xl md:text-6xl font-bold tracking-tighter text-foreground mb-4">Daily Sudoku</h1>
                <p className="font-sans text-gray-500 uppercase tracking-[0.2em] text-xs font-bold">
                    {todayStr}
                </p>
            </div>

            {isComplete ? (
                <div className="bg-green-50/50 border border-green-200 text-green-700 rounded-sm p-6 mb-8 text-center w-full max-w-md shadow-sm">
                    <h2 className="font-serif text-2xl font-bold mb-2 tracking-tight">Puzzle Solved!</h2>
                    <p className="font-sans text-sm tracking-wide">Congratulations! Come back tomorrow for a new challenge.</p>
                </div>
            ) : null}

            <div className="flex flex-col lg:flex-row items-center lg:items-start justify-center w-full max-w-5xl mx-auto">
                {/* Board Column */}
                <div className="flex flex-col items-center">
                    {/* Controls Top Grid */}
                    <div className="flex w-full justify-between items-center mb-4 px-2">
                        <button
                            onClick={() => setMode(m => m === "normal" ? "notes" : "normal")}
                            className={`flex items-center space-x-2 px-4 py-2 rounded-sm font-sans text-xs font-bold uppercase tracking-widest transition-colors ${mode === "notes" ? "bg-red-500 text-white shadow-md block" : "bg-gray-100 dark:bg-[#1C1F26] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#252A34]"
                                }`}
                            title="Toggle Notes Mode (N)"
                        >
                            <PenTool className="w-4 h-4" />
                            <span>Notes: {mode === "notes" ? "ON" : "OFF"}</span>
                        </button>

                        <div className="flex space-x-2">
                            <button
                                onClick={checkSolution}
                                disabled={isComplete}
                                className="flex lg:hidden items-center px-4 py-2 bg-foreground text-background font-sans text-xs uppercase tracking-widest font-bold hover:bg-foreground/80 shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Check Grid"
                            >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Check
                            </button>
                            <button onClick={resetBoard} className="text-gray-400 hover:text-red-500 transition-colors p-2" title="Clear Grid">
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Main Grid */}
                    <div className="bg-border dark:bg-[#3A3F4A] border-[4px] border-foreground dark:border-[#4A505C] shadow-2xl">
                        <div className="grid grid-cols-9 bg-border dark:bg-[#3A3F4A] gap-[1px]">
                            {board.map((row, r) => (
                                row.map((cell, c) => {
                                    const isRightEdge = c % 3 === 2 && c !== 8;
                                    const isBottomEdge = r % 3 === 2 && r !== 8;
                                    const isSelected = selectedCell?.r === r && selectedCell?.c === c;

                                    // bg color
                                    let bgColor = "bg-background hover:bg-gray-50 dark:bg-[#20242B] dark:hover:bg-[#282D36]";
                                    if (isSelected) bgColor = "bg-red-50 dark:bg-red-900/40";
                                    else if (cell.isErr) bgColor = "bg-red-100 dark:bg-red-900/60";
                                    else if (cell.isInitial) bgColor = "bg-gray-100/80 dark:bg-[#15181E]";
                                    else if (selectedCell && board[selectedCell.r][selectedCell.c].value && cell.value === board[selectedCell.r][selectedCell.c].value) {
                                        bgColor = "bg-red-50/50 dark:bg-red-900/20"; // same number highlight
                                    }

                                    return (
                                        <div
                                            key={`${r}-${c}`}
                                            onClick={() => setSelectedCell({ r, c })}
                                            className={`
                                            relative flex items-center justify-center cursor-pointer transition-colors
                                            w-10 h-10 sm:w-14 sm:h-14 lg:w-16 lg:h-16
                                            ${isRightEdge ? 'border-r-[3px] border-r-foreground dark:border-r-[#4A505C]' : ''}
                                            ${isBottomEdge ? 'border-b-[3px] border-b-foreground dark:border-b-[#4A505C]' : ''}
                                            ${bgColor}
                                        `}
                                        >
                                            {cell.value ? (
                                                <span className={`
                                                font-sans text-2xl sm:text-3xl pt-1
                                                ${cell.isInitial ? "font-bold text-foreground" : "font-bold text-red-600 dark:text-red-400"}
                                                ${cell.isErr ? "!text-red-500" : ""}
                                            `}>
                                                    {cell.value}
                                                </span>
                                            ) : (
                                                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 p-[2px]">
                                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => {
                                                        const nStr = n.toString();
                                                        return (
                                                            <div key={n} className="flex items-center justify-center">
                                                                {(cell.notes || []).includes(nStr) && (
                                                                    <span className="text-[10px] sm:text-xs font-sans font-medium text-foreground/50 leading-none">
                                                                        {nStr}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            ))}
                        </div>
                    </div>
                </div>

                {/* Keypad Column */}
                <div className="mt-8 lg:mt-12 px-2 w-full lg:w-48 xl:w-64 space-y-4 flex flex-col">
                    <div className="grid grid-cols-5 lg:grid-cols-3 gap-2 lg:gap-3">
                        {/* Number Buttons */}
                        {(['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const).map(num => {
                            const isDone = digitCounts[num] >= 9;
                            return (
                                <button
                                    key={num}
                                    onClick={() => handleInput(num)}
                                    disabled={isDone || isComplete}
                                    className={`
                                        flex flex-col items-center justify-center py-2 sm:py-3 rounded-sm border whitespace-nowrap
                                        transition-all active:scale-95
                                        ${isDone
                                            ? 'opacity-30 bg-background border-border dark:border-[#3A3F4A] cursor-not-allowed'
                                            : 'bg-background border-border dark:border-[#3A3F4A] hover:border-red-500 dark:hover:border-red-400 hover:text-red-500 dark:hover:text-red-400 shadow-sm'}
                                    `}
                                >
                                    <span className="font-serif text-xl sm:text-2xl font-bold leading-none text-foreground">{num}</span>
                                </button>
                            );
                        })}

                        {/* Eraser Button */}
                        <button
                            onClick={() => handleInput("clear")}
                            className="col-span-1 lg:col-span-3 flex items-center justify-center py-2 lg:py-4 bg-background border border-border dark:border-[#3A3F4A] shadow-sm rounded-sm hover:border-red-500 hover:text-red-500 transition-colors"
                            title="Erase cell (Backspace)"
                        >
                            <Eraser className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="hidden lg:flex pt-6 justify-center w-full">
                        <button
                            onClick={checkSolution}
                            disabled={isComplete}
                            className="flex items-center px-8 py-4 bg-foreground text-background font-sans text-[10px] xl:text-xs uppercase tracking-[0.2em] font-bold hover:bg-foreground/80 shadow-md focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center"
                        >
                            <CheckCircle className="w-4 h-4 mr-3" />
                            Check Grid
                        </button>
                    </div>
                </div>
            </div>

            <p className="font-sans text-[10px] uppercase tracking-widest text-gray-400 mt-16 text-center max-w-sm">
                Generated dynamically every day at midnight local time. All authorized users share the same daily puzzle.
            </p>
        </div>
    );
}
