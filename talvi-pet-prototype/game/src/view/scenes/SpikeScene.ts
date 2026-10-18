import Phaser from 'phaser';
import { createKeyboard } from '@app/input/keyboard';
import { spike, tickSpike, swapScene, door } from '@app/spikeController';
import { log } from '@app/log';
import { AvatarSprite } from '../objects/AvatarSprite';
import { Joystick } from '../objects/Joystick';
import { drawAlignment } from '../spikeDiagnostics';
/** Disposable common scene harness, removed when WORK-014 integrates sim/store. */
export abstract class SpikeScene extends Phaser.Scene {
  avatar!: AvatarSprite;
  joystick!: Joystick;
  keyboard!: ReturnType<typeof createKeyboard>;
  abstract drawWorld(): void;
  create(): void {
    this.drawWorld();
    this.add.rectangle(door.x, door.y, door.w, door.h, 0xe4b968, 0.25).setOrigin(0).setStrokeStyle(3, 0x8d6748).setDepth(1);
    this.add.text(door.x + 50, door.y - 28, 'Door', { fontFamily: 'Nunito', fontSize: '26px', color: '#503d2d' }).setOrigin(0.5).setDepth(1500);
    this.avatar = new AvatarSprite(this, spike.state.avatar.x, spike.state.avatar.y);
    this.joystick = new Joystick(this); this.keyboard = createKeyboard();
    this.add.text(960, 170, '❤️ 🙂 💢 😴 🎵 ❓ ⭐ 🎁 ✨', { fontFamily: 'Apple Color Emoji, Noto Color Emoji, sans-serif', fontSize: '42px' }).setOrigin(0.5).setDepth(1500);
    this.cameras.main.setScroll(0, (1080 - this.scale.gameSize.height) / 2);
    spike.fading = true; this.cameras.main.fadeIn(250);
    this.cameras.main.once('camerafadeincomplete', () => { spike.fading = false; });
    this.events.once('shutdown', () => this.keyboard.destroy());
    if (import.meta.env.DEV) drawAlignment(this);
    log('scene.ready', { scene: this.scene.key });
  }
  update(_time: number, delta: number): void {
    const move = this.joystick.active ? this.joystick.vector : this.keyboard.vector();
    const enteredDoor = tickSpike(move, delta);
    this.avatar.sync(spike.state.avatar);
    if (enteredDoor) {
      spike.fading = true; this.joystick.release(); this.cameras.main.fadeOut(250);
      this.cameras.main.once('camerafadeoutcomplete', () => { swapScene(); this.scene.start(spike.state.scene); });
    }
  }
}
