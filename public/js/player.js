export class Player {
  constructor() {
    this.musicEl = document.getElementById('music-audio');
    this.djEl = document.getElementById('dj-audio');
    this.titleEl = document.getElementById('track-title');
    this.artistEl = document.getElementById('track-artist');
    this.progressEl = document.getElementById('progress');
    this.elapsedEl = document.getElementById('elapsed-time');
    this.durationEl = document.getElementById('duration-time');
    this.playPauseBtn = document.getElementById('play-pause');
    this.skipBtn = document.getElementById('skip');
    this.likeBtn = document.getElementById('like');

    this.currentTrack = null;
    this.endingSent = false;
    this.cliMode = false;

    this.musicEl.addEventListener('timeupdate', () => this._onTime());
    this.musicEl.addEventListener('durationchange', () => this._onDurationChange());
    this.musicEl.addEventListener('ended', () => this._onEnded());
    this.playPauseBtn.addEventListener('click', () => this._togglePlay());
    this.skipBtn.addEventListener('click', () => fetch('/track/skip', { method: 'POST' }));
    this.likeBtn.addEventListener('click', () => {
      if (this.currentTrack) fetch('/like', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trackId: this.currentTrack.id }) });
    });
  }

  setTrack(track) {
    this.currentTrack = track;
    this.endingSent = false;
    this.cliMode = track.url?.startsWith('ncm-cli://') ?? false;
    this.titleEl.textContent = track.title;
    this.artistEl.textContent = track.artist;
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
    this.musicEl.play().catch(() => {});
    this.playPauseBtn.textContent = 'Pause';
  }

  async playDJ(audioUrl) {
    if (!audioUrl) return;
    this.musicEl.pause();
    this.djEl.src = audioUrl;
    await new Promise((res) => {
      this.djEl.onended = res;
      this.djEl.onerror = res;
      this.djEl.play().catch(res);
    });
    if (this.currentTrack && !this.cliMode) this.musicEl.play().catch(() => {});
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
    if (this.cliMode) return;
    if (this.musicEl.paused) { this.musicEl.play(); this.playPauseBtn.textContent = 'Pause'; }
    else { this.musicEl.pause(); this.playPauseBtn.textContent = 'Play'; }
  }

  _formatTime(value) {
    const total = Math.max(0, Math.floor(value || 0));
    const minutes = Math.floor(total / 60);
    const seconds = String(total % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }
}
