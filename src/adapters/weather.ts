import axios from 'axios';

export class WeatherClient {
  constructor(private apiKey: string, private city: string) {}

  async current(): Promise<{ description: string; tempC: number } | null> {
    if (!this.apiKey) return null;
    try {
      const { data } = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: { q: this.city, appid: this.apiKey, units: 'metric' },
        timeout: 5000
      });
      return { description: data.weather?.[0]?.description ?? 'unknown', tempC: data.main?.temp ?? 0 };
    } catch {
      return null;
    }
  }
}
