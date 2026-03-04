"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";
import { ArrowLeft, RefreshCw, PenTool, Eraser, CheckCircle, Trash2 } from "lucide-react";



const GRID_SIZE = 6;

type Cell = {
    value: string;
    notes: string[];
    isErr: boolean;
};

type Cage = {
    cells: [number, number][];
    target: number;
    op: "+" | "-" | "×" | "÷";
};

// seeded prng

function createRng(seed: number) {
    // clamp to valid 32-bit range
    let s = ((seed % 2147483646) + 2147483646) % 2147483646;
    if (s === 0) s = 1;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}



function generateLatinSquare(rng: () => number): number[][] {
    const grid: number[][] = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));

    function isValid(r: number, c: number, num: number): boolean {
        for (let i = 0; i < GRID_SIZE; i++) {
            if (grid[r][i] === num || grid[i][c] === num) return false;
        }
        return true;
    }

    function solve(pos: number): boolean {
        if (pos === GRID_SIZE * GRID_SIZE) return true;
        const r = Math.floor(pos / GRID_SIZE);
        const c = pos % GRID_SIZE;
        const nums = shuffle(Array.from({ length: GRID_SIZE }, (_, i) => i + 1), rng);
        for (const num of nums) {
            if (isValid(r, c, num)) {
                grid[r][c] = num;
                if (solve(pos + 1)) return true;
                grid[r][c] = 0;
            }
        }
        return false;
    }

    solve(0);
    return grid;
}

// cage gen (max 3 cells so constraints stay tight)

function generateCages(rng: () => number): [number, number][][] {
    const assigned = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
    const cages: [number, number][][] = [];
    const directions: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (assigned[r][c]) continue;

            const cage: [number, number][] = [[r, c]];
            assigned[r][c] = true;

            // 50/50 size 2 or 3, smaller = more constrained
            const roll = rng();
            const maxSize = roll < 0.5 ? 2 : 3;
            let attempts = 0;

            while (cage.length < maxSize && attempts < 10) {
                attempts++;
                const [cr, cc] = cage[Math.floor(rng() * cage.length)];
                const shuffledDirs = shuffle(directions, rng);
                for (const [dr, dc] of shuffledDirs) {
                    const nr = cr + dr;
                    const nc = cc + dc;
                    if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && !assigned[nr][nc]) {
                        cage.push([nr, nc]);
                        assigned[nr][nc] = true;
                        break;
                    }
                }
            }

            cages.push(cage);
        }
    }

    return cages;
}



function assignOperations(
    cagesCells: [number, number][][],
    solution: number[][],
    rng: () => number
): Cage[] {
    return cagesCells.map(cells => {
        const values = cells.map(([r, c]) => solution[r][c]);

        if (cells.length === 1) {
            return { cells, target: values[0], op: "+" as const };
        }

        if (cells.length === 2) {
            const [a, b] = [Math.max(...values), Math.min(...values)];
            const ops: Cage["op"][] = ["+", "-", "×"];
            if (b > 0 && a % b === 0) ops.push("÷");
            const op = ops[Math.floor(rng() * ops.length)];
            let target: number;
            switch (op) {
                case "+": target = a + b; break;
                case "-": target = a - b; break;
                case "×": target = a * b; break;
                case "÷": target = a / b; break;
            }
            return { cells, target, op };
        }

        // 3 cells: only + or x (- and / dont generalize well)
        const ops: Cage["op"][] = ["+", "×"];
        const op = ops[Math.floor(rng() * ops.length)];
        let target: number;
        if (op === "+") {
            target = values.reduce((s, v) => s + v, 0);
        } else {
            target = values.reduce((p, v) => p * v, 1);
        }
        return { cells, target, op };
    });
}

// solver that counts solutions (bails at 2 to save time)

function countSolutions(cages: Cage[]): number {
    const grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
    const cageMap = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(-1));
    cages.forEach((cage, i) => cage.cells.forEach(([r, c]) => { cageMap[r][c] = i; }));

    let count = 0;

    function cageOk(ci: number): boolean {
        const cage = cages[ci];
        const vals = cage.cells.map(([r, c]) => grid[r][c]);
        const filled = vals.filter(v => v > 0);
        const unfilled = vals.length - filled.length;

        if (unfilled > 0) {
            // partial check - prune if already busted
            if (cage.op === "+") {
                const sum = filled.reduce((s, v) => s + v, 0);
                if (sum >= cage.target) return false; // already too high
                if (sum + unfilled * GRID_SIZE < cage.target) return false; // cant reach
            } else if (cage.op === "×") {
                const prod = filled.reduce((p, v) => p * v, 1);
                if (prod > cage.target) return false;
                if (cage.target % prod !== 0) return false; // wont divide evenly
            }
            return true;
        }

        // all filled, verify
        if (cage.cells.length === 1) return filled[0] === cage.target;

        if (cage.cells.length === 2) {
            const [a, b] = [Math.max(...filled), Math.min(...filled)];
            switch (cage.op) {
                case "+": return a + b === cage.target;
                case "-": return a - b === cage.target;
                case "×": return a * b === cage.target;
                case "÷": return b > 0 && a / b === cage.target && a % b === 0;
            }
        }


        if (cage.op === "+") return filled.reduce((s, v) => s + v, 0) === cage.target;
        if (cage.op === "×") return filled.reduce((p, v) => p * v, 1) === cage.target;
        return false;
    }

    function solve(pos: number): void {
        if (count >= 2) return; // found 2, thats enough to know its not unique
        if (pos === GRID_SIZE * GRID_SIZE) { count++; return; }
        const r = Math.floor(pos / GRID_SIZE);
        const c = pos % GRID_SIZE;

        for (let num = 1; num <= GRID_SIZE; num++) {
            // row/col check
            let ok = true;
            for (let i = 0; i < GRID_SIZE && ok; i++) {
                if (grid[r][i] === num || grid[i][c] === num) ok = false;
            }
            if (!ok) continue;

            grid[r][c] = num;
            if (cageOk(cageMap[r][c])) {
                solve(pos + 1);
            }
            grid[r][c] = 0;
        }
    }

    solve(0);
    return count;
}

// daily puzzle gen w/ uniqueness guarantee

function generateDailyKenKen() {
    const today = new Date();
    const seedStr = `kenken${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    let baseSeed = 0;
    for (let i = 0; i < seedStr.length; i++) baseSeed = ((baseSeed * 31) + seedStr.charCodeAt(i)) | 0;
    baseSeed = Math.abs(baseSeed);

    const rng = createRng(baseSeed);
    const solution = generateLatinSquare(rng);

    // keep trying cage layouts til we get one w/ exactly 1 solution
    for (let attempt = 0; attempt < 100; attempt++) {
        const cageCells = generateCages(rng);
        const cages = assignOperations(cageCells, solution, rng);

        const solutions = countSolutions(cages);
        if (solutions === 1) {
            return { solution, cages };
        }
        // rng advanced so next attempt will be different
    }

    // fallback, shouldnt get here
    const cageCells = generateCages(rng);
    const cages = assignOperations(cageCells, solution, rng);
    return { solution, cages };
}



function buildCageMap(cages: Cage[]): number[][] {
    const map = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(-1));
    cages.forEach((cage, i) => {
        for (const [r, c] of cage.cells) map[r][c] = i;
    });
    return map;
}

function getCageLabel(cage: Cage): string {
    if (cage.cells.length === 1) return String(cage.target);
    return `${cage.target}${cage.op}`;
}

function getCageLabelCell(cage: Cage): string {
    const sorted = [...cage.cells].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return `${sorted[0][0]}-${sorted[0][1]}`;
}



export default function KenKenPage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    const puzzle = useMemo(() => generateDailyKenKen(), []);

    const [board, setBoard] = useState<Cell[][]>([]);
    const [isComplete, setIsComplete] = useState(false);
    const [mode, setMode] = useState<"normal" | "notes">("normal");
    const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(null);

    useEffect(() => {
        setBoard(
            Array.from({ length: GRID_SIZE }, () =>
                Array.from({ length: GRID_SIZE }, () => ({ value: "", notes: [], isErr: false }))
            )
        );
    }, []);

    useEffect(() => {
        if (!loading && !user) router.push("/");
    }, [user, loading, router]);

    const cageMap = useMemo(() => buildCageMap(puzzle.cages), [puzzle.cages]);

    const handleInput = useCallback((char: string) => {
        if (!selectedCell || isComplete) return;
        setBoard(prev => {
            const newBoard = prev.map(r => r.map(c => ({ ...c })));
            const cell = newBoard[selectedCell.r][selectedCell.c];
            if (char === "clear") {
                cell.value = ""; cell.notes = []; cell.isErr = false;
            } else if (mode === "normal") {
                cell.value = cell.value === char ? "" : char;
                cell.notes = []; cell.isErr = false;
            } else {
                if (cell.value) return prev;
                if (cell.notes.includes(char)) {
                    cell.notes = cell.notes.filter(n => n !== char);
                } else {
                    cell.notes = [...cell.notes, char].sort();
                }
            }
            return newBoard;
        });
    }, [selectedCell, isComplete, mode]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const num = parseInt(e.key);
            if (num >= 1 && num <= GRID_SIZE) {
                handleInput(e.key);
            } else if (e.key === "Backspace" || e.key === "Delete") {
                handleInput("clear");
            } else if (e.key.toLowerCase() === "n") {
                setMode(m => m === "normal" ? "notes" : "normal");
            } else if (selectedCell && !isComplete) {
                let { r, c } = selectedCell;
                if (e.key === "ArrowUp") r = Math.max(0, r - 1);
                else if (e.key === "ArrowDown") r = Math.min(GRID_SIZE - 1, r + 1);
                else if (e.key === "ArrowLeft") c = Math.max(0, c - 1);
                else if (e.key === "ArrowRight") c = Math.min(GRID_SIZE - 1, c + 1);
                if (r !== selectedCell.r || c !== selectedCell.c) {
                    setSelectedCell({ r, c }); e.preventDefault();
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedCell, isComplete, handleInput]);

    const checkSolution = () => {
        let correct = true;
        const newBoard = board.map(r => r.map(c => ({ ...c })));
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const val = parseInt(newBoard[r][c].value);
                if (!val || val !== puzzle.solution[r][c]) {
                    newBoard[r][c].isErr = true; correct = false;
                } else {
                    newBoard[r][c].isErr = false;
                }
            }
        }
        setBoard(newBoard);
        setIsComplete(correct);
    };

    const resetBoard = () => {
        if (!confirm("Clear all your progress?")) return;
        setBoard(prev => prev.map(r => r.map(() => ({ value: "", notes: [], isErr: false }))));
        setIsComplete(false); setSelectedCell(null);
    };

    const digitCounts: Record<string, number> = {};
    for (let i = 1; i <= GRID_SIZE; i++) digitCounts[String(i)] = 0;
    board.forEach(row => row.forEach(cell => {
        if (cell.value && digitCounts[cell.value] !== undefined) digitCounts[cell.value]++;
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
                <h1 className="font-serif text-5xl md:text-6xl font-bold tracking-tighter text-foreground mb-2">Daily KenKen</h1>
                <p className="font-sans text-gray-400 uppercase tracking-[0.15em] text-[10px] font-bold mb-1">Mathdoku — {GRID_SIZE}×{GRID_SIZE}</p>
                <p className="font-sans text-gray-500 uppercase tracking-[0.2em] text-xs font-bold">{todayStr}</p>
            </div>

            {isComplete && (
                <div className="bg-green-50/50 border border-green-200 text-green-700 rounded-sm p-6 mb-8 text-center w-full max-w-md shadow-sm">
                    <h2 className="font-serif text-2xl font-bold mb-2 tracking-tight">Puzzle Solved!</h2>
                    <p className="font-sans text-sm tracking-wide">Congratulations! Come back tomorrow for a new challenge.</p>
                </div>
            )}

            <div className="flex flex-col lg:flex-row items-center lg:items-start justify-center w-full max-w-5xl mx-auto">
                {/* Board */}
                <div className="flex flex-col items-center">
                    <div className="flex w-full justify-between items-center mb-4 px-2">
                        <button
                            onClick={() => setMode(m => m === "normal" ? "notes" : "normal")}
                            className={`flex items-center space-x-2 px-4 py-2 rounded-sm font-sans text-xs font-bold uppercase tracking-widest transition-colors ${mode === "notes"
                                ? "bg-red-500 text-white shadow-md"
                                : "bg-gray-100 dark:bg-[#1C1F26] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-[#252A34]"
                                }`}
                            title="Toggle Notes Mode (N)"
                        >
                            <PenTool className="w-4 h-4" />
                            <span>Notes: {mode === "notes" ? "ON" : "OFF"}</span>
                        </button>
                        <div className="flex space-x-2">
                            <button onClick={checkSolution} disabled={isComplete}
                                className="flex lg:hidden items-center px-4 py-2 bg-foreground text-background font-sans text-xs uppercase tracking-widest font-bold hover:bg-foreground/80 shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed" title="Check Grid">
                                <CheckCircle className="w-4 h-4 mr-2" /> Check
                            </button>
                            <button onClick={resetBoard} className="text-gray-400 hover:text-red-500 transition-colors p-2" title="Clear Grid">
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Grid */}
                    <div className="bg-foreground dark:bg-[#4A505C] p-[2px] shadow-2xl">
                        <div className="grid" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}>
                            {board.map((row, r) =>
                                row.map((cell, c) => {
                                    const cageIdx = cageMap[r][c];
                                    const cage = puzzle.cages[cageIdx];
                                    const isSelected = selectedCell?.r === r && selectedCell?.c === c;
                                    const inSelectedCage = selectedCell ? cageMap[selectedCell.r][selectedCell.c] === cageIdx : false;
                                    const isLabel = getCageLabelCell(cage) === `${r}-${c}`;

                                    const borderTop = r === 0 || cageMap[r - 1][c] !== cageIdx ? "border-t-[3px] border-t-foreground dark:border-t-[#4A505C]" : "border-t border-t-border/30";
                                    const borderLeft = c === 0 || cageMap[r][c - 1] !== cageIdx ? "border-l-[3px] border-l-foreground dark:border-l-[#4A505C]" : "border-l border-l-border/30";
                                    const borderRight = c === GRID_SIZE - 1 || cageMap[r][c + 1] !== cageIdx ? "border-r-[3px] border-r-foreground dark:border-r-[#4A505C]" : "border-r-0";
                                    const borderBottom = r === GRID_SIZE - 1 || cageMap[r + 1]?.[c] !== cageIdx ? "border-b-[3px] border-b-foreground dark:border-b-[#4A505C]" : "border-b-0";

                                    let bg = "bg-background dark:bg-[#20242B] hover:bg-gray-50 dark:hover:bg-[#282D36]";
                                    if (isSelected) bg = "bg-red-50 dark:bg-red-900/40";
                                    else if (cell.isErr) bg = "bg-red-100 dark:bg-red-900/60";
                                    else if (inSelectedCage && !isSelected) bg = "bg-gray-50 dark:bg-[#252A34]";

                                    return (
                                        <div key={`${r}-${c}`} onClick={() => setSelectedCell({ r, c })}
                                            className={`relative flex items-center justify-center cursor-pointer transition-colors
                                                w-14 h-14 sm:w-[72px] sm:h-[72px] lg:w-20 lg:h-20
                                                ${borderTop} ${borderLeft} ${borderRight} ${borderBottom} ${bg}`}
                                        >
                                            {isLabel && (
                                                <span className="absolute top-[2px] left-[4px] font-sans text-[10px] sm:text-xs font-bold text-foreground/70 leading-none z-10">
                                                    {getCageLabel(cage)}
                                                </span>
                                            )}
                                            {cell.value ? (
                                                <span className={`font-sans text-2xl sm:text-3xl font-bold ${cell.isErr ? "text-red-500" : "text-red-600 dark:text-red-400"}`}>
                                                    {cell.value}
                                                </span>
                                            ) : (
                                                <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 p-[2px] pt-4 sm:pt-5">
                                                    {Array.from({ length: GRID_SIZE }, (_, i) => i + 1).map(n => {
                                                        const nStr = String(n);
                                                        return (
                                                            <div key={n} className="flex items-center justify-center">
                                                                {cell.notes.includes(nStr) && (
                                                                    <span className="text-[9px] sm:text-[11px] font-sans font-medium text-foreground/50 leading-none">{nStr}</span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Keypad */}
                <div className="mt-8 lg:mt-12 px-2 w-full lg:w-48 xl:w-64 space-y-4 flex flex-col">
                    <div className="grid grid-cols-6 lg:grid-cols-3 gap-2 lg:gap-3">
                        {Array.from({ length: GRID_SIZE }, (_, i) => String(i + 1)).map(num => {
                            const isDone = digitCounts[num] >= GRID_SIZE;
                            return (
                                <button key={num} onClick={() => handleInput(num)} disabled={isDone || isComplete}
                                    className={`flex flex-col items-center justify-center py-2 sm:py-3 rounded-sm border whitespace-nowrap transition-all active:scale-95
                                        ${isDone
                                            ? "opacity-30 bg-background border-border dark:border-[#3A3F4A] cursor-not-allowed"
                                            : "bg-background border-border dark:border-[#3A3F4A] hover:border-red-500 dark:hover:border-red-400 hover:text-red-500 dark:hover:text-red-400 shadow-sm"}`}
                                >
                                    <span className="font-serif text-xl sm:text-2xl font-bold leading-none text-foreground">{num}</span>
                                </button>
                            );
                        })}
                        <button onClick={() => handleInput("clear")}
                            className="col-span-1 lg:col-span-3 flex items-center justify-center py-2 lg:py-4 bg-background border border-border dark:border-[#3A3F4A] shadow-sm rounded-sm hover:border-red-500 hover:text-red-500 transition-colors"
                            title="Erase cell (Backspace)">
                            <Eraser className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="hidden lg:flex pt-6 justify-center w-full">
                        <button onClick={checkSolution} disabled={isComplete}
                            className="flex items-center px-8 py-4 bg-foreground text-background font-sans text-[10px] xl:text-xs uppercase tracking-[0.2em] font-bold hover:bg-foreground/80 shadow-md focus:outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center">
                            <CheckCircle className="w-4 h-4 mr-3" /> Check Grid
                        </button>
                    </div>
                </div>
            </div>

            {/* Rules */}
            <div className="mt-16 max-w-md text-center space-y-3">
                <h3 className="font-sans text-xs uppercase tracking-widest text-foreground font-bold">How to Play</h3>
                <ul className="font-sans text-[11px] text-gray-400 space-y-1 leading-relaxed">
                    <li>Fill each row and column with the numbers 1–{GRID_SIZE} (no repeats).</li>
                    <li>Each cage (bold-bordered group) shows a target number and operation.</li>
                    <li>The numbers in a cage must combine to the target using that operation.</li>
                    <li>For −/÷ cages, start from the largest number.</li>
                </ul>
                <p className="font-sans text-[10px] uppercase tracking-widest text-gray-400 pt-4">
                    A new puzzle is generated every day at midnight local time. Each puzzle is guaranteed to have exactly one solution.
                </p>
            </div>
        </div>
    );
}
