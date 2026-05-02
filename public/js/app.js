import { Player } from './player.js';
import { Transcript } from './transcript.js';
import { ChatBox } from './chat-box.js';
import { EventClient } from './event-client.js';

const player = new Player();
const transcript = new Transcript();
const chatBox = new ChatBox(transcript, () => player.unlockAudio(), {
  onPendingStart: () => transcript.showPending(),
  onPendingEnd: () => transcript.hidePending()
});

const clockTime = document.getElementById('clock-time');
const clockDate = document.getElementById('clock-date');
const wordmark = document.querySelector('[data-dot-text]');
const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

const DOT_GLYPHS = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  ':': ['000', '010', '010', '000', '010', '010', '000'],
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  I: ['111', '010', '010', '010', '010', '010', '111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  a: ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
  d: ['00001', '00001', '01111', '10001', '10001', '10001', '01111'],
  i: ['010', '000', '110', '010', '010', '010', '111'],
  l: ['110', '010', '010', '010', '010', '010', '111'],
  o: ['00000', '00000', '01110', '10001', '10001', '10001', '01110'],
  u: ['00000', '00000', '10001', '10001', '10001', '10011', '01101']
};

function renderDotText(el, text) {
  if (!el) return;
  el.textContent = '';
  el.setAttribute('aria-label', text);
  for (const raw of text) {
    const glyph = DOT_GLYPHS[raw] ?? DOT_GLYPHS[raw.toUpperCase()] ?? DOT_GLYPHS[' '];
    const char = document.createElement('span');
    char.className = 'dot-char';
    char.style.setProperty('--cols', String(glyph[0].length));
    char.setAttribute('aria-hidden', 'true');
    for (const row of glyph) {
      for (const bit of row) {
        const dot = document.createElement('span');
        dot.className = bit === '1' ? 'dot is-on' : 'dot';
        char.appendChild(dot);
      }
    }
    el.appendChild(char);
  }
}

function updateClock() {
  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  renderDotText(clockTime, time);
  clockTime.dateTime = time;
  clockDate.textContent = dateFormat.format(now);
}

renderDotText(wordmark, wordmark?.dataset.dotText ?? 'Claudio');
updateClock();
setInterval(updateClock, 1000);

const themeButtons = [...document.querySelectorAll('[data-theme-choice]')];
themeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const theme = button.dataset.themeChoice;
    document.body.dataset.theme = theme;
    themeButtons.forEach((item) => item.classList.toggle('is-active', item === button));
  });
});

new EventClient((evt) => {
  if (evt.type === 'track-changed') {
    player.setTrack(evt.track);
  } else if (evt.type === 'queue-update') {
    player.renderQueue(evt.queue);
  } else if (evt.type === 'dj-speaking') {
    chatBox.setPending(false);
    transcript.append('dj', evt.text);
    if (evt.audioUrl) player.playDJ(evt.audioUrl);
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

fetch('/track/start', { method: 'POST' });
