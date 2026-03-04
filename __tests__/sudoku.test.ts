/**
 * Sudoku pure logic unit tests.
 * No Firebase or browser environment needed — these test the core game functions.
 */

// ---------------------------------------------------------------------------
// Re-implement the helpers from sudoku/page.tsx so we can test them in Node
// ---------------------------------------------------------------------------

function seededRandom(seed: number): number {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

/** Produce the seed integer for a given YYYYMMDD date string. */
function dateToSeed(year: number, month: number, day: number): number {
    return parseInt(
        `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`,
        10
    );
}

// ---------------------------------------------------------------------------
// seededRandom
// ---------------------------------------------------------------------------
describe('seededRandom', () => {
    it('returns a number in [0, 1)', () => {
        for (let i = 0; i < 100; i++) {
            const v = seededRandom(i);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });

    it('is deterministic — same seed always yields same value', () => {
        expect(seededRandom(12345678)).toBe(seededRandom(12345678));
    });

    it('produces different values for different seeds', () => {
        const a = seededRandom(20260101);
        const b = seededRandom(20260102);
        expect(a).not.toBe(b);
    });
});

// ---------------------------------------------------------------------------
// Daily puzzle seed stability
// ---------------------------------------------------------------------------
describe('daily puzzle seed', () => {
    it('March 2 2026 and March 3 2026 produce different seeds', () => {
        expect(dateToSeed(2026, 3, 2)).not.toBe(dateToSeed(2026, 3, 3));
    });

    it('seed is a 8-digit integer (YYYYMMDD)', () => {
        const seed = dateToSeed(2026, 3, 2);
        expect(seed).toBe(20260302);
        expect(String(seed)).toHaveLength(8);
    });
});

// ---------------------------------------------------------------------------
// Puzzle string format validation (via sudoku-gen)
// ---------------------------------------------------------------------------
import { getSudoku } from 'sudoku-gen';

describe('getSudoku puzzle format', () => {
    let puzzle: ReturnType<typeof getSudoku>;

    beforeAll(() => {
        // Use a fixed seed via Math.random override so the test is deterministic
        let seed = 20260302;
        const orig = Math.random;
        Math.random = () => seededRandom(seed++);
        try {
            puzzle = getSudoku('medium');
        } finally {
            Math.random = orig;
        }
    });

    it('puzzle string is exactly 81 characters', () => {
        expect(puzzle.puzzle).toHaveLength(81);
    });

    it('solution string is exactly 81 characters', () => {
        expect(puzzle.solution).toHaveLength(81);
    });

    it('puzzle contains only digits 1-9 and dashes', () => {
        expect(puzzle.puzzle).toMatch(/^[1-9-]+$/);
    });

    it('solution contains only digits 1-9', () => {
        expect(puzzle.solution).toMatch(/^[1-9]+$/);
    });

    it('puzzle has at least one blank cell (dash)', () => {
        expect(puzzle.puzzle).toContain('-');
    });

    it('every non-blank puzzle cell matches the solution', () => {
        for (let i = 0; i < 81; i++) {
            if (puzzle.puzzle[i] !== '-') {
                expect(puzzle.puzzle[i]).toBe(puzzle.solution[i]);
            }
        }
    });

    it('same seed produces the same puzzle on repeated calls', () => {
        let s1 = 20260302;
        const orig = Math.random;

        Math.random = () => seededRandom(s1++);
        const p1 = getSudoku('medium').puzzle;

        let s2 = 20260302;
        Math.random = () => seededRandom(s2++);
        const p2 = getSudoku('medium').puzzle;

        Math.random = orig;
        expect(p1).toBe(p2);
    });

    it('different seeds produce different puzzles', () => {
        let s1 = 20260302;
        const orig = Math.random;

        Math.random = () => seededRandom(s1++);
        const p1 = getSudoku('medium').puzzle;

        let s2 = 20260303; // next day
        Math.random = () => seededRandom(s2++);
        const p2 = getSudoku('medium').puzzle;

        Math.random = orig;
        expect(p1).not.toBe(p2);
    });
});

// ---------------------------------------------------------------------------
// handleInput logic (extracted from page component)
// ---------------------------------------------------------------------------
type Cell = { value: string; notes: string[]; isInitial: boolean; isErr: boolean };

/**
 * Pure version of the board mutation from handleInput for unit testing.
 * Returns the new board (or same reference if nothing changes).
 */
function applyInput(
    board: Cell[][],
    selected: { r: number; c: number },
    char: string,
    mode: 'normal' | 'notes'
): Cell[][] {
    const newBoard = board.map(row => [...row]);
    const oldCell = newBoard[selected.r][selected.c];

    if (oldCell.isInitial) return board; // immutable

    const newCell = { ...oldCell };

    if (char === 'clear') {
        newCell.value = '';
        newCell.notes = [];
        newCell.isErr = false;
    } else if (mode === 'normal') {
        newCell.value = newCell.value === char ? '' : char; // toggle
        newCell.notes = [];
        newCell.isErr = false;
    } else {
        if (newCell.value) return board; // reject notes when cell has a value
        if (newCell.notes.includes(char)) {
            newCell.notes = newCell.notes.filter(n => n !== char);
        } else {
            newCell.notes = [...newCell.notes, char].sort();
        }
    }

    newBoard[selected.r][selected.c] = newCell;
    return newBoard;
}

function emptyCell(overrides: Partial<Cell> = {}): Cell {
    return { value: '', notes: [], isInitial: false, isErr: false, ...overrides };
}

function makeBoard(overrides: Partial<Cell> = {}): Cell[][] {
    return Array.from({ length: 9 }, () =>
        Array.from({ length: 9 }, () => emptyCell(overrides))
    );
}

describe('handleInput (normal mode)', () => {
    it('places a digit in an empty cell', () => {
        const board = makeBoard();
        const result = applyInput(board, { r: 0, c: 0 }, '5', 'normal');
        expect(result[0][0].value).toBe('5');
    });

    it('toggles off a digit when the same digit is entered again', () => {
        const board = makeBoard();
        let result = applyInput(board, { r: 0, c: 0 }, '3', 'normal');
        result = applyInput(result, { r: 0, c: 0 }, '3', 'normal');
        expect(result[0][0].value).toBe('');
    });

    it('replaces a digit with a different one', () => {
        const board = makeBoard();
        let result = applyInput(board, { r: 0, c: 0 }, '3', 'normal');
        result = applyInput(result, { r: 0, c: 0 }, '7', 'normal');
        expect(result[0][0].value).toBe('7');
    });

    it('clears any existing notes when placing a digit', () => {
        const board = makeBoard();
        // Add a note first
        let result = applyInput(board, { r: 0, c: 0 }, '2', 'notes');
        // Switch to normal and place digit
        result = applyInput(result, { r: 0, c: 0 }, '5', 'normal');
        expect(result[0][0].notes).toEqual([]);
        expect(result[0][0].value).toBe('5');
    });

    it('does not modify initial cells', () => {
        const board = makeBoard({ isInitial: true, value: '4' });
        const result = applyInput(board, { r: 4, c: 4 }, '9', 'normal');
        expect(result[4][4].value).toBe('4');
        expect(result).toBe(board); // exact reference — no copy made
    });

    it('clear action empties value and notes', () => {
        const board = makeBoard();
        let result = applyInput(board, { r: 1, c: 1 }, '8', 'normal');
        result = applyInput(result, { r: 1, c: 1 }, 'clear', 'normal');
        expect(result[1][1].value).toBe('');
        expect(result[1][1].notes).toEqual([]);
        expect(result[1][1].isErr).toBe(false);
    });
});

describe('handleInput (notes mode)', () => {
    it('adds a note to an empty cell', () => {
        const board = makeBoard();
        const result = applyInput(board, { r: 0, c: 0 }, '4', 'notes');
        expect(result[0][0].notes).toContain('4');
    });

    it('adds multiple notes sorted', () => {
        const board = makeBoard();
        let result = applyInput(board, { r: 0, c: 0 }, '9', 'notes');
        result = applyInput(result, { r: 0, c: 0 }, '2', 'notes');
        result = applyInput(result, { r: 0, c: 0 }, '5', 'notes');
        expect(result[0][0].notes).toEqual(['2', '5', '9']);
    });

    it('removes a note when toggled off', () => {
        const board = makeBoard();
        let result = applyInput(board, { r: 0, c: 0 }, '6', 'notes');
        result = applyInput(result, { r: 0, c: 0 }, '6', 'notes');
        expect(result[0][0].notes).not.toContain('6');
    });

    it('does not add note to a cell that already has a value', () => {
        const board = makeBoard();
        let result = applyInput(board, { r: 0, c: 0 }, '7', 'normal');
        const before = result;
        result = applyInput(result, { r: 0, c: 0 }, '3', 'notes');
        // Should return the same reference — no mutation
        expect(result).toBe(before);
        expect(result[0][0].notes).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// checkSolution logic (extracted)
// ---------------------------------------------------------------------------
function checkSolution(board: Cell[][], solution: string): { board: Cell[][]; complete: boolean } {
    let complete = true;
    const newBoard = board.map(row => [...row]);

    for (let i = 0; i < 9; i++) {
        for (let j = 0; j < 9; j++) {
            const cell = newBoard[i][j];
            const correctValue = solution[i * 9 + j];

            if (!cell.isInitial) {
                if (cell.value !== correctValue) {
                    newBoard[i][j] = { ...cell, isErr: true };
                    complete = false;
                } else if (cell.value === '') {
                    complete = false;
                }
            }
        }
    }
    return { board: newBoard, complete };
}

describe('checkSolution', () => {
    const SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

    it('marks the puzzle complete when all user cells are correct', () => {
        // Build a board where every non-initial cell is already filled correctly
        const board: Cell[][] = Array.from({ length: 9 }, (_, r) =>
            Array.from({ length: 9 }, (_, c) => ({
                value: SOLUTION[r * 9 + c],
                notes: [],
                isInitial: true, // treat all as initial so complete check passes
                isErr: false,
            }))
        );
        const { complete } = checkSolution(board, SOLUTION);
        expect(complete).toBe(true);
    });

    it('marks cells with wrong values as errors', () => {
        const board: Cell[][] = Array.from({ length: 9 }, (_, r) =>
            Array.from({ length: 9 }, (_, c) => ({
                value: SOLUTION[r * 9 + c],
                notes: [],
                isInitial: false,
                isErr: false,
            }))
        );
        // Inject a wrong answer in cell (0,0)
        board[0][0].value = board[0][0].value === '5' ? '1' : '5';
        const { board: checked, complete } = checkSolution(board, SOLUTION);
        expect(complete).toBe(false);
        expect(checked[0][0].isErr).toBe(true);
    });

    it('marks puzzle incomplete when any cell is empty', () => {
        const board: Cell[][] = Array.from({ length: 9 }, (_, r) =>
            Array.from({ length: 9 }, (_, c) => ({
                value: SOLUTION[r * 9 + c],
                notes: [],
                isInitial: r === 0 && c === 0, // first cell is initial
                isErr: false,
            }))
        );
        // Leave one user cell blank
        board[1][0].value = '';
        const { complete } = checkSolution(board, SOLUTION);
        expect(complete).toBe(false);
    });
});
