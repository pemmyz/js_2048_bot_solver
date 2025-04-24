document.addEventListener('DOMContentLoaded', () => {
    // ... (Keep all existing constants and DOM element selections) ...
    const GRID_SIZE = 4;
    const TILE_SIZE = 100;
    const TILE_MARGIN = 10;
    const SCREEN_PADDING = 20; // Mostly for layout, less direct use in canvas
    const SCORE_HEIGHT = 50; // Used for layout in CSS/HTML
    const BOTTOM_TEXT_HEIGHT = 60; // Used for layout in CSS/HTML
    const PANEL_WIDTH = 250; // Used for layout in CSS/HTML
    const SCROLLBAR_WIDTH = 10;
    const SCROLLBAR_GAP = 2;
    const ENTRY_HEIGHT = 30; // Includes spacing for calculation
    const ENTRY_SPACING = 5; // Visual spacing in CSS

    const GRID_INTERNAL_WIDTH = GRID_SIZE * TILE_SIZE + (GRID_SIZE - 1) * TILE_MARGIN;
    const GRID_DRAW_WIDTH = GRID_SIZE * (TILE_SIZE + TILE_MARGIN) + TILE_MARGIN;

    const CANVAS_WIDTH = GRID_DRAW_WIDTH;
    const CANVAS_HEIGHT = GRID_DRAW_WIDTH; // Keep it square for the grid

    const BACKGROUND_COLOR = '#bbada0'; // (187, 173, 160)
    const EMPTY_COLOR = '#cdc1b4'; // (205, 193, 180)
    const TILE_COLORS = {
        2: '#eee4da', // (238, 228, 218)
        4: '#ede0c8', // (237, 224, 200)
        8: '#f2b179', // (242, 177, 121)
        16: '#f59563', // (245, 149, 99)
        32: '#f67c5f', // (246, 124, 95)
        64: '#f65e3b', // (246, 94, 59)
        128: '#edcf72', // (237, 207, 114)
        256: '#edcc61', // (237, 204, 97)
        512: '#edc850', // (237, 200, 80)
        1024: '#edc53f', // (237, 197, 63)
        2048: '#edc22e', // (237, 194, 46)
        // Add more colors for higher tiles if needed
        4096: '#3c3a32',
        8192: '#3c3a32',
    };
    const TILE_TEXT_COLOR_LIGHT = '#f9f6f2'; // For dark tiles (>= 8)
    const TILE_TEXT_COLOR_DARK = '#776e65'; // For light tiles (< 8)

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
    let isPaused = false; // <-- NEW: Pause state for bot

    const botAlgorithms = [
        "random", "greedy", /* "expectimax", "mcts", */ // Commented out for brevity/performance
        "heuristic", "remove_small", "combined"
    ];
    let currentAlgorithmIndex = 0;
    let botAlgorithm = botAlgorithms[currentAlgorithmIndex];
    let botDelay = 300; // ms
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


    // --- Deep Copy Helper ---
    function deepCopy(obj) {
        if (typeof structuredClone === 'function') {
            return structuredClone(obj);
        } else {
            try {
                return JSON.parse(JSON.stringify(obj));
            } catch (e) {
                console.error("Deep copy failed. Consider a more robust polyfill if needed.", e);
                return { ...obj, board: obj.board ? obj.board.map(row => [...row]) : [] };
            }
        }
    }


    // --- Game Logic ---
    function resetGame() {
        board = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0));
        score = 0;
        gameOver = false;
        isPaused = false; // <-- NEW: Reset pause on game reset
        addRandomTile();
        addRandomTile();
        history = [{ board: deepCopy(board), score: score, gameOver: gameOver }];
        selectedHistoryIndex = 0;
        branchPoint = null;
        historyScrollOffset = 0;
        scrollToHistoryBottom(); // <-- NEW: Ensure scroll is at bottom on reset
        updateUI();
        drawGame();
        console.log("Game Reset");
    }

    function addRandomTile() {
        let emptyCells = [];
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (board[r][c] === 0) {
                    emptyCells.push({ r, c });
                }
            }
        }
        if (emptyCells.length > 0) {
            let { r, c } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
            board[r][c] = Math.random() < 0.1 ? 4 : 2;
        }
    }

    function canMoveCheck() {
        // Check for empty cells
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (board[r][c] === 0) return true;
            }
        }
        // Check for adjacent merges
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (r < GRID_SIZE - 1 && board[r][c] === board[r + 1][c]) return true;
                if (c < GRID_SIZE - 1 && board[r][c] === board[r][c + 1]) return true;
            }
        }
        return false;
    }

    function move(direction) {
        if (gameOver) return false;

        let boardBefore = deepCopy(board);
        // scoreBefore not needed as score is global
        let moved = false;

        switch (direction) {
            case LEFT:  moved = moveLeft(); break;
            case RIGHT: moved = moveRight(); break;
            case UP:    moved = moveUp(); break;
            case DOWN:  moved = moveDown(); break;
        }

        let boardChanged = JSON.stringify(boardBefore) !== JSON.stringify(board);

        if (boardChanged) {
             addRandomTile();
            if (!canMoveCheck()) {
                gameOver = true;
                console.log("Game Over!");
            }

            // Update history
            if (selectedHistoryIndex === history.length - 1) {
                 history.push({ board: deepCopy(board), score: score, gameOver: gameOver });
                 selectedHistoryIndex++;
                 branchPoint = null;
             } else {
                 branchPoint = selectedHistoryIndex + 1;
                 history = history.slice(0, selectedHistoryIndex + 1);
                 history.push({ board: deepCopy(board), score: score, gameOver: gameOver });
                 selectedHistoryIndex = history.length - 1;
                 console.log(`Branched history at move ${branchPoint}`);
             }
             scrollToHistoryBottom(); // <-- NEW: Auto-scroll after new move
             updateUI();
        } else {
             if (!canMoveCheck()) {
                 gameOver = true;
                  console.log("Game Over! (No valid moves)");
                 if (history.length > 0) {
                     history[history.length - 1].gameOver = true;
                 }
                updateUI();
             }
        }

        return boardChanged;
    }


    // --- Movement Helpers (compress, merge, operateRow, moveLeft, moveRight, moveUp, moveDown) ---
    // ... (Keep these functions exactly as they were) ...
    function compress(row) {
        let newRow = row.filter(num => num !== 0);
        while (newRow.length < GRID_SIZE) {
            newRow.push(0);
        }
        return newRow;
    }

    function merge(row) {
        let merged = false;
        for (let i = 0; i < GRID_SIZE - 1; i++) {
            if (row[i] !== 0 && row[i] === row[i + 1]) {
                row[i] *= 2;
                score += row[i]; // Update global score
                row[i + 1] = 0;
                merged = true;
                // i++; // Skip the next tile as it's now 0 - Re-evaluating this, might allow chain merges unintendedly? Let's keep it commented.
            }
        }
        return { row, merged };
    }

    function operateRow(row) {
        let originalRow = [...row]; // Copy before operations
        row = compress(row);
        let mergeResult = merge(row);
        row = mergeResult.row;
        row = compress(row);
        let changed = JSON.stringify(originalRow) !== JSON.stringify(row);
        return { row, changed: changed || mergeResult.merged }; // Also changed if merged
    }

    function moveLeft() {
        let changedOverall = false;
        for (let r = 0; r < GRID_SIZE; r++) {
            let result = operateRow(board[r]);
            board[r] = result.row;
            changedOverall = changedOverall || result.changed;
        }
        return changedOverall;
    }

    function moveRight() {
        let changedOverall = false;
        for (let r = 0; r < GRID_SIZE; r++) {
            let reversedRow = board[r].slice().reverse();
            let result = operateRow(reversedRow);
            board[r] = result.row.reverse();
             changedOverall = changedOverall || result.changed;
        }
        return changedOverall;
    }

     function moveUp() {
        let changedOverall = false;
        for (let c = 0; c < GRID_SIZE; c++) {
            let col = [];
            for (let r = 0; r < GRID_SIZE; r++) {
                col.push(board[r][c]);
            }
            let result = operateRow(col);
            for (let r = 0; r < GRID_SIZE; r++) {
                board[r][c] = result.row[r];
            }
             changedOverall = changedOverall || result.changed;
        }
        return changedOverall;
    }

    function moveDown() {
        let changedOverall = false;
        for (let c = 0; c < GRID_SIZE; c++) {
            let col = [];
            for (let r = 0; r < GRID_SIZE; r++) {
                col.push(board[r][c]);
            }
            let reversedCol = col.slice().reverse();
            let result = operateRow(reversedCol);
            let finalCol = result.row.reverse();
            for (let r = 0; r < GRID_SIZE; r++) {
                board[r][c] = finalCol[r];
            }
             changedOverall = changedOverall || result.changed;
        }
        return changedOverall;
    }


    // --- Drawing (drawGame, drawTile, drawRoundedRect) ---
    // ... (Keep these functions exactly as they were) ...
    function drawGame() {
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw background grid cells
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

        // Draw tiles
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
        const bgColor = TILE_COLORS[value] || '#3c3a32'; // Default for > 2048
        const textColor = value >= 8 ? TILE_TEXT_COLOR_LIGHT : TILE_TEXT_COLOR_DARK;
        const fontSize = value < 100 ? 45 : value < 1000 ? 35 : 30; // Adjust font size

        // Draw tile background
        ctx.fillStyle = bgColor;
        drawRoundedRect(ctx, x, y, TILE_SIZE, TILE_SIZE, 8);

        // Draw tile value
        ctx.fillStyle = textColor;
        ctx.font = `bold ${fontSize}px Verdana, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(value.toString(), x + TILE_SIZE / 2, y + TILE_SIZE / 2);
    }

    function drawRoundedRect(ctx, x, y, width, height, radius) {
        if (typeof ctx.roundRect === 'function') {
            // Use native roundRect if available
            ctx.beginPath();
            ctx.roundRect(x, y, width, height, radius);
            ctx.fill();
        } else {
            // Fallback path drawing for rounded corners
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

        // <-- NEW: Update status line 1 to include pause state -->
        let botStatusText = botMode
            ? `Bot (${isPaused ? 'Paused' : 'Running'})`
            : 'Manual';
        statusLine1.textContent = `Mode: ${botStatusText} | Algorithm: ${botAlgorithm}`;
        // <-- End Update -->

        if (botAlgorithm === "combined") {
            const activeStrats = strategyOrder.filter(s => combinedBotStrategies[s].active);
            statusLine2.textContent = `Active: ${activeStrats.join(', ') || 'None'}`;
            statusLine3.textContent = `(Use 1-5 to toggle, P to pause)`;
        } else {
             statusLine2.textContent = `(P to pause bot)`; // Show pause reminder here too
             statusLine3.textContent = '';
        }

        gameOverMessage.style.display = gameOver ? 'block' : 'none';

        if (showHistoryPanel) {
            // History panel drawing might change scroll offset, so draw it first
            drawHistoryPanel();
             historyPanel.classList.remove('hidden');
             container.style.gap = '20px'; // Restore gap when panel is shown
        } else {
            historyPanel.classList.add('hidden');
             container.style.gap = '0px'; // Remove gap when panel is hidden
        }
    }

    // --- History Panel Logic ---

    // <-- NEW: Helper function to scroll history to bottom -->
    function scrollToHistoryBottom() {
        if (!showHistoryPanel) return; // Don't try to scroll if hidden

        const panelHeight = historyEntriesContainer.clientHeight;
        if (panelHeight <= 0) return; // Avoid calculation errors if panel isn't rendered yet

        const totalContentHeight = history.length * ENTRY_HEIGHT;
        historyMaxScroll = Math.max(0, totalContentHeight - panelHeight);
        historyScrollOffset = historyMaxScroll;

        // Redraw the panel to reflect the scroll change
        // updateUI() calls drawHistoryPanel, so we can rely on that if called soon after,
        // but calling directly ensures it happens if updateUI isn't immediately next.
        drawHistoryPanel();
    }
    // <-- End Helper Function -->


    function getTopFourTiles(stateBoard) {
        const tiles = stateBoard.flat().filter(tile => tile !== 0);
        tiles.sort((a, b) => b - a); // Sort descending
        return tiles.slice(0, 4);
    }

    function drawHistoryPanel() {
        historyEntriesContainer.innerHTML = ''; // Clear previous entries
        const panelHeight = historyEntriesContainer.clientHeight; // Visible height
        if (panelHeight <= 0) return; // Can't draw if not visible/sized

        const totalContentHeight = history.length * ENTRY_HEIGHT; // Total height needed

        // Ensure scroll offset is within valid bounds AFTER potential content changes
        historyMaxScroll = Math.max(0, totalContentHeight - panelHeight);
        historyScrollOffset = Math.max(0, Math.min(historyScrollOffset, historyMaxScroll));

        const firstVisibleIndex = Math.floor(historyScrollOffset / ENTRY_HEIGHT);
        const lastVisibleIndex = Math.ceil((historyScrollOffset + panelHeight) / ENTRY_HEIGHT);

        history.forEach((state, idx) => {
             if (idx >= firstVisibleIndex - 5 && idx <= lastVisibleIndex + 5) { // Render buffer
                const entry = document.createElement('div');
                entry.classList.add('history-entry');
                const topTiles = getTopFourTiles(state.board);
                entry.textContent = `Move ${idx}: ${topTiles.join(', ')}`;
                entry.dataset.index = idx;

                if (idx === selectedHistoryIndex) {
                    entry.classList.add('selected');
                }
                 if (branchPoint !== null && idx === branchPoint) {
                    entry.classList.add('branch-point');
                 }

                entry.style.top = `${idx * ENTRY_HEIGHT - historyScrollOffset}px`;

                entry.addEventListener('click', () => {
                    selectedHistoryIndex = idx;
                    const selectedState = deepCopy(history[idx]);
                    board = selectedState.board;
                    score = selectedState.score;
                    gameOver = selectedState.gameOver;
                    console.log(`Selected history state ${idx}`);

                    // <-- NEW: Scroll to bottom if the LAST item was clicked -->
                    if (idx === history.length - 1) {
                        scrollToHistoryBottom();
                    }
                    // <-- End New -->

                    updateUI(); // Update score display, status, and redraw history highlight
                    drawGame(); // Redraw board
                });
                 historyEntriesContainer.appendChild(entry);
            }
        });

        // Update scrollbar thumb
        if (historyMaxScroll > 0 && panelHeight > 0) {
            const thumbHeightRatio = Math.min(1, panelHeight / totalContentHeight);
            const thumbHeight = Math.max(20, thumbHeightRatio * panelHeight);
            const trackHeight = panelHeight; // Scrollable area height
            const thumbMaxY = trackHeight - thumbHeight;
            const thumbY = (historyScrollOffset / historyMaxScroll) * thumbMaxY;

            scrollbarThumb.style.height = `${thumbHeight}px`;
            scrollbarThumb.style.top = `${thumbY}px`;
            scrollbarTrack.style.display = 'block';
        } else {
            scrollbarTrack.style.display = 'none'; // Hide scrollbar if not needed
        }
    }

    // Scrollbar drag handling (mousedown, mousemove, mouseup)
    // ... (Keep these handlers exactly as they were) ...
     scrollbarThumb.addEventListener('mousedown', (e) => {
        draggingScrollbar = true;
        scrollbarDragOffsetY = e.clientY - scrollbarThumb.getBoundingClientRect().top;
        scrollbarThumb.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none'; // Prevent text selection during drag
    });

     document.addEventListener('mousemove', (e) => {
        if (!draggingScrollbar) return;
        const trackRect = scrollbarTrack.getBoundingClientRect();
        const thumbHeight = scrollbarThumb.offsetHeight;

         let newThumbY = e.clientY - trackRect.top - scrollbarDragOffsetY;
        newThumbY = Math.max(0, Math.min(newThumbY, trackRect.height - thumbHeight));

         if (trackRect.height - thumbHeight > 0) {
            historyScrollOffset = (newThumbY / (trackRect.height - thumbHeight)) * historyMaxScroll;
         } else {
            historyScrollOffset = 0;
         }

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
        if (!showHistoryPanel) return; // Ignore if panel hidden
        e.preventDefault(); // Prevent page scrolling
        const scrollAmount = 30; // Pixels per wheel step
        historyScrollOffset += e.deltaY > 0 ? scrollAmount : -scrollAmount;
        // Bounds check handled within drawHistoryPanel
        drawHistoryPanel();
    });

    // --- Bot Logic (getValidMoves, botRandomMove, botGreedyMove, etc.) ---
    // --- Evaluation Functions (evalEmpty, evalCorner, etc.) ---
    // ... (Keep all bot logic and evaluation functions exactly as they were) ...
    // Helper: Get valid moves for a given game state
    function getValidMoves(currentBoard, currentScore) {
        const moves = [];
        const originalBoard = deepCopy(board); // Backup global state
        const originalScore = score;

        // Temporarily set the global state to the state we're checking
        board = deepCopy(currentBoard);
        score = currentScore;

        for (const direction of [UP, DOWN, LEFT, RIGHT]) {
             // Simulate the move without adding random tile or updating history
            let boardBefore = deepCopy(board);
            let moved = false;
            switch (direction) {
                case LEFT: moved = moveLeft(); break;
                case RIGHT: moved = moveRight(); break;
                case UP: moved = moveUp(); break;
                case DOWN: moved = moveDown(); break;
             }
             let boardChanged = JSON.stringify(boardBefore) !== JSON.stringify(board);

             if (boardChanged) {
                moves.push(direction);
             }
             // IMPORTANT: Restore the board and score for the next check
              board = deepCopy(boardBefore); // Restore board to before *this specific move check*
              score = currentScore; // Restore score (merge might have changed it)

        }

        // Restore the original global state
        board = originalBoard;
        score = originalScore;

        return moves;
    }

    // Bot: Random
    function botRandomMove() {
        const validMoves = getValidMoves(board, score);
        if (validMoves.length > 0) {
            return validMoves[Math.floor(Math.random() * validMoves.length)];
        }
        return null; // Should not happen if canMove is true, but safety first
    }

    // Bot: Greedy (Maximize Empty Cells)
     function botGreedyMove() {
         let bestMove = null;
         let bestEmpty = -1;
         const originalBoard = deepCopy(board); // Backup
         const originalScore = score;

         for (const direction of [UP, DOWN, LEFT, RIGHT]) {
             // Simulate move on a copy
             board = deepCopy(originalBoard);
             score = originalScore;
             let boardBefore = deepCopy(board);
              let moved = false;
              switch (direction) {
                case LEFT: moved = moveLeft(); break;
                case RIGHT: moved = moveRight(); break;
                case UP: moved = moveUp(); break;
                case DOWN: moved = moveDown(); break;
             }
             let boardChanged = JSON.stringify(boardBefore) !== JSON.stringify(board);

              if (boardChanged) {
                 // Evaluate the resulting state (after potential random tile add)
                 // For simple greedy, we just count empty cells *after* the move
                 // (Doesn't simulate the random tile, simpler but less accurate)
                 let empty = board.flat().filter(x => x === 0).length;
                 if (empty > bestEmpty) {
                     bestEmpty = empty;
                     bestMove = direction;
                 }
             }
         }
         // Restore original state
         board = originalBoard;
         score = originalScore;
         return bestMove || botRandomMove(); // Fallback to random if no move seems beneficial
     }

    // --- Evaluation Functions for Heuristic/Combined Bots ---
    function evalEmpty(currentBoard) {
        return currentBoard.flat().filter(x => x === 0).length;
    }

    function evalGetMaxTile(currentBoard) {
         let maxVal = 0;
         let maxPos = { r: 0, c: 0 };
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


    function evalCorner(currentBoard) {
        const { pos, value } = evalGetMaxTile(currentBoard);
        const corners = [
            { r: 0, c: 0 },
            { r: 0, c: GRID_SIZE - 1 },
            { r: GRID_SIZE - 1, c: 0 },
            { r: GRID_SIZE - 1, c: GRID_SIZE - 1 }
        ];
        let bestCornerScore = -Infinity;

        for (const corner of corners) {
             let dist = Math.abs(corner.r - pos.r) + Math.abs(corner.c - pos.c);
             let cornerScore = (GRID_SIZE * 2 - dist) * (value || 1); // Reward proximity and value
             bestCornerScore = Math.max(bestCornerScore, cornerScore);
        }
        if (corners.some(c => c.r === pos.r && c.c === pos.c)) {
            bestCornerScore += value * 2; // Extra points for being in the corner
        }

        return bestCornerScore;
    }

    function evalMonotonicity(currentBoard) {
        let score = 0;
        // Rows
        for (let r = 0; r < GRID_SIZE; r++) {
            let current = 0; let next = current + 1; let diff = 0;
            while (next < GRID_SIZE) {
                 while (next < GRID_SIZE && currentBoard[r][next] === 0) next++;
                 if (next >= GRID_SIZE) break;
                 let currentVal = currentBoard[r][current] === 0 ? 0 : Math.log2(currentBoard[r][current]);
                 let nextVal = currentBoard[r][next] === 0 ? 0 : Math.log2(currentBoard[r][next]);
                 if (diff === 0) diff = nextVal - currentVal;
                 else if ((nextVal - currentVal) * diff < 0) { diff = -Infinity; break; }
                 current = next++;
             }
             if (diff !== -Infinity) score += Math.abs(diff);
        }
         // Columns
        for (let c = 0; c < GRID_SIZE; c++) {
            let current = 0; let next = current + 1; let diff = 0;
            while (next < GRID_SIZE) {
                 while (next < GRID_SIZE && currentBoard[next][c] === 0) next++;
                 if (next >= GRID_SIZE) break;
                 let currentVal = currentBoard[current][c] === 0 ? 0 : Math.log2(currentBoard[current][c]);
                 let nextVal = currentBoard[next][c] === 0 ? 0 : Math.log2(currentBoard[next][c]);
                 if (diff === 0) diff = nextVal - currentVal;
                 else if ((nextVal - currentVal) * diff < 0) { diff = -Infinity; break; }
                 current = next++;
             }
              if (diff !== -Infinity) score += Math.abs(diff);
         }
        return score;
    }

    function evalSmoothness(currentBoard) {
        let smoothness = 0;
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (currentBoard[r][c] !== 0) {
                    let value = Math.log2(currentBoard[r][c]);
                    // Right
                    if (c < GRID_SIZE - 1 && currentBoard[r][c + 1] !== 0) {
                        smoothness -= Math.abs(value - Math.log2(currentBoard[r][c + 1]));
                    }
                     // Down
                     if (r < GRID_SIZE - 1 && currentBoard[r + 1][c] !== 0) {
                         smoothness -= Math.abs(value - Math.log2(currentBoard[r + 1][c]));
                     }
                }
            }
        }
        return smoothness;
    }

    function countSmallTiles(currentBoard, threshold = 8) {
        return currentBoard.flat().filter(tile => tile > 0 && tile < threshold).length;
    }

    function evalRemoveSmall(currentBoard) {
        return -countSmallTiles(currentBoard, 8);
    }

     function botHeuristicMove() {
         let bestMove = null;
         let bestValue = -Infinity;
          const originalBoard = deepCopy(board);
         const originalScore = score;

         for (const direction of [UP, DOWN, LEFT, RIGHT]) {
             board = deepCopy(originalBoard);
             score = originalScore;
             let boardBefore = deepCopy(board);
             let moved = false;
              switch (direction) {
                case LEFT: moved = moveLeft(); break;
                case RIGHT: moved = moveRight(); break;
                case UP: moved = moveUp(); break;
                case DOWN: moved = moveDown(); break;
             }
             let boardChanged = JSON.stringify(boardBefore) !== JSON.stringify(board);

              if (boardChanged) {
                 let empty = evalEmpty(board);
                 let maxTileData = evalGetMaxTile(board);
                 let value = empty * 2 + (maxTileData.value > 0 ? Math.log2(maxTileData.value) : 0);
                 if (value > bestValue) {
                     bestValue = value;
                     bestMove = direction;
                 }
             }
         }
         board = originalBoard;
         score = originalScore;
         return bestMove || botRandomMove();
     }

     function botRemoveSmallMove() {
         let bestMove = null;
         let bestSmallCount = Infinity;
         const originalBoard = deepCopy(board);
         const originalScore = score;

         for (const direction of [UP, DOWN, LEFT, RIGHT]) {
             board = deepCopy(originalBoard);
             score = originalScore;
             let boardBefore = deepCopy(board);
             let moved = false;
              switch (direction) {
                case LEFT: moved = moveLeft(); break;
                case RIGHT: moved = moveRight(); break;
                case UP: moved = moveUp(); break;
                case DOWN: moved = moveDown(); break;
             }
              let boardChanged = JSON.stringify(boardBefore) !== JSON.stringify(board);

              if (boardChanged) {
                 let smallCount = countSmallTiles(board, 8);
                 if (smallCount < bestSmallCount) {
                     bestSmallCount = smallCount;
                     bestMove = direction;
                 }
             }
         }
         board = originalBoard;
         score = originalScore;
         return bestMove || botRandomMove();
     }

    function botCombinedMove() {
        let bestMove = null;
        let bestScore = -Infinity;
        const originalBoard = deepCopy(board);
        const originalScore = score;

        for (const direction of [UP, DOWN, LEFT, RIGHT]) {
            board = deepCopy(originalBoard);
            score = originalScore;
            let boardBefore = deepCopy(board);
             let moved = false;
              switch (direction) {
                case LEFT: moved = moveLeft(); break;
                case RIGHT: moved = moveRight(); break;
                case UP: moved = moveUp(); break;
                case DOWN: moved = moveDown(); break;
             }
             let boardChanged = JSON.stringify(boardBefore) !== JSON.stringify(board);

            if (boardChanged) {
                let currentScoreValue = 0; // Renamed to avoid conflict with global score
                for(const stratName of strategyOrder) {
                    const strat = combinedBotStrategies[stratName];
                    if (strat.active) {
                        currentScoreValue += strat.weight * strat.func(board);
                    }
                }

                if (currentScoreValue > bestScore) {
                    bestScore = currentScoreValue;
                    bestMove = direction;
                }
            }
        }

         board = originalBoard;
         score = originalScore;
        return bestMove || botRandomMove();
    }

    // --- Bot Execution ---
    function executeBotMove() {
        // <-- NEW: Check pause state -->
        if (isPaused) return;
        // <-- End Check -->

        if (!botMode || gameOver || performance.now() - lastBotMoveTime < botDelay) {
            return;
        }

        let chosenMove = null;
        switch (botAlgorithm) {
            case "random":       chosenMove = botRandomMove(); break;
            case "greedy":       chosenMove = botGreedyMove(); break;
            case "heuristic":    chosenMove = botHeuristicMove(); break;
            case "remove_small": chosenMove = botRemoveSmallMove(); break;
            case "combined":     chosenMove = botCombinedMove(); break;
            default:             chosenMove = botRandomMove(); break;
        }

        if (chosenMove) {
            console.log(`Bot (${botAlgorithm}) moving: ${chosenMove}`);
            move(chosenMove); // Handles history, UI updates, drawing internally now
            // drawGame(); // drawGame is called within updateUI -> drawHistoryPanel -> ... No, move calls updateUI which calls drawHistoryPanel. Let's call drawGame explicitly after move if needed.
             drawGame(); // Let's keep this explicit call for clarity after bot move.
        } else if (!canMoveCheck()) {
            gameOver = true;
             console.log("Bot found no valid moves. Game Over!");
             updateUI();
        }
        lastBotMoveTime = performance.now();
    }

    // --- Event Listeners ---
    document.addEventListener('keydown', (e) => {
        if (!botMode && !gameOver) {
             let direction = null;
             switch (e.key) {
                 case 'ArrowUp':    direction = UP; break;
                 case 'ArrowDown':  direction = DOWN; break;
                 case 'ArrowLeft':  direction = LEFT; break;
                 case 'ArrowRight': direction = RIGHT; break;
             }
             if (direction) {
                 e.preventDefault();
                 if(move(direction)) {
                     drawGame(); // Draw after successful manual move
                 };
             }
        }

        // Global controls
        switch (e.key.toLowerCase()) {
            case 'r':
                 e.preventDefault();
                 resetGame();
                 break;
            case 'b':
                 e.preventDefault();
                 botMode = !botMode;
                 lastBotMoveTime = performance.now();
                 if (!botMode) { // <-- NEW: Reset pause if turning bot OFF
                    isPaused = false;
                 }
                 console.log(`Bot Mode: ${botMode}`);
                 updateUI();
                 break;
            case 'a':
                 e.preventDefault();
                 currentAlgorithmIndex = (currentAlgorithmIndex + 1) % botAlgorithms.length;
                 botAlgorithm = botAlgorithms[currentAlgorithmIndex];
                 console.log(`Bot Algorithm: ${botAlgorithm}`);
                 updateUI();
                 break;
             case 'h':
                 e.preventDefault();
                 showHistoryPanel = !showHistoryPanel;
                 if(showHistoryPanel) { // If showing, ensure scroll is potentially recalculated/redrawn
                     drawHistoryPanel(); // Explicit redraw when shown
                 }
                 updateUI();
                 break;
             case 'u':
                  e.preventDefault();
                 if (history.length > 1) {
                      if(selectedHistoryIndex > 0) {
                         selectedHistoryIndex--;
                          const prevState = deepCopy(history[selectedHistoryIndex]);
                          board = prevState.board;
                          score = prevState.score;
                          gameOver = prevState.gameOver;
                          branchPoint = null; // Reset branching concept when going back
                          console.log(`Undo: Reverted to history state ${selectedHistoryIndex}`);
                          updateUI();
                          drawGame();
                      } else {
                          console.log("Already at the beginning of history.");
                      }
                 } else {
                     console.log("Cannot undo further.");
                 }
                 break;
             // <-- NEW: Pause toggle -->
             case 'p':
                 e.preventDefault();
                 if (botMode) { // Only allow pausing if bot is active
                     isPaused = !isPaused;
                     console.log(`Bot Paused: ${isPaused}`);
                     updateUI(); // Update status text
                 } else {
                     console.log("Pause only affects Bot mode.");
                 }
                 break;
             // <-- End Pause Toggle -->
        }

        // Combined strategy toggles (1-5)
        if (e.key in strategyKeyMapping) {
             e.preventDefault();
             const stratName = strategyKeyMapping[e.key];
             if (combinedBotStrategies[stratName]) {
                 combinedBotStrategies[stratName].active = !combinedBotStrategies[stratName].active;
                 if (combinedBotStrategies[stratName].active) {
                     if (!strategyOrder.includes(stratName)) {
                         strategyOrder.push(stratName);
                     }
                 } else {
                      strategyOrder = strategyOrder.filter(s => s !== stratName);
                 }
                 console.log(`Strategy '${stratName}' toggled ${combinedBotStrategies[stratName].active ? 'ON' : 'OFF'}. Order: ${strategyOrder.join(', ')}`);
                 updateUI();
             }
        }
    });

    // --- Game Loop ---
    function gameLoop() {
        executeBotMove(); // Will check botMode and isPaused internally
        requestAnimationFrame(gameLoop);
    }

    // --- Initialization ---
    resetGame(); // Initial setup (calls updateUI, drawGame, scrollToHistoryBottom)
    gameLoop(); // Start the loop
});
