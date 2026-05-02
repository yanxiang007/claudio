export class Transcript {
  constructor() {
    this.el = document.getElementById('transcript');
  }
  append(role, text) {
    if (!text) return;
    const row = document.createElement('div');
    row.className = `msg msg-${role}`;
    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = role === 'dj' ? 'Claudio' : 'You';
    const body = document.createElement('div');
    body.className = 'body';
    body.textContent = text;
    row.appendChild(who);
    row.appendChild(body);
    this.el.appendChild(row);
    this.el.scrollTop = this.el.scrollHeight;
  }
}
