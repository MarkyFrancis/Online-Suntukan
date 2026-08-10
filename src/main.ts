import Phaser from "phaser";
import { BattleScene } from "./phaser/scenes/BattleScene";
import "./styles.css";

type GameWindow = Window & {
  __bsuFighterGame?: Phaser.Game;
};

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-root",
  width: 960,
  height: 540,
  backgroundColor: "rgba(0, 0, 0, 0)",
  transparent: true,
  pixelArt: false,
  scale: {
    mode: Phaser.Scale.ENVELOP,
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
