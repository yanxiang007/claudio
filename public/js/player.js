export class Player {
  constructor() {
    this.musicEl = document.getElementById('music-audio');
    this.djEl = document.getElementById('dj-audio');
    this.titleEl = document.getElementById('track-title');
    this.artistEl = document.getElementById('track-artist');
    this.progressEl = document.getElementById('progress');
    this.playPauseBtn = document.getElementById('play-pause');
    this.skipBtn = document.getElementById('skip');
    this.likeBtn = document.getElementById('like');

    this.currentTrack = null;
    this.endingSent = false;

    this.musicEl.addEventListener('timeupdate', () => this._onTime());
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
    this.titleEl.textContent = track.title;
    this.artistEl.textContent = track.artist;
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
    if (this.currentTrack) this.musicEl.play().catch(() => {});
  }

  _onTime() {
    if (!this.musicEl.duration) return;
    this.progressEl.value = this.musicEl.currentTime / this.musicEl.duration;
    if (!this.endingSent && this.musicEl.duration - this.musicEl.currentTime < 5) {
      this.endingSent = true;
      fetch('/track/ending', { method: 'POST' });
    }
  }

  _onEnded() {
    if (!this.endingSent) {
      this.endingSent = true;
      fetch('/track/ending', { method: 'POST' });
    }
  }

  _togglePlay() {
    if (this.musicEl.paused) { this.musicEl.play(); this.playPauseBtn.textContent = 'Pause'; }
    else { this.musicEl.pause(); this.playPauseBtn.textContent = 'Play'; }
  }
}
