export class DJBubble {
  constructor() {
    this.el = document.getElementById('dj-bubble');
    this.textEl = document.getElementById('dj-text');
  }
  show(text) { this.textEl.textContent = text; this.el.hidden = false; }
  hide() { this.el.hidden = true; }
}
