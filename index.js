const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        auth: state,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrcode.toDataURL(qr, (err, url) => {
                if (err) {
                    console.error('Error generating QR code', err);
                } else {
                    io.emit('qr', url);
                }
            });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error && lastDisconnect.error.output.statusCode) !== DisconnectReason.loggedOut;
            console.log('connection closed  ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                await connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('opened connection');
            io.emit('ready');
        }
    });

    return sock;
}

let sock;

async function startSock() {
    sock = await connectToWhatsApp();
}

startSock();

app.use(express.static('public'));

function deleteAuthInfoFolder() {
    const authInfoPath = path.join(__dirname, 'auth_info');

    fs.rmdir(authInfoPath, { recursive: true }, (err) => {
        if (err) {
            console.error('Error deleting auth_info folder:', err);
        } else {
            console.log('auth_info folder deleted successfully');
        }
    });
}


server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});

io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('logout', async () => {
        if (sock) {
            await sock.logout();
            sock = null;
            console.log('Logged out');
            io.emit('logout');
            //deleteAuthInfoFolder();
            startSock();
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

