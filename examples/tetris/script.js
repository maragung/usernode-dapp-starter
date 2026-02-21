// Tetris game implementation
class TetrisGame {
    constructor() {
        // Canvas setup
        this.canvas = document.getElementById('board');
        this.ctx = this.canvas.getContext('2d');
        this.nextCanvas = document.getElementById('next-piece');
        this.nextCtx = this.nextCanvas.getContext('2d');
        
        // Game constants
        this.BOARD_WIDTH = 10;
        this.BOARD_HEIGHT = 20;
        this.BLOCK_SIZE = 30;
        
        // Game state
        this.board = this.createBoard();
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.gameRunning = false;
        this.gameOver = false;
        this.dropCounter = 0;
        this.dropInterval = 1000; // ms
        this.lastTime = 0;
        
        // Current piece
        this.currentPiece = null;
        this.nextPiece = null;
        
        // Initialize game elements
        this.initEventListeners();
        this.resetGame();
        this.loadLeaderboard();
    }
    
    createBoard() {
        return Array.from(Array(this.BOARD_HEIGHT), () => Array(this.BOARD_WIDTH).fill(0));
    }
    
    initEventListeners() {
        // Button event listeners
        document.getElementById('start-btn').addEventListener('click', () => this.start());
        document.getElementById('pause-btn').addEventListener('click', () => this.togglePause());
        document.getElementById('reset-btn').addEventListener('click', () => this.resetGame());
        
        // Modal event listeners
        document.getElementById('submit-score').addEventListener('click', () => this.submitScore());
        document.getElementById('close-modal').addEventListener('click', () => this.closeGameOverModal());
        document.getElementById('exit-confirm').addEventListener('click', () => this.exitGame());
        document.getElementById('exit-cancel').addEventListener('click', () => this.hideExitModal());
        
        // Keyboard controls
        document.addEventListener('keydown', (e) => this.handleKeyPress(e));
        
        // Window events
        window.addEventListener('beforeunload', (e) => {
            if (this.gameRunning && !this.gameOver) {
                e.preventDefault();
                e.returnValue = '';
                this.showExitModal();
                return '';
            }
        });
    }
    
    handleKeyPress(event) {
        if (!this.gameRunning || this.gameOver) return;
        
        switch(event.keyCode) {
            case 37: // Left arrow
                this.moveLeft();
                break;
            case 39: // Right arrow
                this.moveRight();
                break;
            case 40: // Down arrow
                this.moveDown();
                break;
            case 38: // Up arrow
                this.rotate();
                break;
            case 32: // Space
                this.hardDrop();
                break;
            case 80: // P key
                this.togglePause();
                break;
        }
    }
    
    start() {
        if (!this.gameRunning) {
            this.gameRunning = true;
            this.gameOver = false;
            this.lastTime = 0;
            this.animate();
        }
    }
    
    togglePause() {
        this.gameRunning = !this.gameRunning;
        if (this.gameRunning) {
            this.animate();
        }
    }
    
    resetGame() {
        this.board = this.createBoard();
        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.gameRunning = false;
        this.gameOver = false;
        this.dropInterval = 1000;
        
        // Update UI
        this.updateStats();
        
        // Generate new pieces
        this.nextPiece = this.getRandomPiece();
        this.spawnNewPiece();
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.nextCtx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
        
        // Draw next piece preview
        this.drawNextPiece();
    }
    
    getRandomPiece() {
        const pieces = [
            { shape: [[1, 1, 1, 1]], color: '#00f0f0', className: 'i-block' }, // I
            { shape: [[1, 0, 0], [1, 1, 1]], color: '#0000f0', className: 'j-block' }, // J
            { shape: [[0, 0, 1], [1, 1, 1]], color: '#f0a000', className: 'l-block' }, // L
            { shape: [[1, 1], [1, 1]], color: '#f0f000', className: 'o-block' }, // O
            { shape: [[0, 1, 1], [1, 1, 0]], color: '#00f000', className: 's-block' }, // S
            { shape: [[0, 1, 0], [1, 1, 1]], color: '#a000f0', className: 't-block' }, // T
            { shape: [[1, 1, 0], [0, 1, 1]], color: '#f00000', className: 'z-block' }  // Z
        ];
        
        const piece = pieces[Math.floor(Math.random() * pieces.length)];
        return {
            shape: piece.shape,
            color: piece.color,
            className: piece.className,
            x: Math.floor(this.BOARD_WIDTH / 2) - Math.floor(piece.shape[0].length / 2),
            y: 0
        };
    }
    
    spawnNewPiece() {
        this.currentPiece = this.nextPiece;
        this.nextPiece = this.getRandomPiece();
        this.drawNextPiece();
        
        // Check if game over
        if (this.checkCollision()) {
            this.gameOver = true;
            this.gameRunning = false;
            this.showGameOverModal();
        }
    }
    
    drawNextPiece() {
        this.nextCtx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
        
        if (this.nextPiece) {
            const blockSize = 25;
            const offsetX = (this.nextCanvas.width - this.nextPiece.shape[0].length * blockSize) / 2;
            const offsetY = (this.nextCanvas.height - this.nextPiece.shape.length * blockSize) / 2;
            
            this.nextPiece.shape.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value) {
                        this.nextCtx.fillStyle = this.nextPiece.color;
                        this.nextCtx.fillRect(
                            offsetX + x * blockSize,
                            offsetY + y * blockSize,
                            blockSize - 1,
                            blockSize - 1
                        );
                        
                        this.nextCtx.strokeStyle = '#000';
                        this.nextCtx.strokeRect(
                            offsetX + x * blockSize,
                            offsetY + y * blockSize,
                            blockSize - 1,
                            blockSize - 1
                        );
                    }
                });
            });
        }
    }
    
    moveLeft() {
        this.currentPiece.x--;
        if (this.checkCollision()) {
            this.currentPiece.x++;
        } else {
            this.draw();
        }
    }
    
    moveRight() {
        this.currentPiece.x++;
        if (this.checkCollision()) {
            this.currentPiece.x--;
        } else {
            this.draw();
        }
    }
    
    moveDown() {
        this.currentPiece.y++;
        if (this.checkCollision()) {
            this.currentPiece.y--;
            this.lockPiece();
            this.clearLines();
            this.spawnNewPiece();
        }
        this.dropCounter = 0;
        this.draw();
    }
    
    hardDrop() {
        while (!this.checkCollision(0, 1)) {
            this.currentPiece.y++;
        }
        this.lockPiece();
        this.clearLines();
        this.spawnNewPiece();
        this.draw();
    }
    
    rotate() {
        const originalShape = this.currentPiece.shape;
        // Transpose matrix
        const rows = originalShape.length;
        const cols = originalShape[0].length;
        
        const rotated = [];
        for (let c = 0; c < cols; c++) {
            const newRow = [];
            for (let r = rows - 1; r >= 0; r--) {
                newRow.push(originalShape[r][c]);
            }
            rotated.push(newRow);
        }
        
        this.currentPiece.shape = rotated;
        
        if (this.checkCollision()) {
            // If rotation causes collision, revert
            this.currentPiece.shape = originalShape;
        } else {
            this.draw();
        }
    }
    
    checkCollision(offsetX = 0, offsetY = 0) {
        for (let y = 0; y < this.currentPiece.shape.length; y++) {
            for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
                if (this.currentPiece.shape[y][x]) {
                    const newX = this.currentPiece.x + x + offsetX;
                    const newY = this.currentPiece.y + y + offsetY;
                    
                    if (
                        newX < 0 ||
                        newX >= this.BOARD_WIDTH ||
                        newY >= this.BOARD_HEIGHT ||
                        (newY >= 0 && this.board[newY][newX])
                    ) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    
    lockPiece() {
        for (let y = 0; y < this.currentPiece.shape.length; y++) {
            for (let x = 0; x < this.currentPiece.shape[y].length; x++) {
                if (this.currentPiece.shape[y][x]) {
                    const boardY = this.currentPiece.y + y;
                    if (boardY >= 0) { // Only lock if it's visible on the board
                        this.board[boardY][this.currentPiece.x + x] = this.currentPiece.color;
                    }
                }
            }
        }
    }
    
    clearLines() {
        let linesCleared = 0;
        
        for (let y = this.BOARD_HEIGHT - 1; y >= 0; y--) {
            if (this.board[y].every(cell => cell !== 0)) {
                // Remove the line
                this.board.splice(y, 1);
                // Add new empty line at the top
                this.board.unshift(Array(this.BOARD_WIDTH).fill(0));
                linesCleared++;
                y++; // Recheck the same index because we removed a line
            }
        }
        
        if (linesCleared > 0) {
            // Update score based on lines cleared
            const points = [40, 100, 300, 1200]; // Points for 1, 2, 3, 4 lines
            this.score += points[linesCleared - 1] * this.level;
            this.lines += linesCleared;
            
            // Level up every 10 lines
            this.level = Math.floor(this.lines / 10) + 1;
            
            // Increase speed with level
            this.dropInterval = Math.max(100, 1000 - (this.level - 1) * 100);
            
            this.updateStats();
        }
    }
    
    updateStats() {
        document.getElementById('score').textContent = this.score;
        document.getElementById('level').textContent = this.level;
        document.getElementById('lines').textContent = this.lines;
    }
    
    draw() {
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw the board
        for (let y = 0; y < this.BOARD_HEIGHT; y++) {
            for (let x = 0; x < this.BOARD_WIDTH; x++) {
                if (this.board[y][x]) {
                    this.ctx.fillStyle = this.board[y][x];
                    this.ctx.fillRect(
                        x * this.BLOCK_SIZE,
                        y * this.BLOCK_SIZE,
                        this.BLOCK_SIZE - 1,
                        this.BLOCK_SIZE - 1
                    );
                    
                    this.ctx.strokeStyle = '#000';
                    this.ctx.strokeRect(
                        x * this.BLOCK_SIZE,
                        y * this.BLOCK_SIZE,
                        this.BLOCK_SIZE - 1,
                        this.BLOCK_SIZE - 1
                    );
                }
            }
        }
        
        // Draw the current piece
        if (this.currentPiece) {
            this.currentPiece.shape.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value) {
                        this.ctx.fillStyle = this.currentPiece.color;
                        this.ctx.fillRect(
                            (this.currentPiece.x + x) * this.BLOCK_SIZE,
                            (this.currentPiece.y + y) * this.BLOCK_SIZE,
                            this.BLOCK_SIZE - 1,
                            this.BLOCK_SIZE - 1
                        );
                        
                        this.ctx.strokeStyle = '#000';
                        this.ctx.strokeRect(
                            (this.currentPiece.x + x) * this.BLOCK_SIZE,
                            (this.currentPiece.y + y) * this.BLOCK_SIZE,
                            this.BLOCK_SIZE - 1,
                            this.BLOCK_SIZE - 1
                        );
                    }
                });
            });
        }
    }
    
    animate(time = 0) {
        if (!this.gameRunning) return;
        
        const deltaTime = time - this.lastTime;
        this.lastTime = time;
        
        this.dropCounter += deltaTime;
        if (this.dropCounter > this.dropInterval) {
            this.moveDown();
        }
        
        this.draw();
        requestAnimationFrame((time) => this.animate(time));
    }
    
    showGameOverModal() {
        document.getElementById('final-score').textContent = this.score;
        document.getElementById('game-over-modal').classList.add('active');
    }
    
    closeGameOverModal() {
        document.getElementById('game-over-modal').classList.remove('active');
    }
    
    submitScore() {
        const playerName = document.getElementById('player-name').value.trim();
        
        if (!playerName) {
            alert('Please enter your name!');
            return;
        }
        
        // Save to localStorage
        const leaderboard = JSON.parse(localStorage.getItem('tetris-leaderboard') || '[]');
        leaderboard.push({ name: playerName, score: this.score, date: new Date().toISOString() });
        
        // Sort by score (descending)
        leaderboard.sort((a, b) => b.score - a.score);
        
        // Keep only top 10 scores
        const topScores = leaderboard.slice(0, 10);
        
        localStorage.setItem('tetris-leaderboard', JSON.stringify(topScores));
        
        this.loadLeaderboard();
        this.closeGameOverModal();
    }
    
    loadLeaderboard() {
        const leaderboard = JSON.parse(localStorage.getItem('tetris-leaderboard') || '[]');
        const listElement = document.getElementById('leaderboard-list');
        
        listElement.innerHTML = '';
        
        if (leaderboard.length === 0) {
            listElement.innerHTML = '<li>No scores yet</li>';
            return;
        }
        
        leaderboard.forEach((entry, index) => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <span>${index + 1}. ${entry.name}</span>
                <span>${entry.score}</span>
            `;
            listElement.appendChild(listItem);
        });
    }
    
    showExitModal() {
        document.getElementById('confirm-exit').classList.add('active');
    }
    
    hideExitModal() {
        document.getElementById('confirm-exit').classList.remove('active');
    }
    
    exitGame() {
        if (this.gameRunning && !this.gameOver) {
            // Submit score if player had a score
            if (this.score > 0) {
                this.showGameOverModal();
            }
        }
        this.hideExitModal();
        this.resetGame();
    }
}

// Initialize the game when the page loads
window.addEventListener('DOMContentLoaded', () => {
    const game = new TetrisGame();
    
    // Also make game accessible globally for debugging
    window.tetrisGame = game;
});