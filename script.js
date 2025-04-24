document.addEventListener('DOMContentLoaded', () => {
    // ----------------- Settings ------------------
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
    // Use structuredClone if available, otherwise fallback (basic JSON method)
    function deepCopy(obj) {
        if (typeof structuredClone === 'function') {
            return structuredClone(obj);
        } else {
            // Basic fallback, works for simple data like the game state
            try {
                return JSON.parse(JSON.stringify(obj));
            } catch (e) {
                console.error("Deep copy failed. Consider a more robust polyfill if needed.", e);
                // Fallback to shallow copy might cause bugs
                return { ...obj, board: obj.board ? obj.board.map(row => [...row]) : [] };
            }
        }
    }


    // --- Game Logic ---
    function resetGame() {
        board = Array(GRID_SIZE).fill(0).map(() => Array(GRID_SIZE).fill(0));
        score = 0;
        gameOver = false;
        addRandomTile();
        addRandomTile();
        history = [{ board: deepCopy(board), score: score, gameOver: gameOver }];
        selectedHistoryIndex = 0;
        branchPoint = null;
        historyScrollOffset = 0;
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
        let scoreBefore = score;
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
            // Check for game over only if a move resulted in a change
            if (!canMoveCheck()) {
                gameOver = true;
                console.log("Game Over!");
            }
            // Update history only if a move was made and the game isn't actively on an old history state
             if (selectedHistoryIndex === history.length - 1) {
                 // If we were at the latest state, just append
                 history.push({ board: deepCopy(board), score: score, gameOver: gameOver });
                 selectedHistoryIndex++;
                 branchPoint = null; // New move from latest state cancels branching
             } else {
                 // If we moved from an older state, this creates a branch
                 branchPoint = selectedHistoryIndex + 1; // Mark the *new* move as the branch start
                 history = history.slice(0, selectedHistoryIndex + 1); // Truncate future history
                 history.push({ board: deepCopy(board), score: score, gameOver: gameOver });
                 selectedHistoryIndex = history.length - 1; // Select the new state
                 console.log(`Branched history at move ${branchPoint}`);
             }
             updateUI(); // Update score, status, history panel
        } else {
            // If no tiles moved, but the game might have ended (e.g., trying a move on a full, static board)
             if (!canMoveCheck()) {
                 gameOver = true;
                  console.log("Game Over! (No valid moves)");
                   // Update the last history state's game over status if necessary
                 if (history.length > 0) {
                     history[history.length - 1].gameOver = true;
                 }
                updateUI();
             }
        }


        return boardChanged; // Return if the board state actually changed
    }


    // --- Movement Helpers ---
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
                // i++; // Skip the next tile as it's now 0
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
                 if(board[r][c] !== result.row[r]) { // Check column change specifically
                    //changedOverall = true; //This isn't sufficient if only merge happened without position change
                 }
                board[r][c] = result.row[r];
            }
             changedOverall = changedOverall || result.changed; // Use the operateRow changed status
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
                 if(board[r][c] !== finalCol[r]) {
                    // changedOverall = true;
                 }
                board[r][c] = finalCol[r];
            }
             changedOverall = changedOverall || result.changed; // Use the operateRow changed status
        }
        return changedOverall;
    }

    // --- Drawing ---
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

    // Helper to draw rounded rectangles (basic version)
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
        statusLine1.textContent = `Mode: ${botMode ? 'Bot' : 'Manual'} | Algorithm: ${botAlgorithm}`;

        if (botAlgorithm === "combined") {
            const activeStrats = strategyOrder.filter(s => combinedBotStrategies[s].active);
            statusLine2.textContent = `Active: ${activeStrats.join(', ') || 'None'}`;
            statusLine3.textContent = `(Use 1-5 to toggle)`;
        } else {
             statusLine2.textContent = ''; // Clear extra lines if not combined mode
             statusLine3.textContent = '';
        }

        gameOverMessage.style.display = gameOver ? 'block' : 'none';

        if (showHistoryPanel) {
            drawHistoryPanel();
             historyPanel.classList.remove('hidden');
             container.style.gap = '20px'; // Restore gap when panel is shown
        } else {
            historyPanel.classList.add('hidden');
             container.style.gap = '0px'; // Remove gap when panel is hidden
        }

    }

    // --- History Panel Logic ---
    function getTopFourTiles(stateBoard) {
        const tiles = stateBoard.flat().filter(tile => tile !== 0);
        tiles.sort((a, b) => b - a); // Sort descending
        return tiles.slice(0, 4);
    }

    function drawHistoryPanel() {
        historyEntriesContainer.innerHTML = ''; // Clear previous entries
        const panelHeight = historyEntriesContainer.clientHeight; // Visible height
        const totalContentHeight = history.length * ENTRY_HEIGHT; // Total height needed

        historyMaxScroll = Math.max(0, totalContentHeight - panelHeight);
        historyScrollOffset = Math.max(0, Math.min(historyScrollOffset, historyMaxScroll));

        // Calculate visible entry range
        const firstVisibleIndex = Math.floor(historyScrollOffset / ENTRY_HEIGHT);
        const lastVisibleIndex = Math.ceil((historyScrollOffset + panelHeight) / ENTRY_HEIGHT);


        history.forEach((state, idx) => {
             // Only create DOM elements for potentially visible items + a buffer
             if (idx >= firstVisibleIndex - 5 && idx <= lastVisibleIndex + 5) {
                const entry = document.createElement('div');
                entry.classList.add('history-entry');
                const topTiles = getTopFourTiles(state.board);
                entry.textContent = `Move ${idx}: ${topTiles.join(', ')}`;
                entry.dataset.index = idx; // Store index for click handling

                if (idx === selectedHistoryIndex) {
                    entry.classList.add('selected');
                }
                 if (branchPoint !== null && idx === branchPoint) {
                    entry.classList.add('branch-point'); // Add visual marker for branch start
                 }

                // Position the entry based on scroll offset
                 entry.style.top = `${idx * ENTRY_HEIGHT - historyScrollOffset}px`;


                entry.addEventListener('click', () => {
                    selectedHistoryIndex = idx;
                    // Load state from history (use deep copy to prevent modifying history)
                    const selectedState = deepCopy(history[idx]);
                    board = selectedState.board;
                    score = selectedState.score;
                    gameOver = selectedState.gameOver; // Restore game over state too
                    console.log(`Selected history state ${idx}`);
                    updateUI(); // Update score display, status, and redraw history highlight
                    drawGame(); // Redraw board
                });
                 historyEntriesContainer.appendChild(entry);
            }
        });

        // Update scrollbar thumb
        if (historyMaxScroll > 0) {
            const thumbHeight = Math.max(20, (panelHeight / totalContentHeight) * panelHeight);
            const thumbY = (historyScrollOffset / historyMaxScroll) * (panelHeight - thumbHeight);
            scrollbarThumb.style.height = `${thumbHeight}px`;
            scrollbarThumb.style.top = `${thumbY}px`;
            scrollbarTrack.style.display = 'block';
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
    });

     document.addEventListener('mousemove', (e) => {
        if (!draggingScrollbar) return;
        const trackRect = scrollbarTrack.getBoundingClientRect();
        const panelRect = historyEntriesContainer.getBoundingClientRect(); // Use entries container for relative calc
        const thumbHeight = scrollbarThumb.offsetHeight;

         // Calculate new thumb Y relative to the track's top
         let newThumbY = e.clientY - trackRect.top - scrollbarDragOffsetY;

        // Clamp thumb position within the track
        newThumbY = Math.max(0, Math.min(newThumbY, trackRect.height - thumbHeight));

         // Calculate scroll offset based on thumb position
         if (trackRect.height - thumbHeight > 0) { // Avoid division by zero
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
        e.preventDefault(); // Prevent page scrolling
        const scrollAmount = 30; // Pixels per wheel step
        historyScrollOffset += e.deltaY > 0 ? scrollAmount : -scrollAmount;
        historyScrollOffset = Math.max(0, Math.min(historyScrollOffset, historyMaxScroll));
        drawHistoryPanel();
    });

    // --- Bot Logic ---

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
             // Simple distance heuristic (Manhattan distance)
             // We want the max tile in a corner, so reward proximity
             // Also weight by the max tile value itself?
             let dist = Math.abs(corner.r - pos.r) + Math.abs(corner.c - pos.c);
             let cornerScore = (GRID_SIZE * 2 - dist) * (value || 1); // Reward proximity and value
             bestCornerScore = Math.max(bestCornerScore, cornerScore);
        }
         // Additional check: Is the max value *actually* in a corner? Big bonus.
        if (corners.some(c => c.r === pos.r && c.c === pos.c)) {
            bestCornerScore += value * 2; // Extra points for being in the corner
        }

        return bestCornerScore;
    }

    function evalMonotonicity(currentBoard) {
        let score = 0;
        // Check rows (left-to-right and right-to-left)
        for (let r = 0; r < GRID_SIZE; r++) {
            let current = 0; let next = current + 1; let diff = 0;
            while (next < GRID_SIZE) {
                 while (next < GRID_SIZE && currentBoard[r][next] === 0) next++;
                 if (next >= GRID_SIZE) break;
                 let currentVal = currentBoard[r][current] === 0 ? 0 : Math.log2(currentBoard[r][current]);
                 let nextVal = currentBoard[r][next] === 0 ? 0 : Math.log2(currentBoard[r][next]);
                 if (diff === 0) diff = nextVal - currentVal;
                 else if ((nextVal - currentVal) * diff < 0) { diff = -Infinity; break; } // Direction changed
                 current = next++;
             }
             if (diff !== -Infinity) score += Math.abs(diff); // Reward consistent direction
        }
         // Check columns (top-to-bottom and bottom-to-top) - Similar logic
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
                    // Check right neighbor
                    if (c < GRID_SIZE - 1 && currentBoard[r][c + 1] !== 0) {
                        smoothness -= Math.abs(value - Math.log2(currentBoard[r][c + 1]));
                    }
                     // Check down neighbor
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
        // We want to *minimize* small tiles, so return the negative count
        return -countSmallTiles(currentBoard, 8);
    }

     // Bot: Simple Heuristic (based on eval functions)
     function botHeuristicMove() {
         let bestMove = null;
         let bestValue = -Infinity;
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
                 // Evaluate the resulting board state
                 // Simple heuristic: combine empty cells and max tile value
                 let empty = evalEmpty(board);
                 let maxTileData = evalGetMaxTile(board);
                  // Normalize maxTile roughly, give more weight to empty cells initially
                 let value = empty * 2 + (maxTileData.value > 0 ? Math.log2(maxTileData.value) : 0);
                 if (value > bestValue) {
                     bestValue = value;
                     bestMove = direction;
                 }
             }
         }
          // Restore original state
         board = originalBoard;
         score = originalScore;
         return bestMove || botRandomMove(); // Fallback
     }

      // Bot: Remove Small Tiles Focus
     function botRemoveSmallMove() {
         let bestMove = null;
         let bestSmallCount = Infinity; // Minimize small tiles
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
                 let smallCount = countSmallTiles(board, 8); // Count tiles < 8
                 if (smallCount < bestSmallCount) {
                     bestSmallCount = smallCount;
                     bestMove = direction;
                 }
             }
         }
         // Restore original state
         board = originalBoard;
         score = originalScore;
         return bestMove || botRandomMove(); // Fallback
     }

    // Bot: Combined Heuristics
    function botCombinedMove() {
        let bestMove = null;
        let bestScore = -Infinity;
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
                let currentScore = 0;
                // Use the defined strategy order implicitly via the object keys if needed,
                // but better to iterate through the explicitly ordered/active list
                for(const stratName of strategyOrder) {
                    const strat = combinedBotStrategies[stratName];
                    if (strat.active) {
                         // Evaluate the board *after* the move
                        currentScore += strat.weight * strat.func(board);
                    }
                }

                 // Add current game score as a factor too?
                 // currentScore += score / 10; // Optional: value score directly


                if (currentScore > bestScore) {
                    bestScore = currentScore;
                    bestMove = direction;
                }
            }
        }

         // Restore original state
        board = originalBoard;
        score = originalScore;
        return bestMove || botRandomMove(); // Fallback if no move seems better
    }

    // --- Bot Execution ---
    function executeBotMove() {
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
            // Add cases for expectimax, mcts if implemented
            default:             chosenMove = botRandomMove(); break;
        }

        if (chosenMove) {
            console.log(`Bot (${botAlgorithm}) moving: ${chosenMove}`);
            move(chosenMove); // This function handles history and UI updates
            drawGame();
        } else if (!canMoveCheck()) {
            gameOver = true;
             console.log("Bot found no valid moves. Game Over!");
             updateUI(); // Ensure game over message shows
        }
        lastBotMoveTime = performance.now();
    }

    // --- Event Listeners ---
    document.addEventListener('keydown', (e) => {
        if (!botMode && !gameOver) { // Only allow manual moves if not bot mode and game not over
             let direction = null;
             switch (e.key) {
                 case 'ArrowUp':    direction = UP; break;
                 case 'ArrowDown':  direction = DOWN; break;
                 case 'ArrowLeft':  direction = LEFT; break;
                 case 'ArrowRight': direction = RIGHT; break;
             }
             if (direction) {
                 e.preventDefault(); // Prevent page scrolling
                 if(move(direction)) { // move() returns true if board changed
                     drawGame();
                 };
             }
        }

        // Global controls
        switch (e.key.toLowerCase()) {
            case 'r': // Reset
                 e.preventDefault();
                 resetGame();
                 break;
            case 'b': // Toggle Bot mode
                 e.preventDefault();
                 botMode = !botMode;
                 lastBotMoveTime = performance.now(); // Reset timer when toggling
                 console.log(`Bot Mode: ${botMode}`);
                 updateUI();
                 break;
            case 'a': // Change Algorithm
                 e.preventDefault();
                 currentAlgorithmIndex = (currentAlgorithmIndex + 1) % botAlgorithms.length;
                 botAlgorithm = botAlgorithms[currentAlgorithmIndex];
                 console.log(`Bot Algorithm: ${botAlgorithm}`);
                 updateUI();
                 break;
             case 'h': // Toggle History Panel
                 e.preventDefault();
                 showHistoryPanel = !showHistoryPanel;
                 updateUI(); // This function now handles showing/hiding the panel
                 break;
             case 'u': // Undo (only works manually after game over in original logic, keep?)
                 // Simple undo: Go back one step in history (if available)
                  e.preventDefault();
                 if (history.length > 1) {
                      // If currently selected is not the last, just select previous
                      if(selectedHistoryIndex > 0) {
                         selectedHistoryIndex--;
                      } else {
                         // If already at the first, can't go back further
                          console.log("Already at the beginning of history.");
                          return;
                      }

                     // If we were at the end, effectively pop the last state
                     // No, let's just allow selecting previous state always.
                     // history.pop(); // Remove last state if we were at the end? Maybe not needed.

                     const prevState = deepCopy(history[selectedHistoryIndex]);
                     board = prevState.board;
                     score = prevState.score;
                     gameOver = prevState.gameOver; // Restore game over state from that point
                     branchPoint = null; // Undoing cancels the concept of a future branch point from here
                     console.log(`Undo: Reverted to history state ${selectedHistoryIndex}`);
                     updateUI();
                     drawGame();
                 } else {
                     console.log("Cannot undo further.");
                 }
                 break;
        }

        // Combined strategy toggles (1-5)
        if (e.key in strategyKeyMapping) {
             e.preventDefault();
             const stratName = strategyKeyMapping[e.key];
             if (combinedBotStrategies[stratName]) {
                 combinedBotStrategies[stratName].active = !combinedBotStrategies[stratName].active;
                 // Update strategy order
                 if (combinedBotStrategies[stratName].active) {
                     if (!strategyOrder.includes(stratName)) {
                         strategyOrder.push(stratName); // Add to end if reactivated
                     }
                 } else {
                      strategyOrder = strategyOrder.filter(s => s !== stratName); // Remove if deactivated
                 }
                 console.log(`Strategy '${stratName}' toggled ${combinedBotStrategies[stratName].active ? 'ON' : 'OFF'}. Order: ${strategyOrder.join(', ')}`);
                 updateUI();
             }
        }
    });

    // --- Game Loop ---
    function gameLoop() {
        if (botMode) {
            executeBotMove();
        }
        // Drawing is now mainly event-driven (after moves)
        // But requestAnimationFrame is good practice for potential animations later
        requestAnimationFrame(gameLoop);
    }

    // --- Initialization ---
    resetGame(); // Initial setup
    gameLoop(); // Start the loop
});
