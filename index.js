const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());
app.use(express.static('public'));

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        auth: state,
        version : [2, 2413, 1] ///[0x2, 0x913, 0x4],
    });
    
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
            if (lastDisconnect.error && lastDisconnect.error.output.statusCode === 428 ) {
                // Hapus folder auth_info
              
                startSock();
            }
        } else if (connection === 'open') {
            console.log('opened connection');
            io.emit('ready');
        }

        

    });
    
    sock.ev.on('creds.update', saveCreds);

    // sock.ev.on('messages.upsert', async (m) => {
    //     // console.log(JSON.stringify(m, undefined, 2));
    //     if (m.type === 'notify') {
    //         for (const message of m.messages) {
    //             if (!message.key.fromMe && message.message?.conversation) {
    //                 const incomingMessage = message.message.conversation;
    //                 const jid = message.key.remoteJid;
    //                 await sendMessage(jid, incomingMessage);  
    //             }
    //         }
    //     }
    // });

    sock.ev.on('messages.upsert', async (m) => {
        console.log(JSON.stringify(m, undefined, 2));
    
        for (let msg of m.messages) {
            if (!msg.key.fromMe) {
                console.log('replying to', msg.key.remoteJid);
                await sock.sendMessage(msg.key.remoteJid, { text: 'Hello there!' });
            }
        }
    });
    
    

    return sock;
}

async function startSock() {
    sock = await connectToWhatsApp();
}

//startSock();


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

io.on('connection', (socket) => {
    console.log('New client connected');
    startSock();

    socket.on('logout', async () => {
        if (sock) {
            await sock.logout();
            deleteAuthInfoFolder();
            console.log('Logged out');
            //io.emit('logout');
            startSock();
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

const sendMessage = async (jid, text) => {
    try {
        if (sock) {
            await sock.sendMessage(jid, { text });
            console.log(`Message sent to ${jid}: ${text}`);
        }
    } catch (error) {
        console.error('Failed to send message:', error);
    }
};


app.post('/send-message', async (req, res) => {
    const { number, message } = req.body;
    const jid = `${number}@s.whatsapp.net`;
    try {
        await sendMessage(jid, message);
        res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to send message' });
    }
});

app.post('/restart', async (req, res) => {
    try {
        await startSock();
        res.json({ success: true, message: 'restarted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to restart' });
    }
});


server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
