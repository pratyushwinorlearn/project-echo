'use strict';

const path = require('node:path');
const dotenv = require('dotenv');
const WebSocket = require('ws');

dotenv.config({ path: path.join(__dirname, '../.env') });

const apiKey = process.env.DEEPGRAM_API_KEY;
if (!apiKey) {
  console.error('DEEPGRAM_API_KEY is missing. Add it to .env first.');
  process.exit(1);
}

const url = new URL('wss://api.deepgram.com/v1/listen');
url.searchParams.set('model', 'nova-3');
url.searchParams.set('language', 'en-IN');
url.searchParams.set('encoding', 'linear16');
url.searchParams.set('sample_rate', '16000');
url.searchParams.set('channels', '1');
url.searchParams.set('interim_results', 'true');

console.log('Checking the Deepgram Nova-3 WebSocket handshake…');
const socket = new WebSocket(url.toString(), {
  headers: { Authorization: `Token ${apiKey}` },
  handshakeTimeout: 10000
});

const timeout = setTimeout(() => {
  console.error('Timed out before Deepgram accepted the connection.');
  socket.terminate();
  process.exitCode = 1;
}, 11000);

timeout.unref?.();

socket.once('open', () => {
  clearTimeout(timeout);
  console.log('SUCCESS: Deepgram accepted the API key and opened a Nova-3 streaming connection.');
  console.log('No microphone audio was sent.');
  socket.send(JSON.stringify({ type: 'CloseStream' }));
  setTimeout(() => socket.close(1000, 'Handshake test complete'), 150);
});

socket.on('unexpected-response', (_request, response) => {
  clearTimeout(timeout);
  let body = '';
  response.on('data', (chunk) => { body += chunk.toString(); });
  response.on('end', () => {
    console.error(`Deepgram rejected the connection: HTTP ${response.statusCode}`);
    if (body) console.error(body.slice(0, 1200));
    process.exitCode = 1;
  });
});

socket.on('error', (error) => {
  clearTimeout(timeout);
  console.error(`Connection test failed: ${error.message}`);
  process.exitCode = 1;
});

socket.on('close', () => clearTimeout(timeout));
