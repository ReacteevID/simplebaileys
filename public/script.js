const socket = io();

socket.on('qr', (qr) => {
    document.getElementById('qr-code').innerHTML = `<img src="${qr}" alt="QR Code">`;
});

socket.on('ready', () => {
    document.getElementById('qr-code').innerHTML = '<p>WhatsApp is connected!</p>';
});

socket.on('logout', () => {
    document.getElementById('qr-code').innerHTML = '';
    alert('Logged out');
});

document.getElementById('logout').addEventListener('click', () => {
    socket.emit('logout');
});
