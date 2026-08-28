import Phaser from "phaser";
import { BattleScene } from "./phaser/scenes/BattleScene";
import "./styles.css";

type GameWindow = Window & {
  __bsuFighterGame?: Phaser.Game;
};

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-root",
  // The battle always uses this fixed 16:9 coordinate space. The surrounding
  // game frame scales it uniformly, keeping camera framing and spawn positions
  // stable when a browser panel changes size.
  width: 960,
  height: 540,
  backgroundColor: "rgba(0, 0, 0, 0)",
  transparent: true,
  pixelArt: false,
  render: {
    // The battle canvas is often enlarged to fill a browser viewport. Keep cutout fighters crisp at that final scale.
    antialias: false,
    antialiasGL: false,
    roundPixels: true,
  },
  dom: {
    createContainer: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BattleScene],
};

const gameWindow = window as GameWindow;

if (gameWindow.__bsuFighterGame) {
  gameWindow.__bsuFighterGame.destroy(true);
}

gameWindow.__bsuFighterGame = new Phaser.Game(config);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    gameWindow.__bsuFighterGame?.destroy(true);
    gameWindow.__bsuFighterGame = undefined;
  });
}
