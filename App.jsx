import { useState, useRef, useEffect, useCallback } from 'react'
import './styles/App.css'

// ============ CONSTANTS ============
const GRID_SIZE = 20
const GAME_LOOP_INTERVAL = 200
const CLASSIC_MODE = 'classic'
const RANKED_MODE = 'ranked'
const BATTLE_MODE = 'battle'

const RANKED_TIME_LIMITS = [30, 60, 90, 120, 180, 300, 600, 900, 1200, 1500, 1800]
const BATTLE_COLORS = [
  { name: 'Red', hex: '#ff6b6b' },
  { name: 'Yellow', hex: '#ffd93d' },
  { name: 'Green', hex: '#6bcf7f' },
  { name: 'Blue', hex: '#4d96ff' },
  { name: 'Purple', hex: '#c74ce6' },
]
const BATTLE_MAX_PLAYERS = 5
const BATTLE_INACTIVITY_TIMEOUT = 3 * 60 * 1000

const APP_PUBKEY = localStorage.getItem('snake:app_pubkey') || 
  'ut1zvhmxlhmv95cgzaph6cpv0rrcrn29gr4xkdj9fuykc6648hmvgksmkfua6'

const TX_SEND_OPTS = { timeoutMs: 90000, pollIntervalMs: 1500 }
const TX_PB_EXPECTED_S = 30
const TX_PB_WARN_S = 45
const TX_PB_ERR_S = 90

// ============ PROGRESS BAR HELPERS ============
let _pbRaf = null
let _pbStart = 0

function pbPercent(s) {
  if (s <= TX_PB_EXPECTED_S) {
    const t = s / TX_PB_EXPECTED_S
    return 95 * (1 - Math.pow(1 - t, 3))
  }
  return 95 + 5 * (1 - Math.exp(-(s - TX_PB_EXPECTED_S) / 120))
}

function pbApply(pct, s) {
  const el = document.getElementById('txProgress')
  if (!el) return
  const fill = el.querySelector('.tx-progress-fill')
  const label = el.querySelector('.tx-progress-label')
  if (fill) {
    fill.style.width = pct + '%'
    fill.className = 'tx-progress-fill' + (s >= TX_PB_ERR_S ? ' err' : s >= TX_PB_WARN_S ? ' warn' : '')
  }
  if (label) {
    if (s >= TX_PB_ERR_S) {
      label.textContent = 'Taking longer than expected; check Discord'
      label.className = 'tx-progress-label err'
    } else if (s >= TX_PB_WARN_S) {
      label.textContent = 'Taking longer than expected'
      label.className = 'tx-progress-label warn'
    } else {
      label.textContent = 'Submitting score...'
      label.className = 'tx-progress-label'
    }
  }
}

function startProgressBar() {
  const el = document.getElementById('txProgress')
  if (el) {
    el.classList.remove('hide')
    const f = el.querySelector('.tx-progress-fill')
    const l = el.querySelector('.tx-progress-label')
    if (f) {
      f.style.width = '0%'
      f.className = 'tx-progress-fill'
    }
    if (l) {
      l.textContent = 'Submitting score...'
      l.className = 'tx-progress-label'
    }
  }
  _pbStart = performance.now()
  (function tick() {
    const s = (performance.now() - _pbStart) / 1000
    pbApply(pbPercent(s), s)
    _pbRaf = requestAnimationFrame(tick)
  })()
}

function completeProgressBar() {
  if (_pbRaf) {
    cancelAnimationFrame(_pbRaf)
    _pbRaf = null
  }
  const el = document.getElementById('txProgress')
  if (!el) return
  const f = el.querySelector('.tx-progress-fill')
  const l = el.querySelector('.tx-progress-label')
  if (f) {
    f.className = 'tx-progress-fill ok'
    f.style.width = '100%'
  }
  if (l) {
    l.textContent = 'Score submitted!'
    l.className = 'tx-progress-label'
  }
  setTimeout(() => el.classList.add('hide'), 1200)
}

function stopProgressBar() {
  if (_pbRaf) {
    cancelAnimationFrame(_pbRaf)
    _pbRaf = null
  }
}

// ============ HELPER FUNCTIONS ============
function getMedalEmoji(rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return rank
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

// ============ MAIN APP COMPONENT ============
export default function App() {
  // Screen state
  const [screen, setScreen] = useState('welcome')
  const [gameMode, setGameMode] = useState(null)

  // Game state
  const [gameState, setGameState] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [score, setScore] = useState(0)
  const [speed, setSpeed] = useState(GAME_LOOP_INTERVAL)

  // Time
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [timeLimit, setTimeLimit] = useState(null)

  // Battle mode
  const [battlePlayers, setBattlePlayers] = useState(null)

  // Wallet & UI
  const [userAddress, setUserAddress] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [battleLeaderboard, setBattleLeaderboard] = useState([])
  const [activeTab, setActiveTab] = useState('ranked')
  const [submitting, setSubmitting] = useState(false)
  const [connected, setConnected] = useState(false)

  // Refs
  const canvasRef = useRef(null)
  const gameLoopRef = useRef(null)
  const timerRef = useRef(null)
  const battleInactivityRef = useRef({})
  const lastTapRef = useRef(0)

  // ============ INITIALIZATION ============
  useEffect(() => {
    const addr = localStorage.getItem('snake:user_address')
    if (addr) {
      setUserAddress(addr)
      setConnected(true)
    }

    // Fetch leaderboards
    fetchLeaderboards()
    const leaderboardInterval = setInterval(fetchLeaderboards, 5000)
    return () => clearInterval(leaderboardInterval)
  }, [])

  // ============ WALLET CONNECTION ============
  const connectWallet = async () => {
    try {
      if (window.usernode?.getNodeAddress) {
        const addr = await window.usernode.getNodeAddress()
        setUserAddress(addr)
        setConnected(true)
        localStorage.setItem('snake:user_address', addr)
      }
    } catch (err) {
      console.error('Wallet connection failed:', err)
    }
  }

  const disconnectWallet = () => {
    setUserAddress(null)
    setConnected(false)
    localStorage.removeItem('snake:user_address')
  }

  // ============ LEADERBOARD ============
  const fetchLeaderboards = async () => {
    try {
      const response = await fetch('/__snake/leaderboard')
      if (response.ok) {
        const data = await response.json()
        setLeaderboard(data.scores || [])
        setBattleLeaderboard(data.battleScores || [])
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err)
    }
  }

  // ============ GAME INITIALIZATION ============
  const initGame = () => {
    const initialSnake = [
      { x: 10, y: 10 },
      { x: 9, y: 10 },
      { x: 8, y: 10 },
    ]
    const food = {
      x: Math.floor(Math.random() * GRID_SIZE),
      y: Math.floor(Math.random() * GRID_SIZE),
    }
    setGameState({
      snake: initialSnake,
      food: food,
      direction: 'RIGHT',
      nextDirection: 'RIGHT',
    })
    setScore(0)
    setSpeed(GAME_LOOP_INTERVAL)
    setIsPaused(false)
  }

  const initBattleGame = () => {
    const players = []
    const positions = [[5, 5], [15, 5], [10, 10], [5, 15], [15, 15]]
    const numPlayers = 2 // Player vs 1 AI

    for (let i = 0; i < numPlayers; i++) {
      const [x, y] = positions[i]
      players.push({
        id: i,
        snake: [{ x, y }, { x: x - 1, y }, { x: x - 2, y }],
        direction: 'RIGHT',
        nextDirection: 'RIGHT',
        food: 0,
        alive: true,
        lastFoodTime: Date.now(),
        timeRemaining: RANKED_TIME_LIMITS[Math.floor(Math.random() * RANKED_TIME_LIMITS.length)],
      })
    }

    let food
    let valid = false
    while (!valid) {
      food = {
        x: Math.floor(Math.random() * GRID_SIZE),
        y: Math.floor(Math.random() * GRID_SIZE),
      }
      valid = !players.some((p) => p.snake.some((seg) => seg.x === food.x && seg.y === food.y))
    }

    setBattlePlayers(players)
    setScore(0)
    setGameState({ food })
    battleInactivityRef.current = {}
    players.forEach((p) => {
      battleInactivityRef.current[p.id] = Date.now()
    })
  }

  const startGame = (mode) => {
    // Ensure no previous game loops are running to prevent time collisions
    if (gameLoopRef.current) clearInterval(gameLoopRef.current)
    if (timerRef.current) clearInterval(timerRef.current)

    setGameMode(mode)
    if (mode === RANKED_MODE) {
      const limit = RANKED_TIME_LIMITS[Math.floor(Math.random() * RANKED_TIME_LIMITS.length)]
      setTimeLimit(limit)
      setTimeRemaining(limit)
      initGame()
    } else if (mode === BATTLE_MODE) {
      initBattleGame()
    } else {
      initGame()
    }
    setIsPlaying(true)
    setScreen('playing')
  }

  // ============ GAME LOOP (CLASSIC/RANKED) ============
  useEffect(() => {
    if (!isPlaying || !gameState || gameMode === BATTLE_MODE || isPaused) return

    const gameLoop = () => {
      setGameState((prev) => {
        let direction = prev.nextDirection
        
        // Prevent reversal
        if (
          (direction === 'UP' && prev.direction === 'DOWN') ||
          (direction === 'DOWN' && prev.direction === 'UP') ||
          (direction === 'LEFT' && prev.direction === 'RIGHT') ||
          (direction === 'RIGHT' && prev.direction === 'LEFT')
        ) {
          direction = prev.direction
        }

        const head = prev.snake[0]
        let newX = head.x
        let newY = head.y

        switch (direction) {
          case 'UP': newY -= 1; break
          case 'DOWN': newY += 1; break
          case 'LEFT': newX -= 1; break
          case 'RIGHT': newX += 1; break
          default: break
        }

        // Wrap around
        newX = (newX + GRID_SIZE) % GRID_SIZE
        newY = (newY + GRID_SIZE) % GRID_SIZE

        // Check self collision
        if (prev.snake.some((seg) => seg.x === newX && seg.y === newY)) {
          setIsPlaying(false)
          return prev
        }

        const newSnake = [{ x: newX, y: newY }, ...prev.snake]

        // Check food collision
        if (newX === prev.food.x && newY === prev.food.y) {
          setScore((s) => s + 10)
          setSpeed((s) => s / 1.0003)
          
          if (gameMode === RANKED_MODE && timeLimit) {
            setTimeRemaining((t) => t + Math.floor(timeLimit * 0.1))
          }
          
          let newFood
          do {
            newFood = {
              x: Math.floor(Math.random() * GRID_SIZE),
              y: Math.floor(Math.random() * GRID_SIZE),
            }
          } while (newSnake.some((seg) => seg.x === newFood.x && seg.y === newFood.y))

          return {
            ...prev,
            snake: newSnake,
            food: newFood,
            direction: direction,
          }
        }

        newSnake.pop()
        return {
          ...prev,
          snake: newSnake,
          direction: direction,
        }
      })
    }

    gameLoopRef.current = setInterval(gameLoop, speed)
    return () => clearInterval(gameLoopRef.current)
  }, [isPlaying, gameState, gameMode, isPaused, timeLimit, speed])

  // ============ BATTLE GAME LOOP ============
  useEffect(() => {
    if (!isPlaying || !battlePlayers || gameMode !== BATTLE_MODE || isPaused) return

    const gameLoop = () => {
      setBattlePlayers((players) => {
        if (!players) return players

        const updated = players.map((player) => {
          if (!player.alive) return player

          let direction = player.nextDirection || player.direction
          
          if (
            (direction === 'UP' && player.direction === 'DOWN') ||
            (direction === 'DOWN' && player.direction === 'UP') ||
            (direction === 'LEFT' && player.direction === 'RIGHT') ||
            (direction === 'RIGHT' && player.direction === 'LEFT')
          ) {
            direction = player.direction
          }

          const head = player.snake[0]
          let newX = head.x
          let newY = head.y

          switch (direction) {
            case 'UP': newY -= 1; break
            case 'DOWN': newY += 1; break
            case 'LEFT': newX -= 1; break
            case 'RIGHT': newX += 1; break
            default: break
          }

          newX = (newX + GRID_SIZE) % GRID_SIZE
          newY = (newY + GRID_SIZE) % GRID_SIZE

          if (player.snake.some((seg) => seg.x === newX && seg.y === newY)) {
            return { ...player, alive: false }
          }

          const newSnake = [{ x: newX, y: newY }, ...player.snake]

          const foodCollided = newX === gameState.food.x && newY === gameState.food.y

          if (foodCollided) {
            battleInactivityRef.current[player.id] = Date.now()
            return {
              ...player,
              snake: newSnake,
              food: player.food + 1,
              direction: direction,
              lastFoodTime: Date.now(),
            }
          }

          newSnake.pop()
          return {
            ...player,
            snake: newSnake,
            direction: direction,
          }
        })

        // Check inactivity
        const now = Date.now()
        updated.forEach((player) => {
          if (player.alive && now - battleInactivityRef.current[player.id] > BATTLE_INACTIVITY_TIMEOUT) {
            player.alive = false
          }
        })

        const stillAlive = updated.filter((p) => p.alive)
        if (stillAlive.length === 0 || stillAlive.length === 1) {
          endBattleGame(updated)
        }

        return updated
      })

      setGameState((prev) => {
        const allSnakeSegs = battlePlayers
          .filter((p) => p.alive)
          .flatMap((p) => p.snake)
        const valid = !allSnakeSegs.some((seg) => seg.x === prev.food.x && seg.y === prev.food.y)
        
        if (valid) return prev

        let newFood
        do {
          newFood = {
            x: Math.floor(Math.random() * GRID_SIZE),
            y: Math.floor(Math.random() * GRID_SIZE),
          }
        } while (allSnakeSegs.some((seg) => seg.x === newFood.x && seg.y === newFood.y))

        return { ...prev, food: newFood }
      })
    }

    gameLoopRef.current = setInterval(gameLoop, GAME_LOOP_INTERVAL)
    return () => clearInterval(gameLoopRef.current)
  }, [isPlaying, battlePlayers, gameMode, gameState, isPaused])

  // ============ TIMER (RANKED MODE) ============
  useEffect(() => {
    if (!isPlaying || gameMode !== RANKED_MODE || !timeLimit) return

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          setIsPlaying(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [isPlaying, gameMode, timeLimit])

  // ============ TIMER (BATTLE MODE) ============
  useEffect(() => {
    if (!isPlaying || gameMode !== BATTLE_MODE || !battlePlayers) return

    timerRef.current = setInterval(() => {
      setBattlePlayers((players) => {
        if (!players) return players
        const updated = players.map((p) => ({
          ...p,
          timeRemaining: Math.max(0, p.timeRemaining - 1),
          alive: p.alive && p.timeRemaining > 1,
        }))
        const stillAlive = updated.filter((p) => p.alive)
        if (stillAlive.length <= 1) {
          endBattleGame(updated)
        }
        return updated
      })
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [isPlaying, gameMode, battlePlayers])

  // ============ INPUT HANDLING ============
  useEffect(() => {
    if (!isPlaying || !gameState) return

    const handleKeyPress = (e) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space'].includes(e.code)) {
        return
      }

      e.preventDefault()

      if (e.code === 'Space') {
        setIsPaused((prev) => !prev)
        return
      }

      const directionMap = {
        ArrowUp: 'UP',
        ArrowDown: 'DOWN',
        ArrowLeft: 'LEFT',
        ArrowRight: 'RIGHT',
        KeyW: 'UP',
        KeyS: 'DOWN',
        KeyA: 'LEFT',
        KeyD: 'RIGHT',
      }

      const direction = directionMap[e.code]
      if (direction) {
        handleDirectionChange(direction)
      }
    }

    const handleCanvasDoubleTap = () => {
      const now = Date.now()
      if (now - lastTapRef.current < 300) {
        setIsPaused((prev) => !prev)
      }
      lastTapRef.current = now
    }

    document.addEventListener('keydown', handleKeyPress)
    canvasRef.current?.addEventListener('click', handleCanvasDoubleTap)

    return () => {
      document.removeEventListener('keydown', handleKeyPress)
      canvasRef.current?.removeEventListener('click', handleCanvasDoubleTap)
    }
  }, [isPlaying, gameState])

  const handleDirectionChange = useCallback((direction) => {
    if (!direction) return
    setGameState((prev) => {
      if (!prev) return prev
      return { ...prev, nextDirection: direction }
    })
  }, [])

  // ============ CANVAS RENDERING ============
  useEffect(() => {
    if (!canvasRef.current || !gameState) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const displayWidth = rect.width
    const displayHeight = rect.height
    const cellSize = displayWidth / GRID_SIZE

    // Background
    ctx.fillStyle = 'rgba(11, 15, 22, 0.3)'
    ctx.fillRect(0, 0, displayWidth, displayHeight)

    // Grid
    ctx.strokeStyle = 'rgba(106, 168, 254, 0.05)'
    ctx.lineWidth = 0.5
    for (let i = 0; i <= GRID_SIZE; i++) {
      const pos = i * cellSize
      ctx.beginPath()
      ctx.moveTo(pos, 0)
      ctx.lineTo(pos, displayHeight)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, pos)
      ctx.lineTo(displayWidth, pos)
      ctx.stroke()
    }

    // Draw snakes
    if (gameMode === BATTLE_MODE && battlePlayers) {
      battlePlayers.forEach((player) => {
        const color = BATTLE_COLORS[player.id]?.hex || '#6ea8fe'
        player.snake.forEach((segment, idx) => {
          const x = segment.x * cellSize
          const y = segment.y * cellSize
          if (idx === 0) {
            ctx.fillStyle = color
          } else {
            ctx.fillStyle = `${color}66`
          }
          ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2)
          if (idx === 0) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
            ctx.fillRect(x + 2, y + 2, cellSize / 3, cellSize / 3)
          }
        })
      })
    } else if (gameState?.snake) {
      gameState.snake.forEach((segment, idx) => {
        const x = segment.x * cellSize
        const y = segment.y * cellSize

        if (idx === 0) {
          const gradient = ctx.createLinearGradient(x, y, x + cellSize, y + cellSize)
          gradient.addColorStop(0, '#6EA8FE')
          gradient.addColorStop(1, '#A78BFA')
          ctx.fillStyle = gradient
        } else {
          const hue = (idx * 10) % 360
          ctx.fillStyle = `hsl(${140 + hue / 10}, 80%, 60%)`
        }

        ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2)

        if (idx === 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
          ctx.fillRect(x + 2, y + 2, cellSize / 3, cellSize / 3)
        }
      })
    }

    // Draw food
    const food = gameState?.food
    if (food) {
      const fx = food.x * cellSize
      const fy = food.y * cellSize
      const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 300)
      ctx.fillStyle = '#ff6b6b'
      ctx.beginPath()
      ctx.arc(fx + cellSize / 2, fy + cellSize / 2, (cellSize / 2) * pulse, 0, Math.PI * 2)
      ctx.fill()
    }

    // Pause overlay
    if (isPaused) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.fillRect(0, 0, displayWidth, displayHeight)
      ctx.fillStyle = '#ffffff'
      ctx.font = '24px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('PAUSED', displayWidth / 2, displayHeight / 2)
      ctx.font = '14px Arial'
      ctx.fillText('Press SPACE or double tap to resume', displayWidth / 2, displayHeight / 2 + 30)
    }
  }, [gameState, battlePlayers, gameMode, isPaused])

  // ============ GAME END HANDLERS ============
  const endGame = async () => {
    setIsPlaying(false)
    if (gameLoopRef.current) clearInterval(gameLoopRef.current)
    if (timerRef.current) clearInterval(timerRef.current)

    if (gameMode === RANKED_MODE) {
      await submitScore()
    } else {
      setScreen('game-over')
    }
  }

  const endBattleGame = async (finalPlayers) => {
    setIsPlaying(false)
    if (gameLoopRef.current) clearInterval(gameLoopRef.current)
    if (timerRef.current) clearInterval(timerRef.current)

    const player = finalPlayers.find((p) => p.id === 0)
    if (player) setScore(player.food)

    const winner = finalPlayers.find((p) => p.alive)
    if (winner && winner.id === 0) {
      await submitBattleScore(winner.food)
    }
    setScreen('game-over')
  }

  const submitScore = async () => {
    setSubmitting(true)
    startProgressBar()

    try {
      const username = localStorage.getItem('snake:username') || `user_${userAddress.slice(-6)}`
      const memo = JSON.stringify({
        app: 'snake',
        type: 'score_submission',
        score: score,
        mode: gameMode,
        timestamp: Date.now(),
        username: username,
      })

      if (memo.length > 1024) {
        throw new Error('Payload too large')
      }

      await window.usernode.sendTransaction(APP_PUBKEY, 1, memo, TX_SEND_OPTS)

      completeProgressBar()
      setTimeout(() => {
        setScreen('game-over')
        setSubmitting(false)
      }, 1500)
    } catch (err) {
      stopProgressBar()
      console.error('Failed to submit score:', err)
      setScreen('game-over')
      setSubmitting(false)
    }
  }

  const submitBattleScore = async (foodCount) => {
    setSubmitting(true)
    startProgressBar()

    try {
      const username = localStorage.getItem('snake:username') || `user_${userAddress.slice(-6)}`
      const memo = JSON.stringify({
        app: 'snake',
        type: 'battle_victory',
        food: foodCount,
        timestamp: Date.now(),
        username: username,
      })

      if (memo.length > 1024) {
        throw new Error('Payload too large')
      }

      await window.usernode.sendTransaction(APP_PUBKEY, 1, memo, TX_SEND_OPTS)

      completeProgressBar()
      setTimeout(() => {
        setSubmitting(false)
      }, 1500)
    } catch (err) {
      stopProgressBar()
      console.error('Failed to submit battle score:', err)
      setSubmitting(false)
    }
  }

  const handleExit = () => {
    setIsPlaying(false)
    if (gameLoopRef.current) clearInterval(gameLoopRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
    if (gameMode === BATTLE_MODE && battlePlayers) {
      const player = battlePlayers.find((p) => p.id === 0)
      if (player) setScore(player.food)
    }
    setScreen('game-over')
  }

  // ============ RENDER ============
  return (
    <div className="container">
      <header className="header">
        <div className="header-content">
          <div className="logo">🐍 Snake Game</div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {!connected ? (
              <button className="btn btn-secondary" onClick={connectWallet}>
                Connect Wallet
              </button>
            ) : (
              <>
                <div className="wallet-info">
                  <div className="wallet-address">
                    {userAddress.slice(0, 5)}...{userAddress.slice(-6)}
                  </div>
                </div>
                <button className="btn btn-secondary" onClick={disconnectWallet}>
                  Disconnect
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="content">
        {screen === 'welcome' && (
          <div className="screen welcome-screen">
            <div className="welcome-title">🐍 Snake Game</div>
            <div className="welcome-subtitle">Connect your wallet and compete on the leaderboard!</div>
            <button className="btn btn-primary" onClick={() => setScreen('mode-select')}>
              Play Now
            </button>
            <div style={{ marginTop: '20px', width: '100%' }}>
              <Leaderboard
                leaderboard={leaderboard}
                battleLeaderboard={battleLeaderboard}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              />
            </div>
          </div>
        )}

        {screen === 'mode-select' && (
          <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ marginBottom: '24px' }}>Select Game Mode</h2>
              <div className="game-modes">
                <div className="mode-card" onClick={() => startGame(CLASSIC_MODE)}>
                  <div className="mode-icon">🎮</div>
                  <div className="mode-title">Classic</div>
                  <div className="mode-description">No time limit, no score saved</div>
                </div>
                <div className="mode-card" onClick={() => startGame(RANKED_MODE)}>
                  <div className="mode-icon">🏆</div>
                  <div className="mode-title">Ranked</div>
                  <div className="mode-description">Random time, auto submit</div>
                </div>
                <div className="mode-card" onClick={() => startGame(BATTLE_MODE)}>
                  <div className="mode-icon">⚔️</div>
                  <div className="mode-title">Battle</div>
                  <div className="mode-description">5 Player Multiplayer</div>
                </div>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => setScreen('welcome')}
                style={{ marginTop: '24px' }}
              >
                Back
              </button>
            </div>
          </div>
        )}

        {screen === 'playing' && (
          <div className="screen game-container">
            <button className="exit-button" onClick={handleExit}>
              Exit
            </button>
            {gameMode === BATTLE_MODE ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '12px', flex: 1, minHeight: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, minHeight: 0 }}>
                    <canvas ref={canvasRef} id="gameCanvas" style={{ maxWidth: '100%' }}></canvas>
                  </div>
                  <div className="game-stats">
                    <div className="stat-box">
                      <div className="stat-label">Players Alive</div>
                      <div className="stat-value">{battlePlayers?.filter((p) => p.alive).length || 0}</div>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '100%', overflowY: 'auto' }}>
                  {battlePlayers?.map((player) => (
                    <div key={player.id} className="battle-panel">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <div
                          style={{
                            width: '12px',
                            height: '12px',
                            borderRadius: '2px',
                            background: BATTLE_COLORS[player.id]?.hex,
                          }}
                        ></div>
                        <div style={{ flex: 1, fontSize: '12px', fontWeight: 600 }}>P{player.id + 1}</div>
                        {!player.alive && <div style={{ fontSize: '10px', color: 'var(--danger)' }}>OUT</div>}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        Food: <span style={{ color: 'var(--ok)', fontWeight: 'bold' }}>{player.food}</span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--muted)' }}>
                        Time: <span style={{ color: 'var(--warning)' }}>{player.timeRemaining}s</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div style={{ textAlign: 'center' }}>
                  <h3>{gameMode === CLASSIC_MODE ? '🎮 Classic Mode' : '🏆 Ranked Mode'}</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', flex: 1, minHeight: 0 }}>
                  <canvas ref={canvasRef} id="gameCanvas" style={{ aspectRatio: '1/1', maxWidth: '600px', width: '100%' }}></canvas>
                  <div className="game-stats">
                    <div className="stat-box">
                      <div className="stat-label">Score</div>
                      <div className="stat-value">{score}</div>
                    </div>
                    {gameMode === RANKED_MODE && timeRemaining !== null && (
                      <div className="stat-box">
                        <div className="stat-label">Time Left</div>
                        <div className="stat-value">{formatTime(timeRemaining)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            <div id="txProgress" className="tx-progress hide">
              <div className="tx-progress-track">
                <div className="tx-progress-fill"></div>
              </div>
              <div className="tx-progress-label">Submitting...</div>
            </div>
          </div>
        )}

        {screen === 'game-over' && (
          <div className="screen game-over-screen">
            <div>
              <div className="game-over-title">Game Over!</div>
              <div style={{ marginTop: '16px', fontSize: '14px', color: 'var(--muted)' }}>
                {gameMode === CLASSIC_MODE
                  ? 'Classic Mode'
                  : gameMode === RANKED_MODE
                  ? 'Ranked Mode - Score Submitted!'
                  : 'Battle Mode'}
              </div>
            </div>
            <div className="game-over-score">{score}</div>
            <div style={{ marginBottom: '20px', width: '100%', maxHeight: '300px', overflowY: 'auto' }}>
              <Leaderboard
                leaderboard={leaderboard}
                battleLeaderboard={battleLeaderboard}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={() => startGame(gameMode)}
                disabled={submitting}
              >
                Play Again
              </button>
              <button className="btn btn-secondary" onClick={() => setScreen('mode-select')} disabled={submitting}>
                Different Mode
              </button>
              <button className="btn btn-secondary" onClick={() => setScreen('welcome')} disabled={submitting}>
                Menu
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============ LEADERBOARD COMPONENT ============
function Leaderboard({ leaderboard, battleLeaderboard, activeTab, setActiveTab }) {
  const displayBoard = activeTab === 'ranked' ? leaderboard : battleLeaderboard

  return (
    <div className="leaderboard-container">
      <div className="leaderboard-tabs">
        <button className={`tab-btn ${activeTab === 'ranked' ? 'active' : ''}`} onClick={() => setActiveTab('ranked')}>
          🏆 Ranked
        </button>
        <button className={`tab-btn ${activeTab === 'battle' ? 'active' : ''}`} onClick={() => setActiveTab('battle')}>
          ⚔️ Battle
        </button>
      </div>
      <div className="leaderboard-title">{activeTab === 'ranked' ? '📊 Top Ranked Scores' : '⚔️ Top Battle Winners'}</div>
      <div className="leaderboard-list">
        {displayBoard.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)' }}>No scores yet. Be the first!</div>
        ) : (
          displayBoard.map((entry, idx) => (
            <div key={idx} className="leaderboard-item">
              <div className={`leaderboard-rank rank-${idx + 1}`}>{getMedalEmoji(idx + 1)}</div>
              <div className="leaderboard-player">
                <div className="leaderboard-name">{entry.username || 'Anonymous'}</div>
                <div className="leaderboard-addr">{entry.address.slice(-8)}</div>
              </div>
              <div className="leaderboard-score">{entry.score}</div>
              <div className="leaderboard-time">{new Date(entry.timestamp).toLocaleDateString()}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
