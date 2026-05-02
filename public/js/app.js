import { Player } from './player.js';
import { Transcript } from './transcript.js';
import { ChatBox } from './chat-box.js';
import { EventClient } from './event-client.js';

const player = new Player();
const transcript = new Transcript();
new ChatBox(transcript);

const clockTime = document.getElementById('clock-time');
const clockDate = document.getElementById('clock-date');
const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

function updateClock() {
  const now = new Date();
  clockTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  clockDate.textContent = dateFormat.format(now);
}

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
  } else if (evt.type === 'dj-speaking') {
    transcript.append('dj', evt.text);
    if (evt.audioUrl) player.playDJ(evt.audioUrl);
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

fetch('/track/start', { method: 'POST' });
