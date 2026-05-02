export class ChatBox {
  constructor(transcript) {
    const input = document.getElementById('chat-input');
    const send = document.getElementById('chat-send');
    const submit = async () => {
      const v = input.value.trim();
      if (!v) return;
      input.value = '';
      transcript?.append('user', v);
      await fetch('/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: v }) });
    };
    send.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }
}
