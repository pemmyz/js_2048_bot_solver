// script.js
document.addEventListener('DOMContentLoaded', () => {
    // --- Grid and Layout Constants ---
    const GRID_SIZE = 4;
    const TILE_SIZE = 100;
    const TILE_MARGIN = 10;
    const SCREEN_PADDING = 20;
    const SCORE_HEIGHT = 50;
    const BOTTOM_TEXT_HEIGHT = 60;
    const PANEL_WIDTH = 250;
    const SCROLLBAR_WIDTH = 10;
    const SCROLLBAR_GAP = 2;
    const ENTRY_HEIGHT = 30;
    const ENTRY_SPACING = 5;

    const GRID_INTERNAL_WIDTH = GRID_SIZE * TILE_SIZE + (GRID_SIZE - 1) * TILE_MARGIN;
    const GRID_DRAW_WIDTH = GRID_SIZE * (TILE_SIZE + TILE_MARGIN) + TILE_MARGIN;

    const CANVAS_WIDTH = GRID_DRAW_WIDTH;
    const CANVAS_HEIGHT = GRID_DRAW_WIDTH;

    // --- Color Definitions ---
    // Light Theme (Defaults)
    const LIGHT_COLORS = {
        BACKGROUND_COLOR: '#bbada0', // (187, 173, 160)
        EMPTY_COLOR: '#cdc1b4', // (205, 193, 180)
        TILE_COLORS: {
            2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563',
            32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61',
            512: '#edc850', 1024: '#edc53f', 2048: '#edc22e', 4096: '#3c3a32',
            8192: '#3c3a32',
        },
        TILE_TEXT_COLOR_LIGHT: '#f9f6f2', // For dark tiles (>= 8)
        TILE_TEXT_COLOR_DARK: '#776e65'  // For light tiles (< 8)
    };

    // Dark Theme
    const DARK_COLORS = {
        BACKGROUND_COLOR: '#3c3a32', // Dark gray/brown
        EMPTY_COLOR: '#504a43',      // Darker empty cell
        TILE_COLORS: {
            2: '#776e65', 4: '#8f8274', 8: '#f2b179', 16: '#f59563', // Keep high val distinct
            32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61',
            512: '#edc850', 1024: '#edc53f', 2048: '#edc22e', 4096: '#eee4da', // Light text
            8192: '#f9f6f2', // Even lighter text
        },
        TILE_TEXT_COLOR_LIGHT: '#f9f6f2', // Keep for >= 8
        TILE_TEXT_COLOR_DARK: '#e0e0e0'   // Light text for dark low tiles
    };

    // Active Colors (will be updated based on theme)
    let BACKGROUND_COLOR;
    let EMPTY_COLOR;
    let TILE_COLORS;
    let TILE_TEXT_COLOR_LIGHT;
    let TILE_TEXT_COLOR_DARK;

    // Directions
    const UP = 'up', DOWN = 'down', LEFT = 'left', RIGHT = 'right';

    // DOM Elements
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const scoreArea = document.getElementById('score-area');
    const statusLine1 = document.getElementById('status-line-1');
    const statusLine2 = document.getElementById('status-line-2');
    const statusLine3 = document.getElementById('status-line-3');
    const gameOverMessage = document.getElementById('game-over-message');
    const historyPanel = document.getElementById('history-panel');
    const historyEntriesContainer = document.getElementById('history-entries');
    const scrollbarTrack = document.getElementById('history-scrollbar-track');
    const scrollbarThumb = document.getElementById('history-scrollbar-thumb');
    const container = document.querySelector('.container'); // Main flex container
    const bodyElement = document.body; // Get body element

    // Adjust canvas size based on calculated dimensions
    canvas.width = GRID_DRAW_WIDTH;
    canvas.height = GRID_DRAW_WIDTH;

    // Adjust history panel height to match game area roughly
    const gameAreaHeight = SCORE_HEIGHT + CANVAS_HEIGHT + BOTTOM_TEXT_HEIGHT + 50; // Add some buffer for margins/padding
    historyPanel.style.height = `${gameAreaHeight}px`;

    // Game State
    let board = [];
    let score = 0;
    let gameOver = false;
    let history = [];
    let selectedHistoryIndex = 0;
    let branchPoint = null; // Index where a branch occurred
    let botMode = false;
    let showHistoryPanel = true;
    let historyScrollOffset = 0;
    let historyMaxScroll = 0;
    let draggingScrollbar = false;
    let scrollbarDragOffsetY = 0;
    let isPaused = false;
    let isDarkMode = true; // <-- Set dark mode as default

    // --- AI Constants ---
    const EXPECTIMAX_DEPTH = 2; // Adjust as needed (higher is slower)
    const MCTS_ITERATIONS = 500; // Adjust as needed (higher is slower, 500 is decent starting point)
    const MCTS_EXPLORATION_C = 1.414; // Sqrt(2), common value for UCB1
    const MCTS_ROLLOUT_DEPTH = 10; // Limit random rollout depth for performance

    const botAlgorithms = [
        "random", "greedy", "heuristic", "remove_small", "combined",
        "expectimax", "mcts"
    ];
    let currentAlgorithmIndex = 0;
    let botAlgorithm = botAlgorithms[currentAlgorithmIndex];
    let botDelay = 300; // ms (Might need increase for AI)
    let lastBotMoveTime = 0;

    // Combined Bot Strategy State
    const combinedBotStrategies = {
        "empty": { weight: 1.0, active: true, func: evalEmpty },
        "corner": { weight: 5.0, active: true, func: evalCorner }, // Higher weight
        "monotonicity": { weight: 1.0, active: true, func: evalMonotonicity },
        "smoothness": { weight: 0.1, active: true, func: evalSmoothness }, // Lower weight
        "remove_small": { weight: 0.5, active: true, func: evalRemoveSmall },
    };
    const strategyKeyMapping = { '1': "empty", '2': "corner", '3': "monotonicity", '4': "smoothness", '5': "remove_small" };
    let strategyOrder = ["empty", "corner", "monotonicity", "smoothness", "remove_small"]; // Initial order

    // --- Theme Handling ---
    function applyThemeColors() {
        const colors = isDarkMode ? DARK_COLORS : LIGHT_COLORS;
        BACKGROUND_COLOR = colors.BACKGROUND_COLOR;
        EMPTY_COLOR = colors.EMPTY_COLOR;
        TILE_COLORS = colors.TILE_COLORS;
        TILE_TEXT_COLOR_LIGHT = colors.TILE_TEXT_COLOR_LIGHT;
        TILE_TEXT_COLOR_DARK = colors.TILE_TEXT_COLOR_DARK;

        // Update canvas background directly (CSS var should handle it, but this is a fallback/ensure)
        canvas.style.backgroundColor = BACKGROUND_COLOR;
    }

    function toggleDarkMode() {
        isDarkMode = !isDarkMode;
        bodyElement.classList.toggle('dark-mode', isDarkMode); // Toggle class on body
        applyThemeColors();
        console.log(`Dark Mode: ${isDarkMode ? 'Enabled' : 'Disabled'}`);
        drawGame(); // Redraw canvas with new colors
        if (showHistoryPanel) {
            drawHistoryPanel(); // Redraw history (CSS vars should handle colors, but redraw ensures consistency)
        }
    }

    // --- Deep Copy Helper ---
    function deepCopy(obj) {
        // structuredClone is generally faster and handles more types if available
        if (typeof structuredClone === 'function') {
            try {
                return structuredClone(obj);
            } catch (e) {
                // Fallback if structuredClone fails for some reason (e.g., unsupported type)
                console.warn("structuredClone failed, falling back to JSON parse/stringify.", e);
            }
        }
        // Fallback for older browsers or complex objects structuredClone might fail on
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (e) {
            console.error("Deep copy failed using JSON. Consider a more robust polyfill if needed.", e);
            // Basic fallback for simple board structure
            return { ...obj, board: obj.board ? obj.board.map(row => [...row]) : [] };
        }
    }

    // --- Game Logic ---
    function resetGame() {
        board = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0));
        score = 0;
        gameOver = false;
        isPaused = false;
        addRandomTile();
        addRandomTile();
        history = [{ board: deepCopy(board), score: score, gameOver: gameOver }];
        selectedHistoryIndex = 0;
        branchPoint = null;
        historyScrollOffset = 0;
        scrollToHistoryBottom();
        updateUI();
        drawGame();
        console.log("Game Reset");
    }

    function addRandomTile() {
        let emptyCells = getEmptyCells(board); // Use helper
        if (emptyCells.length > 0) {
            let { r, c } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
            board[r][c] = Math.random() < 0.1 ? 4 : 2; // 10% chance of 4
        }
    }

    // Checks if any move is possible on the *current global board*
    function canMoveCheck() {
        return canMoveCheckBoard(board);
    }

    // Checks if any move is possible on a *given* board state
    function canMoveCheckBoard(currentBoard) {
        if (getEmptyCells(currentBoard).length > 0) return true; // Check empty cells first
        // Check for adjacent merges
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                // Check down
                if (r < GRID_SIZE - 1 && currentBoard[r][c] === currentBoard[r + 1][c]) return true;
                // Check right
                if (c < GRID_SIZE - 1 && currentBoard[r][c] === currentBoard[r][c + 1]) return true;
            }
        }
        return false; // No empty cells and no possible merges
    }

    // --- Board Simulation Helpers ---
    // Takes a board state and direction, returns { board, scoreDelta, moved }
    // Does NOT modify the input board, does NOT add random tile
    function simulateMove(currentBoard, direction) {
        let tempBoard = deepCopy(currentBoard);
        let tempScoreDelta = 0; // Track score delta for this move only
        let moved = false;

        // Helper to operate on a single row/column *without* updating global score
        function operateRowSim(row) {
            let scoreDelta = 0;
            let originalRow = [...row]; // Copy for change detection

            // 1. Compress (remove zeros)
            let newRow = row.filter(num => num !== 0);
            while (newRow.length < GRID_SIZE) newRow.push(0);

            // 2. Merge
            let merged = false;
            for (let i = 0; i < GRID_SIZE - 1; i++) {
                if (newRow[i] !== 0 && newRow[i] === newRow[i + 1]) {
                    newRow[i] *= 2;
                    scoreDelta += newRow[i]; // Track score gain for this specific merge
                    newRow[i + 1] = 0; // Remove the merged tile
                    merged = true;
                    // Do NOT increment i here to prevent chain merges like 2 2 4 -> 8
                }
            }

            // 3. Compress again after merge
            if (merged) {
                newRow = newRow.filter(num => num !== 0);
                while (newRow.length < GRID_SIZE) newRow.push(0);
            }

            let changed = JSON.stringify(originalRow) !== JSON.stringify(newRow);
            return { row: newRow, changed: changed, scoreDelta }; // Return changed status and score delta
        }

        switch (direction) {
            case LEFT:
                for (let r = 0; r < GRID_SIZE; r++) {
                    let result = operateRowSim(tempBoard[r]);
                    tempBoard[r] = result.row;
                    tempScoreDelta += result.scoreDelta;
                    moved = moved || result.changed;
                }
                break;
            case RIGHT:
                for (let r = 0; r < GRID_SIZE; r++) {
                    let reversedRow = tempBoard[r].slice().reverse();
                    let result = operateRowSim(reversedRow);
                    tempBoard[r] = result.row.reverse();
                    tempScoreDelta += result.scoreDelta;
                    moved = moved || result.changed;
                }
                break;
            case UP:
                for (let c = 0; c < GRID_SIZE; c++) {
                    let col = [];
                    for (let r = 0; r < GRID_SIZE; r++) col.push(tempBoard[r][c]);
                    let result = operateRowSim(col);
                    for (let r = 0; r < GRID_SIZE; r++) tempBoard[r][c] = result.row[r];
                    tempScoreDelta += result.scoreDelta;
                    moved = moved || result.changed;
                }
                break;
            case DOWN:
                for (let c = 0; c < GRID_SIZE; c++) {
                    let col = [];
                    for (let r = 0; r < GRID_SIZE; r++) col.push(tempBoard[r][c]);
                    let reversedCol = col.slice().reverse();
                    let result = operateRowSim(reversedCol);
                    let finalCol = result.row.reverse();
                    for (let r = 0; r < GRID_SIZE; r++) tempBoard[r][c] = finalCol[r];
                    tempScoreDelta += result.scoreDelta;
                    moved = moved || result.changed;
                }
                break;
        }

        return { board: tempBoard, scoreDelta: tempScoreDelta, moved: moved };
    }

    // Helper to get coordinates of empty cells for a given board
    function getEmptyCells(currentBoard) {
        let emptyCells = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (currentBoard[r][c] === 0) {
                    emptyCells.push({ r, c });
                }
            }
        }
        return emptyCells;
    }

    // --- Main Move Logic (Updates Global State) ---
    // Returns true if the board state changed, false otherwise
    function move(direction) {
        if (gameOver) return false;

        const boardBefore = deepCopy(board); // Save state before move
        const scoreBefore = score;

        // Use the simulation function to determine the result of the move
        const simResult = simulateMove(board, direction);

        if (simResult.moved) {
            // Update global board and score based on simulation result
            board = simResult.board;
            score += simResult.scoreDelta;

            addRandomTile(); // Add a new random tile only AFTER a successful move

            // Check for game over AFTER adding the new tile
            if (!canMoveCheck()) {
                gameOver = true;
                console.log("Game Over! (No moves possible after new tile)");
            }

            // Update history (only if the move was successful)
            if (selectedHistoryIndex === history.length - 1) {
                 // Append to the current history branch
                 history.push({ board: deepCopy(board), score: score, gameOver: gameOver });
                 selectedHistoryIndex++;
                 branchPoint = null; // No longer a branch point
             } else {
                 // Create a new branch
                 branchPoint = selectedHistoryIndex + 1; // Mark where the branch occurred
                 history = history.slice(0, selectedHistoryIndex + 1); // Truncate old future
                 history.push({ board: deepCopy(board), score: score, gameOver: gameOver }); // Add new state
                 selectedHistoryIndex = history.length - 1; // Move selection to new state
                 console.log(`Branched history at move ${branchPoint}`);
             }
             scrollToHistoryBottom(); // Scroll history to show the new move
             updateUI(); // Update score display, status, etc.
             return true; // Indicate that the board state changed

        } else {
            // Move was not possible in this direction.
            // We still need to check if the game might be over (e.g., if no moves were possible at all)
            if (!gameOver && !canMoveCheck()) { // Check only if not already game over
                gameOver = true;
                 console.log("Game Over! (Attempted move was invalid, and no other moves possible)");
                 // Mark the *current* last history state as game over if it wasn't already
                 if (history.length > 0 && !history[history.length - 1].gameOver) {
                     history[history.length - 1].gameOver = true;
                 }
                 updateUI();
             }
             return false; // Indicate board state did not change
        }
    }

    // --- Drawing ---
    function drawGame() {
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw background grid cells using the active EMPTY_COLOR
        ctx.fillStyle = EMPTY_COLOR;
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                drawRoundedRect(
                    ctx,
                    TILE_MARGIN + c * (TILE_SIZE + TILE_MARGIN),
                    TILE_MARGIN + r * (TILE_SIZE + TILE_MARGIN),
                    TILE_SIZE, TILE_SIZE, 8
                );
            }
        }

        // Draw tiles using active TILE_COLORS, TEXT_COLOR_LIGHT, TEXT_COLOR_DARK
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const value = board[r][c];
                if (value !== 0) {
                    drawTile(r, c, value);
                }
            }
        }
    }

    function drawTile(r, c, value) {
        const x = TILE_MARGIN + c * (TILE_SIZE + TILE_MARGIN);
        const y = TILE_MARGIN + r * (TILE_SIZE + TILE_MARGIN);

        // Use active theme colors
        const bgColor = TILE_COLORS[value] || TILE_COLORS[8192]; // Fallback for very high tiles
        // Determine text color based on tile value and theme
        const lightTextThreshold = isDarkMode ? 4 : 8; // Tiles >= this use light text
        const textColor = value >= lightTextThreshold ? TILE_TEXT_COLOR_LIGHT : TILE_TEXT_COLOR_DARK;

        // Adjust font size based on number of digits
        const fontSize = value < 100 ? 45 : value < 1000 ? 35 : value < 10000 ? 30 : 25;

        // Draw tile background
        ctx.fillStyle = bgColor;
        drawRoundedRect(ctx, x, y, TILE_SIZE, TILE_SIZE, 8);

        // Draw tile value
        ctx.fillStyle = textColor;
        ctx.font = `bold ${fontSize}px Verdana, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(value.toString(), x + TILE_SIZE / 2, y + TILE_SIZE / 2 + 2); // Minor offset adjustment
    }

    // Helper for drawing rounded rectangles (uses native if available)
    function drawRoundedRect(ctx, x, y, width, height, radius) {
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, width, height, radius);
            ctx.fill();
        } else {
            // Fallback path drawing
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
            ctx.fill();
        }
    }

    // --- UI Updates ---
    function updateUI() {
        scoreArea.textContent = `Score: ${score}`;

        let botStatusText = botMode ? `Bot (${isPaused ? 'Paused' : 'Running'})` : 'Manual';
        statusLine1.textContent = `Mode: ${botStatusText} | Algorithm: ${botAlgorithm}`;

        if (botAlgorithm === "combined") {
            const activeStrats = strategyOrder.filter(s => combinedBotStrategies[s].active);
            // Display full strategy names
            statusLine2.textContent = `Active: ${activeStrats.join(', ') || 'None'}`;
            statusLine3.textContent = `(Use 1-5 to toggle)`;
        } else {
             statusLine2.textContent = `(${botMode ? 'P: Pause/Resume' : 'Use Arrows'})`;
             statusLine3.textContent = '';
        }

        gameOverMessage.style.display = gameOver ? 'block' : 'none';

        // Manage history panel visibility and content
        if (showHistoryPanel) {
            drawHistoryPanel(); // Draw content and update scrollbar
            historyPanel.classList.remove('hidden');
            container.style.gap = '20px'; // Restore gap
        } else {
            historyPanel.classList.add('hidden');
            container.style.gap = '0px'; // Remove gap
        }
    }

    // --- History Panel Logic ---
    function scrollToHistoryBottom() {
        if (!showHistoryPanel || !historyEntriesContainer) return;

        const panelHeight = historyEntriesContainer.clientHeight;
        if (panelHeight <= 0) return; // Avoid calculation errors if panel isn't rendered/visible

        const totalContentHeight = history.length * ENTRY_HEIGHT;
        historyMaxScroll = Math.max(0, totalContentHeight - panelHeight);
        historyScrollOffset = historyMaxScroll; // Go to the very bottom

        // Redraw immediately to reflect the scroll change
        drawHistoryPanel();
    }

    function getTopFourTiles(stateBoard) {
        if (!stateBoard || !Array.isArray(stateBoard)) return []; // Safety check
        const tiles = stateBoard.flat().filter(tile => tile > 0); // Only non-zero
        tiles.sort((a, b) => b - a); // Sort descending
        return tiles.slice(0, 4);
    }

    function drawHistoryPanel() {
        if (!historyEntriesContainer || !scrollbarTrack || !scrollbarThumb) return; // Ensure elements exist

        historyEntriesContainer.innerHTML = ''; // Clear previous entries
        const panelHeight = historyEntriesContainer.clientHeight;
        if (panelHeight <= 0) return; // Can't draw if not visible/sized

        const totalContentHeight = history.length * ENTRY_HEIGHT;

        // Ensure scroll offset is within valid bounds AFTER potential content changes
        historyMaxScroll = Math.max(0, totalContentHeight - panelHeight);
        historyScrollOffset = Math.max(0, Math.min(historyScrollOffset, historyMaxScroll));

        // Calculate which entries are potentially visible (with a buffer)
        const firstVisibleIndex = Math.floor(historyScrollOffset / ENTRY_HEIGHT);
        const lastVisibleIndex = Math.ceil((historyScrollOffset + panelHeight) / ENTRY_HEIGHT);
        const buffer = 5; // Render items slightly outside the viewport

        history.forEach((state, idx) => {
            // Only render elements roughly in/near the viewport
             if (idx >= firstVisibleIndex - buffer && idx <= lastVisibleIndex + buffer) {
                const entry = document.createElement('div');
                entry.classList.add('history-entry');
                const topTiles = getTopFourTiles(state.board);
                // Display move number, top tiles, and final score if game over
                entry.textContent = `M ${idx}: ${topTiles.join('/')}${state.gameOver ? ` (End ${state.score})`: ''}`;
                entry.dataset.index = idx; // Store index for click handling

                // Apply styling classes
                if (idx === selectedHistoryIndex) entry.classList.add('selected');
                if (branchPoint !== null && idx === branchPoint) entry.classList.add('branch-point');

                // Position the element based on scroll offset
                entry.style.position = 'absolute'; // Ensure positioning context
                entry.style.top = `${idx * ENTRY_HEIGHT - historyScrollOffset}px`;
                entry.style.left = '10px'; // Consistent padding
                entry.style.right = `${10 + SCROLLBAR_WIDTH + SCROLLBAR_GAP}px`; // Account for scrollbar

                entry.addEventListener('click', () => {
                    if (selectedHistoryIndex === idx) return; // Don't reload if clicking the selected one

                    selectedHistoryIndex = idx;
                    const selectedState = deepCopy(history[idx]);
                    board = selectedState.board;
                    score = selectedState.score;
                    gameOver = selectedState.gameOver;
                    branchPoint = null; // Selecting cancels the visual branch point indicator
                    console.log(`Selected history state ${idx}`);

                    // Scroll to bottom only if the *very last* item was clicked
                    if (idx === history.length - 1) {
                        scrollToHistoryBottom();
                    }

                    updateUI(); // Update score display, status, and redraw history highlight
                    drawGame(); // Redraw board
                });
                 historyEntriesContainer.appendChild(entry);
            }
        });

        // Update scrollbar thumb visibility, height, and position
        if (historyMaxScroll > 0 && panelHeight > 0 && totalContentHeight > panelHeight) {
            const thumbHeightRatio = panelHeight / totalContentHeight;
            const thumbHeight = Math.max(20, thumbHeightRatio * panelHeight); // Min height of 20px
            const trackHeight = panelHeight; // Scrollable area height IS the panel height
            const thumbMaxY = trackHeight - thumbHeight; // Max Y pos for the top of the thumb
            const thumbY = (historyScrollOffset / historyMaxScroll) * thumbMaxY;

            scrollbarThumb.style.height = `${thumbHeight}px`;
            scrollbarThumb.style.top = `${thumbY}px`;
            scrollbarTrack.style.display = 'block'; // Show scrollbar
        } else {
            scrollbarTrack.style.display = 'none'; // Hide scrollbar if not needed
        }
    }

    // Scrollbar drag handling
     scrollbarThumb.addEventListener('mousedown', (e) => {
        draggingScrollbar = true;
        scrollbarDragOffsetY = e.clientY - scrollbarThumb.getBoundingClientRect().top;
        scrollbarThumb.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none'; // Prevent text selection during drag
        e.preventDefault(); // Prevent default drag behavior
    });

     document.addEventListener('mousemove', (e) => {
        if (!draggingScrollbar) return;
        const trackRect = scrollbarTrack.getBoundingClientRect();
        const thumbHeight = scrollbarThumb.offsetHeight;
        if (trackRect.height <= thumbHeight) return; // Avoid division by zero if track too small

         // Calculate new thumb Y position based on mouse movement
         let newThumbY = e.clientY - trackRect.top - scrollbarDragOffsetY;
         // Clamp thumb position within the track bounds
        newThumbY = Math.max(0, Math.min(newThumbY, trackRect.height - thumbHeight));

        // Calculate new scroll offset based on thumb position
        historyScrollOffset = (newThumbY / (trackRect.height - thumbHeight)) * historyMaxScroll;

        drawHistoryPanel(); // Redraw with new scroll offset
    });

     document.addEventListener('mouseup', () => {
        if (draggingScrollbar) {
            draggingScrollbar = false;
            scrollbarThumb.style.cursor = 'grab';
             document.body.style.userSelect = ''; // Re-enable text selection
        }
    });

    // Mouse wheel scrolling for history panel
     historyPanel.addEventListener('wheel', (e) => {
        if (!showHistoryPanel || historyMaxScroll <= 0) return; // Ignore if panel hidden or no scroll needed
        e.preventDefault(); // Prevent page scrolling

        const scrollAmount = ENTRY_HEIGHT; // Scroll roughly one entry per wheel step
        historyScrollOffset += e.deltaY > 0 ? scrollAmount : -scrollAmount;
        // Clamp scroll offset within bounds [0, historyMaxScroll]
        historyScrollOffset = Math.max(0, Math.min(historyScrollOffset, historyMaxScroll));

        drawHistoryPanel(); // Redraw with new scroll offset
    });

    // --- Bot Logic ---

    // Get valid moves for a given board state
    function getValidMoves(currentBoard) {
        const moves = [];
        for (const direction of [UP, DOWN, LEFT, RIGHT]) {
            const simResult = simulateMove(currentBoard, direction);
            if (simResult.moved) {
                moves.push(direction);
            }
        }
        return moves;
    }

    // --- Evaluation Functions (for Heuristic/Combined/AI Bots) ---
    function evalEmpty(currentBoard) {
        return getEmptyCells(currentBoard).length;
    }

    function evalGetMaxTile(currentBoard) {
         let maxVal = 0;
         let maxPos = { r: -1, c: -1 }; // Init to invalid pos
         for (let r = 0; r < GRID_SIZE; r++) {
             for (let c = 0; c < GRID_SIZE; c++) {
                 if (currentBoard[r][c] > maxVal) {
                     maxVal = currentBoard[r][c];
                     maxPos = { r, c };
                 }
             }
         }
         return { pos: maxPos, value: maxVal };
     }

    // Rewards placing the max tile in a corner and general proximity to corners
    function evalCorner(currentBoard) {
        const { pos, value } = evalGetMaxTile(currentBoard);
        if (value === 0) return 0; // No tiles

        const corners = [
            { r: 0, c: 0 }, { r: 0, c: GRID_SIZE - 1 },
            { r: GRID_SIZE - 1, c: 0 }, { r: GRID_SIZE - 1, c: GRID_SIZE - 1 }
        ];
        let bestCornerScore = 0;
        let isInCorner = false;

        for (const corner of corners) {
            if (corner.r === pos.r && corner.c === pos.c) {
                isInCorner = true;
                break;
            }
        }

        // Strong reward for being exactly in a corner
        if (isInCorner) {
            bestCornerScore = value * GRID_SIZE; // Scale reward by tile value and grid size
        } else {
            // Lesser reward for proximity - Manhattan distance from closest corner
            let minDist = Infinity;
            for (const corner of corners) {
                let dist = Math.abs(corner.r - pos.r) + Math.abs(corner.c - pos.c);
                minDist = Math.min(minDist, dist);
            }
            // Inverse relationship with distance (closer is better)
            bestCornerScore = value * (GRID_SIZE * 2 - 1 - minDist) * 0.5; // Lower weight than exact corner
        }

        // Penalty for having large tiles not near the corner? Maybe too complex
        return bestCornerScore;
    }

    // Measures how monotonic rows and columns are (tendency to increase/decrease)
    // Higher score means more monotonic (generally preferred towards edges)
    function evalMonotonicity(currentBoard) {
        let totals = [0, 0, 0, 0]; // up, down, left, right

        // Check rows (left and right)
        for (let r = 0; r < GRID_SIZE; r++) {
            let current = 0;
            let next = current + 1;
            while (next < GRID_SIZE) {
                while (next < GRID_SIZE && currentBoard[r][next] === 0) next++;
                if (next >= GRID_SIZE) break;
                let currentVal = currentBoard[r][current] === 0 ? 0 : Math.log2(currentBoard[r][current]);
                let nextVal = currentBoard[r][next] === 0 ? 0 : Math.log2(currentBoard[r][next]);
                if (currentVal > nextVal) totals[2] += nextVal - currentVal; // Penalize left decrease
                else if (nextVal > currentVal) totals[3] += currentVal - nextVal; // Penalize right decrease
                current = next++;
            }
        }

        // Check columns (up and down)
        for (let c = 0; c < GRID_SIZE; c++) {
            let current = 0;
            let next = current + 1;
            while (next < GRID_SIZE) {
                while (next < GRID_SIZE && currentBoard[next][c] === 0) next++;
                if (next >= GRID_SIZE) break;
                let currentVal = currentBoard[current][c] === 0 ? 0 : Math.log2(currentBoard[current][c]);
                let nextVal = currentBoard[next][c] === 0 ? 0 : Math.log2(currentBoard[next][c]);
                if (currentVal > nextVal) totals[0] += nextVal - currentVal; // Penalize up decrease
                else if (nextVal > currentVal) totals[1] += currentVal - nextVal; // Penalize down decrease
                current = next++;
            }
        }

        // Return the maximum penalty (most non-monotonic direction) or sum?
        // Let's sum the penalties for overall monotonicity measure (higher = more monotonic)
        return Math.max(totals[0], totals[1]) + Math.max(totals[2], totals[3]);
    }

    // Measures how smooth the board is (difference between adjacent tiles)
    // Higher score (less negative) means smoother board
    function evalSmoothness(currentBoard) {
        let smoothness = 0;
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (currentBoard[r][c] !== 0) {
                    let valueLog = Math.log2(currentBoard[r][c]);
                    // Check right neighbor
                    let next_c = c + 1;
                    while (next_c < GRID_SIZE) {
                        let target = currentBoard[r][next_c];
                        if (target !== 0) {
                            smoothness -= Math.abs(valueLog - Math.log2(target));
                            break; // Found nearest neighbor
                        }
                        next_c++;
                    }
                    // Check down neighbor
                    let next_r = r + 1;
                     while (next_r < GRID_SIZE) {
                         let target = currentBoard[next_r][c];
                         if (target !== 0) {
                             smoothness -= Math.abs(valueLog - Math.log2(target));
                             break; // Found nearest neighbor
                         }
                         next_r++;
                    }
                }
            }
        }
        return smoothness;
    }

    function countSmallTiles(currentBoard, threshold = 8) {
        return currentBoard.flat().filter(tile => tile > 0 && tile < threshold).length;
    }

    // Penalizes having small tiles (value < threshold) on the board
    // Higher score (less negative) means fewer small tiles
    function evalRemoveSmall(currentBoard, threshold = 8) {
        return -countSmallTiles(currentBoard, threshold);
    }

    // --- Combined Heuristic Evaluation (used by AI) ---
    function evaluateBoard(currentBoard) {
        let scoreVal = 0; // Use 'scoreVal' to avoid conflict with global 'score'
        const weights = {
            empty: 2.7,
            corner: 3.0, // Weight for max tile in corner heuristic
            monotonicity: 1.0,
            smoothness: 0.1,
            maxTile: 1.0, // Add log of max tile value itself
            // scoreDelta: 0.5 // Could be added if passed in
        };

        // Immediate check for game over state
        if (!canMoveCheckBoard(currentBoard)) {
            return -Infinity; // Extremely low score for game over
        }

        scoreVal += weights.empty * evalEmpty(currentBoard);
        scoreVal += weights.corner * evalCorner(currentBoard);
        scoreVal += weights.monotonicity * evalMonotonicity(currentBoard);
        scoreVal += weights.smoothness * evalSmoothness(currentBoard);

        const maxTileData = evalGetMaxTile(currentBoard);
        scoreVal += weights.maxTile * (maxTileData.value > 0 ? Math.log2(maxTileData.value) : 0);

        // Add current game score slightly? Maybe not ideal for lookahead.
        // scoreVal += currentScore * 0.01;

        return scoreVal;
    }

    // --- Basic Bot Algorithms ---
    function botRandomMove() {
        const validMoves = getValidMoves(board); // Use global board
        if (validMoves.length > 0) {
            return validMoves[Math.floor(Math.random() * validMoves.length)];
        }
        return null; // Should only happen if game is already over
    }

    // Greedy: Picks move resulting in the most empty cells (simple heuristic)
     function botGreedyMove() {
         let bestMove = null;
         let bestEmpty = -1;
         const originalBoard = deepCopy(board); // Use global board

         for (const direction of getValidMoves(originalBoard)) { // Only simulate valid moves
             const simResult = simulateMove(originalBoard, direction);
             // Evaluate the board *after* the move (before random tile)
             let emptyCount = evalEmpty(simResult.board);
             if (emptyCount > bestEmpty) {
                 bestEmpty = emptyCount;
                 bestMove = direction;
             }
         }
         return bestMove || botRandomMove(); // Fallback
     }

    // Heuristic: Picks move leading to highest score based on a simple combined heuristic
     function botHeuristicMove() {
         let bestMove = null;
         let bestValue = -Infinity;
         const originalBoard = deepCopy(board);

         for (const direction of getValidMoves(originalBoard)) {
             const simResult = simulateMove(originalBoard, direction);
             // Use the more comprehensive evaluateBoard function
             let value = evaluateBoard(simResult.board);
             // Add the score delta achieved by the move itself
             value += simResult.scoreDelta * 0.5; // Example weight for immediate score gain

             if (value > bestValue) {
                 bestValue = value;
                 bestMove = direction;
             }
         }
         return bestMove || botRandomMove(); // Fallback
     }

     // Remove Small: Picks move resulting in fewest small tiles
     function botRemoveSmallMove() {
         let bestMove = null;
         let minSmallCount = Infinity; // Minimize small tiles
         const originalBoard = deepCopy(board);
         const threshold = 8; // Tiles below this are considered small

         for (const direction of getValidMoves(originalBoard)) {
             const simResult = simulateMove(originalBoard, direction);
             let smallCount = countSmallTiles(simResult.board, threshold);

             if (smallCount < minSmallCount) {
                 minSmallCount = smallCount;
                 bestMove = direction;
             } else if (smallCount === minSmallCount) {
                  // Tie-breaker: Use a secondary heuristic like the board evaluation score
                  let currentEval = evaluateBoard(simResult.board) + simResult.scoreDelta * 0.5;
                  // Need to store the best evaluation score for the tie-breaker comparison
                  // This makes it slightly more complex than the initial simple version
                  // Let's stick to the simple version for now: first move found with min small count wins.
             }
         }
         return bestMove || botRandomMove(); // Fallback
     }

    // Combined: Uses weighted sum of configured strategies
    function botCombinedMove() {
        let bestMove = null;
        let bestScore = -Infinity;
        const originalBoard = deepCopy(board);

        for (const direction of getValidMoves(originalBoard)) {
            const simResult = simulateMove(originalBoard, direction);
            let currentScoreValue = 0; // Renamed to avoid conflict

            // Calculate score based on active, weighted strategies applied to the resulting board
            for(const stratName of strategyOrder) {
                const strat = combinedBotStrategies[stratName];
                if (strat.active) {
                    currentScoreValue += strat.weight * strat.func(simResult.board);
                }
            }
            // Add score delta from the move itself, potentially weighted
            currentScoreValue += simResult.scoreDelta * 0.5; // Example weight

            if (currentScoreValue > bestScore) {
                bestScore = currentScoreValue;
                bestMove = direction;
            }
        }
         return bestMove || botRandomMove(); // Fallback
    }

    // --- Expectimax Bot ---
    // isPlayerTurn = true for Max node (player), false for Chance node (computer)
    function expectimaxSearch(currentBoard, depth, isPlayerTurn) {
        if (depth === 0 || !canMoveCheckBoard(currentBoard)) {
            return evaluateBoard(currentBoard); // Base case: Evaluate leaf node
        }

        if (isPlayerTurn) {
            // Max Node (Player's Turn): Choose move with highest expected score
            let maxScore = -Infinity;
            const validMoves = getValidMoves(currentBoard);
            if (validMoves.length === 0) return evaluateBoard(currentBoard); // No moves possible

            for (const direction of validMoves) {
                const simResult = simulateMove(currentBoard, direction);
                // Score = score from this move + expected score from computer's subsequent turn
                const currentTurnScore = simResult.scoreDelta; // Use the actual score gained
                const nextStateScore = expectimaxSearch(simResult.board, depth - 1, false); // Computer's turn next

                // If nextStateScore is -Infinity (guaranteed loss), this path is bad
                if (nextStateScore === -Infinity) {
                    // We might still be forced to take it if all moves lead to loss
                    // Assign a very low score but maybe slightly better than pure -Infinity?
                    // Or just let max handle it. Let's keep it simple:
                     maxScore = Math.max(maxScore, -Infinity); // Or evaluateBoard(simResult.board)?
                } else {
                    maxScore = Math.max(maxScore, currentTurnScore + nextStateScore);
                }

            }
             // Handle cases where all moves lead to immediate game over (-Infinity)
            return maxScore === -Infinity ? evaluateBoard(currentBoard) : maxScore;

        } else {
            // Chance Node (Computer's Turn): Average over possible tile placements
            let expectedScore = 0;
            const emptyCells = getEmptyCells(currentBoard);
            const numEmpty = emptyCells.length;

            if (numEmpty === 0) {
                // This state should have been caught by canMoveCheckBoard earlier
                return evaluateBoard(currentBoard);
            }

            let totalWeightedScore = 0;
            // Iterate through each empty cell
            for (const cell of emptyCells) {
                // Consider placing '2' (90% probability)
                const boardWith2 = deepCopy(currentBoard);
                boardWith2[cell.r][cell.c] = 2;
                let score2 = expectimaxSearch(boardWith2, depth - 1, true); // Player's turn next
                if (score2 !== -Infinity) totalWeightedScore += 0.9 * score2;
                else totalWeightedScore += 0.9 * evaluateBoard(boardWith2); // Use heuristic if next state is game over


                // Consider placing '4' (10% probability)
                const boardWith4 = deepCopy(currentBoard);
                boardWith4[cell.r][cell.c] = 4;
                let score4 = expectimaxSearch(boardWith4, depth - 1, true); // Player's turn next
                if (score4 !== -Infinity) totalWeightedScore += 0.1 * score4;
                 else totalWeightedScore += 0.1 * evaluateBoard(boardWith4); // Use heuristic if next state is game over

            }

            // Average the expected scores over all possibilities
            // Each empty cell contributes (0.9 * score_after_2 + 0.1 * score_after_4)
            return totalWeightedScore / numEmpty;
        }
    }

    function botExpectimaxMove() {
        let bestMove = null;
        let bestScore = -Infinity;
        const originalBoard = deepCopy(board); // Use current global board state

        const validMoves = getValidMoves(originalBoard);
        if (validMoves.length === 0) return null; // No moves possible

        for (const direction of validMoves) {
             const simResult = simulateMove(originalBoard, direction);
             // Calculate score: score from this move + expected score of the state *after* this move
             const currentTurnScore = simResult.scoreDelta;
             // Start the recursive search from the state AFTER the move, depth starts full, computer's turn
             const nextStateExpectedScore = expectimaxSearch(simResult.board, EXPECTIMAX_DEPTH, false);

             let totalScore;
             if (nextStateExpectedScore === -Infinity) {
                  // If the computer's turn guarantees a loss, evaluate the current resulting state instead
                  // This might overestimate the value, but avoids propagating -Infinity if forced move
                  totalScore = evaluateBoard(simResult.board);
             } else {
                 totalScore = currentTurnScore + nextStateExpectedScore;
             }

             if (totalScore > bestScore) {
                 bestScore = totalScore;
                 bestMove = direction;
             }
        }
        console.log(`Expectimax best score: ${bestScore.toFixed(2)} for move ${bestMove}`);
        // Fallback to first valid move if all scores end up -Infinity or calculation fails
        return bestMove || validMoves[0];
    }


    // --- MCTS Bot ---
    class MCTSNode {
        constructor(state, parent = null, move = null) {
            this.state = state; // Board state (should be deep copied before passing)
            this.parent = parent;
            this.move = move; // The player move that *led* to this state (before random tile)
            this.children = {}; // Map: direction (string) -> MCTSNode
            this.untriedMoves = getValidMoves(this.state); // Valid player moves *from* this state
            this.visits = 0;
            this.score = 0; // Accumulated score sum from rollouts starting/passing through here
            // Determine if this state is terminal (no further player moves possible)
            this.isTerminal = !canMoveCheckBoard(this.state);
        }

        // UCB1 formula for selecting child node during Selection phase
        getUCB1(explorationC) {
            if (this.visits === 0) {
                return Infinity; // Prioritize unvisited nodes
            }
            if (!this.parent || this.parent.visits === 0) {
                // Root node or error case
                return this.score / this.visits; // Just return average score
            }
             // UCB1 = Average Score (Exploitation) + Exploration Bonus
             return (this.score / this.visits) +
                   explorationC * Math.sqrt(Math.log(this.parent.visits) / this.visits);
        }

        // Selects the child with the highest UCB1 score
        selectChild(explorationC) {
            let bestChild = null;
            let bestScore = -Infinity;
            // Iterate through existing children (moves already taken from this node)
            for (const move in this.children) {
                 const child = this.children[move];
                 const ucb1Score = child.getUCB1(explorationC);
                 if (ucb1Score > bestScore) {
                     bestScore = ucb1Score;
                     bestChild = child;
                 }
             }
             return bestChild;
        }

        // Expands the node by creating one new child node for an untried move
        expand() {
            if (this.untriedMoves.length === 0) {
                 return null; // Cannot expand if no untried moves left
            }
            // Choose the next untried move deterministically (e.g., pop)
            const move = this.untriedMoves.pop();
            // Simulate the player making that move
            const simResult = simulateMove(this.state, move);

            // The child node represents the state *after* the player's move (simResult.board),
            // before the computer adds a random tile. The rollout will handle the random tile addition.
            const childNode = new MCTSNode(simResult.board, this, move);
            this.children[move] = childNode; // Add to children map
            return childNode;
        }

        // Simulates a random playout from the current node's state until a terminal state or depth limit
        simulateRollout() {
             // Start rollout from the state represented by this node.
             // The *first* step is the computer adding a random tile.
             let currentState = deepCopy(this.state);
             let rolloutScore = 0; // Score accumulated *during* the rollout itself
             let depth = 0;

             // Simulate game playing out randomly
             while(depth < MCTS_ROLLOUT_DEPTH) {
                 // 1. Simulate Computer's Random Tile Placement (if possible)
                 let emptyCells = getEmptyCells(currentState);
                 if (emptyCells.length > 0) {
                     let { r, c } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
                     currentState[r][c] = Math.random() < 0.1 ? 4 : 2;
                 } else {
                      // Game ended because computer couldn't place a tile
                      break;
                 }

                 // 2. Check if player has moves after computer's placement
                 if (!canMoveCheckBoard(currentState)) {
                     break; // Game ended because player has no moves
                 }

                 // 3. Simulate Player making a random valid move
                  const validMoves = getValidMoves(currentState);
                  // This check should be redundant due to canMoveCheckBoard, but safety first
                  if (validMoves.length === 0) break;

                  const randomMove = validMoves[Math.floor(Math.random() * validMoves.length)];
                  const simResult = simulateMove(currentState, randomMove);
                  currentState = simResult.board; // Update state for next iteration
                  rolloutScore += simResult.scoreDelta; // Accumulate score gained in rollout

                  depth++;
             }

             // Return evaluation of the final state reached + score accumulated during rollout
             return rolloutScore + evaluateBoard(currentState);
        }

        // Updates the visit count and score back up the tree from this node to the root
        backpropagate(resultScore) {
            this.visits++;
            this.score += resultScore; // Add the rollout score to the node's total
            if (this.parent) {
                this.parent.backpropagate(resultScore); // Recursively update parent
            }
        }
    }

    function botMctsMove() {
        const root = new MCTSNode(deepCopy(board)); // Start MCTS from current global board state

        if (root.isTerminal) {
            console.log("MCTS: Root node is terminal, no moves possible.");
            return null;
        }

        // Run the MCTS phases for a fixed number of iterations
        for (let i = 0; i < MCTS_ITERATIONS; i++) {
             let node = root;

             // 1. Selection: Traverse down the tree using UCB1
             while (node.untriedMoves.length === 0 && Object.keys(node.children).length > 0 && !node.isTerminal) {
                 node = node.selectChild(MCTS_EXPLORATION_C);
                 if (!node) { // Safety check if selection somehow fails
                    console.warn("MCTS Selection returned null, restarting from root.");
                    node = root;
                    break;
                 }
             }

             // 2. Expansion: If node has untried moves and isn't terminal, expand one move
             if (node.untriedMoves.length > 0 && !node.isTerminal) {
                 const expandedNode = node.expand();
                 if (expandedNode) {
                     node = expandedNode; // Move to the newly expanded node for rollout
                 } else {
                     // Expansion failed (shouldn't happen if untriedMoves > 0), maybe log error?
                     console.warn("MCTS Expansion failed unexpectedly.");
                     // Stay at the current node for simulation? Or choose another selection?
                     // Staying at current node is safer for now.
                 }
             }

             // 3. Simulation (Rollout): Simulate from the selected/expanded node
             let rolloutScore = node.simulateRollout();

             // 4. Backpropagation: Update statistics up the tree
             node.backpropagate(rolloutScore);
        }

         // After iterations, choose the move leading to the child with the most visits (most robust)
         let bestMove = null;
         let maxVisits = -1;

         // Iterate through the *possible first moves* from the root state
         for (const move of getValidMoves(root.state)) {
            if (root.children[move]) { // Check if this move was explored (has a child node)
                 const childNode = root.children[move];
                  // Optional: Log stats for debugging
                  // console.log(`MCTS Move ${move}: Visits=${childNode.visits}, AvgScore=${(childNode.score / childNode.visits || 0).toFixed(2)}`);
                 if (childNode.visits > maxVisits) {
                     maxVisits = childNode.visits;
                     bestMove = move;
                 }
            } else {
                // This move was valid but never explored (might happen with low iterations)
                // console.log(`MCTS Move ${move}: Not explored.`);
            }
         }

         if (bestMove) {
             console.log(`MCTS best move (most visits): ${bestMove} (${maxVisits} visits)`);
         } else {
             console.warn("MCTS: No move selected (no children explored?). Falling back to random.");
             // Fallback: choose the move with the highest average score if visits are zero? Or just random.
             bestMove = botRandomMove();
         }

         return bestMove;
    }


    // --- Bot Execution ---
    function executeBotMove() {
        if (isPaused) return;
        if (!botMode || gameOver) return; // Check state before proceeding

        // Determine appropriate delay based on algorithm complexity
        let currentBotDelay = botDelay;
        if (botAlgorithm === "expectimax" || botAlgorithm === "mcts") {
            currentBotDelay = Math.max(botDelay, 100); // Minimum delay for complex AI, even if calculation is fast
        }

        // Check if enough time has passed since the last move
        if (performance.now() - lastBotMoveTime < currentBotDelay) {
            return;
        }

        console.log(`Bot (${botAlgorithm}) thinking...`);
        let chosenMove = null;
        const startTime = performance.now();

        // Select and execute the chosen bot algorithm
        try {
             switch (botAlgorithm) {
                 case "random":       chosenMove = botRandomMove(); break;
                 case "greedy":       chosenMove = botGreedyMove(); break;
                 case "heuristic":    chosenMove = botHeuristicMove(); break;
                 case "remove_small": chosenMove = botRemoveSmallMove(); break;
                 case "combined":     chosenMove = botCombinedMove(); break;
                 case "expectimax":   chosenMove = botExpectimaxMove(); break;
                 case "mcts":         chosenMove = botMctsMove(); break;
                 default:             chosenMove = botRandomMove(); break;
             }
        } catch (error) {
            console.error(`Error during bot (${botAlgorithm}) execution:`, error);
            chosenMove = botRandomMove(); // Fallback to random on error
        }

        const endTime = performance.now();
        console.log(`Bot thought time: ${(endTime - startTime).toFixed(1)} ms`);

        if (chosenMove) {
            console.log(`Bot (${botAlgorithm}) moving: ${chosenMove}`);
            // Perform the move using the main move function
            // move() handles state updates, history, UI, drawing internally if successful
            if (move(chosenMove)) {
                 // Optional: Explicit redraw if move() doesn't always trigger it
                 drawGame();
            } else {
                 // If move returns false, it means the chosen move was invalid *at the time of execution*
                 console.warn(`Bot (${botAlgorithm}) chose move ${chosenMove}, but it resulted in no change.`);
                 // Check for game over again, as the failed move might be the only option
                 if (!gameOver && !canMoveCheck()) {
                     gameOver = true;
                     updateUI();
                 }
            }
        } else {
            // Bot algorithm returned null (should only happen if no valid moves exist)
            console.log(`Bot (${botAlgorithm}) found no valid moves.`);
            // Ensure game over state is set if not already
            if (!gameOver && !canMoveCheck()) {
                gameOver = true;
                updateUI();
            }
        }
        lastBotMoveTime = performance.now(); // Record time even if move failed, to maintain delay
    }

    // --- Event Listeners ---
    document.addEventListener('keydown', (e) => {
        // Manual Gameplay Handling (only if bot is off and game not over)
        if (!botMode && !gameOver) {
             let direction = null;
             switch (e.key) {
                 case 'ArrowUp': case 'w': direction = UP; break;
                 case 'ArrowDown': case 's': direction = DOWN; break;
                 case 'ArrowLeft': case 'a': direction = LEFT; break;
                 case 'ArrowRight': case 'd': direction = RIGHT; break;
             }
             if (direction) {
                 e.preventDefault(); // Prevent page scrolling
                 if(move(direction)) { // move() returns true if board changed
                     drawGame(); // Explicit draw after successful manual move
                 };
             }
        }

        // Global Controls (work regardless of bot state, unless specific like pause)
        switch (e.key.toLowerCase()) {
            case 'r': // Reset Game
                 e.preventDefault();
                 resetGame();
                 break;
            case 'b': // Toggle Bot Mode
                 e.preventDefault();
                 botMode = !botMode;
                 isPaused = false; // Always unpause when toggling bot mode
                 lastBotMoveTime = performance.now(); // Reset bot timer
                 console.log(`Bot Mode: ${botMode}`);
                 updateUI();
                 break;
            case 'a': // Cycle Bot Algorithm
                 e.preventDefault();
                 currentAlgorithmIndex = (currentAlgorithmIndex + 1) % botAlgorithms.length;
                 botAlgorithm = botAlgorithms[currentAlgorithmIndex];
                 console.log(`Bot Algorithm: ${botAlgorithm}`);
                 updateUI();
                 break;
             case 'h': // Toggle History Panel
                 e.preventDefault();
                 showHistoryPanel = !showHistoryPanel;
                 // Ensure panel redraws correctly when shown/hidden
                 updateUI();
                 if (showHistoryPanel) scrollToHistoryBottom(); // Scroll to bottom when shown
                 break;
             case 'u': // Undo (Revert to previous history state)
                  e.preventDefault();
                  if (botMode) {
                      console.log("Undo disabled while Bot is active.");
                      break;
                  }
                  if (selectedHistoryIndex > 0) {
                     selectedHistoryIndex--;
                     const prevState = deepCopy(history[selectedHistoryIndex]);
                     board = prevState.board;
                     score = prevState.score;
                     gameOver = prevState.gameOver; // Revert game over state too
                     branchPoint = null; // Clear branch point indicator when undoing
                     console.log(`Undo: Reverted to history state ${selectedHistoryIndex}`);
                     updateUI();
                     drawGame();
                  } else {
                      console.log("Already at the beginning of history.");
                  }
                 break;
             case 'p': // Pause/Resume Bot
                 e.preventDefault();
                 if (botMode) { // Only works if bot is enabled
                     isPaused = !isPaused;
                     console.log(`Bot Paused: ${isPaused}`);
                     updateUI(); // Update status text
                 } else {
                     console.log("Pause/Resume only affects Bot mode.");
                 }
                 break;
             case 'd': // Toggle Dark Mode
                 e.preventDefault();
                 toggleDarkMode();
                 break;
        }

        // Combined strategy toggles (1-5) - Only relevant if combined algo active?
        // Let's allow toggling anytime for setup purposes.
        if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key >= '1' && e.key <= '5') { // Check for number keys 1-5
             e.preventDefault();
             const stratName = strategyKeyMapping[e.key];
             if (combinedBotStrategies[stratName]) {
                 combinedBotStrategies[stratName].active = !combinedBotStrategies[stratName].active;
                 // Update the order array to reflect active status (optional, but good for display)
                 if (combinedBotStrategies[stratName].active) {
                     if (!strategyOrder.includes(stratName)) {
                         strategyOrder.push(stratName); // Add if newly activated
                     }
                 } else {
                      strategyOrder = strategyOrder.filter(s => s !== stratName); // Remove if deactivated
                 }
                 console.log(`Strategy '${stratName}' toggled ${combinedBotStrategies[stratName].active ? 'ON' : 'OFF'}. Order: ${strategyOrder.join(', ')}`);
                 updateUI(); // Update status lines
             }
        }
    });

    // --- Game Loop ---
    function gameLoop() {
        // Bot execution logic is called here
        executeBotMove(); // Checks internally if bot active, not paused, not game over, and delay passed

        // Request the next frame
        requestAnimationFrame(gameLoop);
    }

    // --- Initialization ---
    if (isDarkMode) bodyElement.classList.add('dark-mode'); // Apply dark mode class initially if needed
    applyThemeColors(); // Apply initial theme colors (will be dark if isDarkMode=true)
    resetGame(); // Setup initial board, history, score, etc. (calls updateUI, drawGame, etc.)
    gameLoop(); // Start the main game loop

    // Update controls info text initially
     const controlsInfoDiv = document.querySelector('.controls-info');
     if (controlsInfoDiv) {
         controlsInfoDiv.textContent = 'Arrows/WASD: Move | B: Bot | A: Algo | R: Reset | H: History | U: Undo | P: Pause Bot | D: Dark Mode | 1-5: Cmb Strats';
     }

}); // End DOMContentLoaded
