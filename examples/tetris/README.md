# Tetris Game

A modern, responsive Tetris game built with HTML, CSS, and JavaScript. Features include:

## Features

- Classic Tetris gameplay with all 7 tetromino shapes
- Next piece preview
- Score tracking with levels and lines cleared
- Local storage-based leaderboard
- Responsive design for both PC and mobile devices
- Modern UI with gradient backgrounds and glass-morphism effects
- Smooth animations and transitions
- Keyboard controls for desktop play
- Touch-friendly interface for mobile devices

## Controls

- **Left Arrow** ← : Move piece left
- **Right Arrow** → : Move piece right
- **Down Arrow** ↓ : Soft drop (move down faster)
- **Up Arrow** ↑ : Rotate piece
- **Space** : Hard drop (instantly drop piece)
- **P** : Pause/resume game

## How to Play

1. Click the START button to begin playing
2. Arrange falling tetrominoes to complete horizontal lines
3. Each completed line will earn you points
4. The game speeds up as you level up
5. The game ends when blocks stack up to the top of the board

## Scoring System

- 1 line cleared: 40 × level points
- 2 lines cleared: 100 × level points
- 3 lines cleared: 300 × level points
- 4 lines cleared (Tetris): 1200 × level points

Level increases every 10 lines cleared, making the game progressively faster.

## Leaderboard

After each game over, you can submit your score to the local leaderboard. The top 10 scores are saved in your browser's local storage.

## Technical Details

- Uses HTML5 Canvas for rendering
- Pure JavaScript with ES6 classes
- Responsive CSS with media queries for mobile support
- Local storage for saving leaderboard data
- Event listeners for keyboard and button interactions

## Files Structure

```
examples/tetris/
├── index.html      # Main HTML structure
├── style.css       # Styling and responsive design
├── script.js       # Game logic implementation
└── README.md       # This file
```

## Browser Compatibility

The game works on all modern browsers that support HTML5 Canvas and ES6 JavaScript features.