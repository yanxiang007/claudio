import type { ContextBundle } from './types.js';
import type { UserProfileStore } from './storage/user-profile.js';
import type { WeatherClient } from './adapters/weather.js';
import type { DJMemoryStore } from './storage/dj-memory.js';

export class ContextBuilder {
  constructor(
    private profile: UserProfileStore,
    private weather: WeatherClient,
    private djMemory: DJMemoryStore
  ) {}

  async build(state: { lastTrack: { title: string; artist: string } | null; userMessage?: string }): Promise<ContextBundle> {
    const [profile, history, weather, recentDJScripts] = await Promise.all([
      this.profile.getProfile(),
      this.profile.recentHistory(5),
      this.weather.current(),
      this.djMemory.recent(3)
    ]);
    return {
      time: new Date().toLocaleString(),
      weather,
      lastTrack: state.lastTrack,
      recentHistory: history,
      recentDJScripts,
      profile,
      userMessage: state.userMessage
    };
  }
}
