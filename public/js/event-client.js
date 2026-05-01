export class EventClient {
  constructor(handler) {
    const es = new EventSource('/events');
    es.onmessage = (e) => {
      try { handler(JSON.parse(e.data)); } catch {}
    };
    es.onerror = () => console.warn('SSE disconnected; will reconnect');
  }
}
