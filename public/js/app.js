import { Player } from './player.js';
import { DJBubble } from './dj-bubble.js';
import { ChatBox } from './chat-box.js';
import { EventClient } from './event-client.js';

const player = new Player();
const bubble = new DJBubble();
new ChatBox();

new EventClient((evt) => {
  if (evt.type === 'track-changed') {
    player.setTrack(evt.track);
  } else if (evt.type === 'dj-speaking') {
    bubble.show(evt.text);
    player.playDJ(evt.audioUrl).then(() => setTimeout(() => bubble.hide(), 4000));
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

fetch('/track/start', { method: 'POST' });
