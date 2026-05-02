export class Player {
  constructor() {
    this.musicEl = document.getElementById('music-audio');
    this.djEl = document.getElementById('dj-audio');
    this.titleEl = document.getElementById('track-title');
    this.artistEl = document.getElementById('track-artist');
    this.queueTitleEl = document.getElementById('queue-current-title');
    this.queueArtistEl = document.getElementById('queue-current-artist');
    this.queueListEl = document.querySelector('.queue-list');
    this.queueCountEl = document.querySelector('.queue-heading span:last-child');
    this.progressEl = document.getElementById('progress');
    this.elapsedEl = document.getElementById('elapsed-time');
    this.durationEl = document.getElementById('duration-time');
    this.playPauseBtn = document.getElementById('play-pause');
    this.skipBtn = document.getElementById('skip');
    this.likeBtn = document.getElementById('like');

    this.currentTrack = null;
    this.upcomingTracks = [];
    this.endingSent = false;
    this.cliMode = false;
    this.isDJSpeaking = false;
    this.resumeAfterDJ = false;
    this.djPlayback = Promise.resolve();
    this.userActivated = false;

    this.musicEl.addEventListener('timeupdate', () => this._onTime());
    this.musicEl.addEventListener('durationchange', () => this._onDurationChange());
    this.musicEl.addEventListener('ended', () => this._onEnded());
    this.playPauseBtn.addEventListener('click', () => this._togglePlay());
    this.skipBtn.addEventListener('click', () => fetch('/track/skip', { method: 'POST' }));
    this.likeBtn.addEventListener('click', () => {
      if (this.currentTrack) fetch('/like', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId: this.currentTrack.id }) });
    });
  }

  unlockAudio() {
    this.userActivated = true;
  }

  setTrack(track) {
    this.currentTrack = track;
    this.endingSent = false;
    this.cliMode = track.url?.startsWith('ncm-cli://') ?? false;
    this.titleEl.textContent = track.title;
    this.artistEl.textContent = track.artist;
    if (this.queueTitleEl) this.queueTitleEl.textContent = track.title;
    if (this.queueArtistEl) this.queueArtistEl.textContent = track.artist;
    this.renderQueue(this.upcomingTracks);
    if (this.cliMode) {
      this.musicEl.removeAttribute('src');
      this.progressEl.removeAttribute('value');
      this.elapsedEl.textContent = '0:00';
      this.durationEl.textContent = 'CLI';
      this.playPauseBtn.textContent = 'ncm-cli playing';
      return;
    }
    this.progressEl.value = 0;
    this.elapsedEl.textContent = '0:00';
    this.durationEl.textContent = 'Live';
    this.musicEl.src = track.url;
    if (this.isDJSpeaking) {
      this.resumeAfterDJ = true;
      this.playPauseBtn.textContent = 'Cueing';
      return;
    }
    this._playMusic('track changed');
  }

  async playDJ(audioUrl) {
    if (!audioUrl) return;
    this.djPlayback = this.djPlayback.then(() => this._playDJ(audioUrl));
    return this.djPlayback;
  }

  renderQueue(upcoming = []) {
    this.upcomingTracks = upcoming;
    if (!this.queueListEl) return;

    const tracks = [
      ...(this.currentTrack ? [{ ...this.currentTrack, current: true }] : []),
      ...upcoming.map((track) => ({ ...track, current: false }))
    ];

    this.queueListEl.textContent = '';
    for (const [idx, track] of tracks.entries()) {
      const item = document.createElement('li');
      if (track.current) item.className = 'is-current';

      const index = document.createElement('span');
      index.className = 'queue-index';
      index.textContent = String(idx + 1);

      const title = document.createElement('span');
      title.className = 'queue-track';
      title.textContent = track.title;

      const artist = document.createElement('span');
      artist.className = 'queue-artist';
      artist.textContent = track.artist;

      item.append(index, title, artist);
      this.queueListEl.appendChild(item);
    }

    if (this.queueCountEl) {
      this.queueCountEl.textContent = `${tracks.length || 0} tracks`;
    }
  }

  async _playDJ(audioUrl) {
    const wasPlaying = this.currentTrack && !this.cliMode && !this.musicEl.paused;
    this.resumeAfterDJ = this.resumeAfterDJ || wasPlaying;
    this.isDJSpeaking = true;
    if (!this.cliMode) this.musicEl.pause();
    this.djEl.src = audioUrl;
    await new Promise((res) => {
      this.djEl.onended = res;
      this.djEl.onerror = res;
      this.djEl.play().catch((err) => {
        console.warn('[player] DJ audio play failed:', err);
        this.playPauseBtn.textContent = 'Tap Play';
        res();
      });
    });
    this.isDJSpeaking = false;
    if (this.currentTrack && !this.cliMode && this.resumeAfterDJ) {
      this.resumeAfterDJ = false;
      this._playMusic('after DJ');
    } else if (!this.cliMode) {
      this.playPauseBtn.textContent = this.musicEl.paused ? 'Play' : 'Pause';
    }
  }

  _onTime() {
    if (!this.musicEl.duration) return;
    this.progressEl.value = this.musicEl.currentTime / this.musicEl.duration;
    this.elapsedEl.textContent = this._formatTime(this.musicEl.currentTime);
    if (!this.endingSent && this.musicEl.duration - this.musicEl.currentTime < 5) {
      this.endingSent = true;
      fetch('/track/ending', { method: 'POST' });
    }
  }

  _onDurationChange() {
    this.durationEl.textContent = Number.isFinite(this.musicEl.duration)
      ? this._formatTime(this.musicEl.duration)
      : 'Live';
  }

  _onEnded() {
    if (!this.endingSent) {
      this.endingSent = true;
      fetch('/track/ending', { method: 'POST' });
    }
  }

  _togglePlay() {
    this.userActivated = true;
    if (this.cliMode) return;
    if (this.musicEl.paused) this._playMusic('play button');
    else { this.musicEl.pause(); this.playPauseBtn.textContent = 'Play'; }
  }

  _playMusic(reason) {
    const play = this.musicEl.play();
    this.playPauseBtn.textContent = 'Pause';
    play?.catch((err) => {
      console.warn(`[player] Music play failed (${reason}):`, err);
      this.playPauseBtn.textContent = 'Tap Play';
    });
  }

  _formatTime(value) {
    const total = Math.max(0, Math.floor(value || 0));
    const minutes = Math.floor(total / 60);
    const seconds = String(total % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }
}
