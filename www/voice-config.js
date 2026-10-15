// Servidor de retransmissão da voz (Metered, plano grátis de 5 GB/mês).
// Usado quando os aparelhos estão em redes diferentes (4G/5G, outra casa).
window.GD_TURN = [
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'turn:global.relay.metered.ca:80', username: '3575242fb9f369dfe32b356a', credential: '9rWk0MjNBjZgUDlx' },
  { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: '3575242fb9f369dfe32b356a', credential: '9rWk0MjNBjZgUDlx' },
  { urls: 'turn:global.relay.metered.ca:443', username: '3575242fb9f369dfe32b356a', credential: '9rWk0MjNBjZgUDlx' },
  { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: '3575242fb9f369dfe32b356a', credential: '9rWk0MjNBjZgUDlx' }
];
// Alternativa: buscar credenciais pela API (deixe vazio para não usar)
window.GD_TURN_API = '';
