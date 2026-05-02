export class ChatBox {
  constructor(transcript, onSubmit, options = {}) {
    const input = document.getElementById('chat-input');
    const send = document.getElementById('chat-send');
    const chat = document.getElementById('chat');
    let pending = false;

    const setPending = (value) => {
      pending = value;
      chat?.classList.toggle('is-waiting', value);
      send.disabled = value;
      input.disabled = value;
      if (value) options.onPendingStart?.();
      else options.onPendingEnd?.();
    };

    const submit = async () => {
      const v = input.value.trim();
      if (!v || pending) return;
      input.value = '';
      onSubmit?.();
      transcript?.append('user', v);
      setPending(true);
      try {
        const res = await fetch('/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: v })
        });
        if (!res.ok) throw new Error(`chat ${res.status}`);
      } catch (err) {
        console.warn('[chat] send failed:', err);
        setPending(false);
        transcript?.append('dj', 'The line crackled for a second. Try me again.');
      }
    };

    this.setPending = setPending;

    send.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }
}
