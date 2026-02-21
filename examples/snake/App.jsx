import { useState, useEffect } from 'react';
import WelcomeScreen from './screens/WelcomeScreen';
import ModeSelectScreen from './screens/ModeSelectScreen';
import PlayingScreen from './screens/PlayingScreen';
import GameOverScreen from './screens/GameOverScreen';
import './styles/App.css';

const SCREENS = {
  WELCOME: 'welcome',
  MODE_SELECT: 'mode-select',
  PLAYING: 'playing',
  GAME_OVER: 'game-over',
};

export default function App() {
  const [screen, setScreen] = useState(SCREENS.WELCOME);
  const [gameMode, setGameMode] = useState(null);
  const [lastScore, setLastScore] = useState(0);
  const [userAddress, setUserAddress] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const addr = localStorage.getItem('snake:user_address');
    if (addr) {
      setUserAddress(addr);
      setIsConnected(true);
    }
  }, []);

  const connectWallet = async () => {
    try {
      if (window.usernode?.getNodeAddress) {
        const addr = await window.usernode.getNodeAddress();
        setUserAddress(addr);
        setIsConnected(true);
        localStorage.setItem('snake:user_address', addr);
      } else {
        alert('Usernode wallet bridge not found. Please run in the Usernode app.');
      }
    } catch (err) {
      console.error('Wallet connection failed:', err);
      alert('Wallet connection failed. See console for details.');
    }
  };

  const handlePlay = (mode) => {
    setGameMode(mode);
    setScreen(SCREENS.PLAYING);
  };

  const handleGameOver = (score) => {
    setLastScore(score);
    setScreen(SCREENS.GAME_OVER);
  };

  const handlePlayAgain = () => {
    setScreen(SCREENS.PLAYING);
  };

  const handleBackToMenu = () => {
    setGameMode(null);
    setScreen(SCREENS.WELCOME);
  };

  const handleModeSelect = () => {
    setGameMode(null);
    setScreen(SCREENS.MODE_SELECT);
  };

  const renderScreen = () => {
    switch (screen) {
      case SCREENS.WELCOME:
        return <WelcomeScreen onPlay={handleModeSelect} />;
      case SCREENS.MODE_SELECT:
        return <ModeSelectScreen onSelectMode={handlePlay} onBack={handleBackToMenu} />;
      case SCREENS.PLAYING:
        return <PlayingScreen mode={gameMode} onGameOver={handleGameOver} onExit={handleModeSelect} userAddress={userAddress} />;
      case SCREENS.GAME_OVER:
        return (
          <GameOverScreen
            score={lastScore}
            mode={gameMode}
            onPlayAgain={handlePlayAgain}
            onModeSelect={handleModeSelect}
            onMenu={handleBackToMenu}
          />
        );
      default:
        return <WelcomeScreen onPlay={handleModeSelect} />;
    }
  };

  return (
    <div className="container">
      <header className="header">
        <div className="logo">🐍 Snake dApp</div>
        <div className="wallet-connector">
          {!isConnected ? (
            <button onClick={connectWallet} className="btn btn-primary">Connect Wallet</button>
          ) : (
            <div className="wallet-info">✓ Connected: ...{userAddress.slice(-6)}</div>
          )}
        </div>
      </header>
      <main className="content">{renderScreen()}</main>
    </div>
  );
}