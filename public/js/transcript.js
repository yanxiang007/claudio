export class Transcript {
  constructor() {
    this.el = document.getElementById('transcript');
    this.pendingEl = null;
  }

  append(role, text) {
    if (!text) return;
    if (role === 'dj') this.hidePending();
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

  showPending() {
    if (this.pendingEl) return;

    const row = document.createElement('div');
    row.className = 'msg msg-dj msg-pending';
    row.setAttribute('aria-live', 'polite');

    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = 'Claudio';

    const body = document.createElement('div');
    body.className = 'body pending-body';

    const scope = document.createElement('span');
    scope.className = 'pending-scope';
    scope.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 5; i++) {
      const bar = document.createElement('span');
      scope.appendChild(bar);
    }

    const text = document.createElement('span');
    text.className = 'pending-text';
    text.textContent = 'Tuning';

    const dots = document.createElement('span');
    dots.className = 'pending-dots';
    dots.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dots.appendChild(dot);
    }

    body.append(scope, text, dots);
    row.append(who, body);
    this.pendingEl = row;
    this.el.appendChild(row);
    this.el.scrollTop = this.el.scrollHeight;
  }

  hidePending() {
    this.pendingEl?.remove();
    this.pendingEl = null;
  }
}
