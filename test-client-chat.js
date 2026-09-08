const io = require('socket.io-client');

const serverURL = 'https://patientportalapi.akosmd.in'; // Adjust if your server uses a different URL or port

const socket = io(serverURL, {
    transports: ["websocket"], // Ensure WebSocket transport is used
    reconnection: true, // Enable reconnection
  });
socket.on('connect', () => {
  console.log('Connected to server');

  // Test sending a message
  socket.emit('testMessage', 'Hello from the test client!');

  // Listen for messages from the server
  socket.on('newMessage', (message) => {
    console.log('Received newMessage:', message);
  });

  // Optionally, disconnect after testing
  setTimeout(() => {
    socket.disconnect();
    console.log('Disconnected from server');
  }, 5000); // Disconnect after 5 seconds
});

socket.on('connect_error', (error) => {
  console.error('Connection Error:', error);
});
