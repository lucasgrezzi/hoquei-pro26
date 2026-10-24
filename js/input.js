'use strict';
// ===== Entrada: teclado e controles (Gamepad API) =====
const Keys = { down: new Set() };
window.addEventListener('keydown', e => {
  const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  if (!typing && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  Keys.down.add(e.code);
});
window.addEventListener('keyup', e => Keys.down.delete(e.code));
window.addEventListener('blur', () => Keys.down.clear());

const KB_LAYOUTS = {
  // 1 jogador: WASD ou setas
  solo: { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    sprint: ['ShiftLeft', 'ShiftRight'], pass: ['KeyJ', 'Space'], shoot: ['KeyK'], poke: ['KeyL'] },
  p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], sprint: ['ShiftLeft'], pass: ['KeyJ', 'Space'], shoot: ['KeyK'], poke: ['KeyL'] },
  p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], sprint: ['ShiftRight', 'Numpad0'],
    pass: ['Numpad1', 'Comma'], shoot: ['Numpad2', 'Period'], poke: ['Numpad3', 'Slash'] },
};

class Controller {
  constructor(layout, padIndex, color) {
    this.layout = KB_LAYOUTS[layout]; this.padIndex = padIndex; this.color = color;
    this.prev = { pass: false, shoot: false, poke: false, pause: false };
  }
  poll() {
    const L = this.layout, k = a => a.some(c => Keys.down.has(c));
    let mx = (k(L.right) ? 1 : 0) - (k(L.left) ? 1 : 0);
    let mz = (k(L.down) ? 1 : 0) - (k(L.up) ? 1 : 0);
    let sprint = k(L.sprint), pass = k(L.pass), shoot = k(L.shoot), poke = k(L.poke), pause = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = this.padIndex != null ? pads[this.padIndex] : null;
    if (gp && gp.connected) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.2) { mx = ax; mz = ay; }
      const b = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4));
      if (b(12)) mz = -1; if (b(13)) mz = 1; if (b(14)) mx = -1; if (b(15)) mx = 1;
      pass = pass || b(0);
      shoot = shoot || b(2) || b(7);
      poke = poke || b(1) || b(5);
      sprint = sprint || b(6) || b(4) || b(10);
      pause = b(9);
    }
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const out = {
      mx, mz, sprint,
      passP: pass && !this.prev.pass, passR: !pass && this.prev.pass, passHeld: pass,
      shootP: shoot && !this.prev.shoot, shootR: !shoot && this.prev.shoot, shootHeld: shoot,
      pokeP: poke && !this.prev.poke,
      pauseP: pause && !this.prev.pause,
    };
    this.prev = { pass, shoot, poke, pause };
    return out;
  }
}
