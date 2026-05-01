import { describe, it, expect } from 'vitest';
import { ContextBuilder } from '../src/context-builder.js';

describe('ContextBuilder', () => {
  const fakeProfile = { getProfile: async () => ({ name: 'A', bio: 'b', musicTaste: 'm', vibes: 'v' }), recentHistory: async () => [] };
  const fakeWeather = { current: async () => ({ description: 'clear', tempC: 20 }) };
  const fakeDJMem = { recent: async () => ['hello'] };

  it('assembles a complete bundle', async () => {
    const b = new ContextBuilder(fakeProfile as any, fakeWeather as any, fakeDJMem as any);
    const bundle = await b.build({ lastTrack: { title: 'X', artist: 'Y' } });
    expect(bundle.profile.name).toBe('A');
    expect(bundle.weather?.description).toBe('clear');
    expect(bundle.recentDJScripts).toEqual(['hello']);
    expect(bundle.lastTrack?.title).toBe('X');
  });

  it('tolerates weather null', async () => {
    const w = { current: async () => null };
    const b = new ContextBuilder(fakeProfile as any, w as any, fakeDJMem as any);
    const bundle = await b.build({ lastTrack: null });
    expect(bundle.weather).toBeNull();
  });
});
