import Phaser from "phaser";

export type PlayerInput = {
  left: boolean;
  right: boolean;
  jump: boolean;
  punch: boolean;
  punch2: boolean;
  kick: boolean;
  special: boolean;
  block: boolean;
};

export const emptyInput = (): PlayerInput => ({
  left: false,
  right: false,
  jump: false,
  punch: false,
  punch2: false,
  kick: false,
  special: false,
  block: false,
});

export type KeyboardBindings = {
  p1: Record<Exclude<keyof PlayerInput, "punch2">, Phaser.Input.Keyboard.Key>;
  p2: Record<Exclude<keyof PlayerInput, "punch2">, Phaser.Input.Keyboard.Key>;
};

export function createKeyboardBindings(scene: Phaser.Scene): KeyboardBindings {
  const keyboard = scene.input.keyboard;

  if (!keyboard) {
    throw new Error("Keyboard input is not available in this browser.");
  }

  return {
    p1: {
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      jump: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      punch: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F),
      kick: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G),
      special: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H),
      block: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
    },
    p2: {
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      jump: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      punch: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K),
      kick: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L),
      special: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.O),
      block: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
    },
  };
}

export function readInput(keys: Record<Exclude<keyof PlayerInput, "punch2">, Phaser.Input.Keyboard.Key>): PlayerInput {
  return {
    left: keys.left.isDown,
    right: keys.right.isDown,
    jump: Phaser.Input.Keyboard.JustDown(keys.jump),
    punch: Phaser.Input.Keyboard.JustDown(keys.punch),
    punch2: false,
    kick: Phaser.Input.Keyboard.JustDown(keys.kick),
    special: Phaser.Input.Keyboard.JustDown(keys.special),
    block: keys.block.isDown,
  };
}
