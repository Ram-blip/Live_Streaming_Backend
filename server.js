const fs = require('fs');
const https = require('https');
const http = require('http');
const express = require('express');
const app = express();
app.use(express.static('public'));

// For HTTPS setup (commented out for development)
// const key = fs.readFileSync('./config/create-cert-key.pem');
// const cert = fs.readFileSync('./config/create-cert.pem');
// const options = {key, cert};
// const httpsServer = https.createServer(options, app);
const httpServer = http.createServer(app);

const socketio = require('socket.io');
const mediasoup = require('mediasoup');

const config = require('./config/config');
const createWorkers = require('./utilities/createWorkers');
const getWorker = require('./utilities/getWorker');
const updateActiveSpeakers = require('./utilities/updateActiveSpeakers');
const Client = require('./classes/Client');
const Room = require('./classes/Room');

const io = socketio(httpServer, {
    cors: {
        origin: ['http://localhost:5173', 'https://localhost:5173', 'http://10.13.15.238:5173/'],
        methods: ['GET', 'POST']
    }
});

// Global variables
let workers = null;
const rooms = [];

// Initialize MediaSoup workers
const initMediaSoup = async () => {
    workers = await createWorkers();
};

initMediaSoup();

io.on('connect', socket => {
    let client;
    const handshake = socket.handshake;

    socket.on('checkRoom', async ({username, roomId, isPresenter}, ackCb) => {
        let requestedRoom = rooms.find(room => room.roomName === roomId);
        let canBePresenter = isPresenter;

        if (!requestedRoom) {
            const workerToUse = await getWorker(workers);
            requestedRoom = new Room(roomId, workerToUse);
            await requestedRoom.createRouter(io);
            rooms.push(requestedRoom);
        } else {
            if (isPresenter && !requestedRoom.canAddPresenter()) {
                canBePresenter = false;
            }
        }

        ackCb({
            success: true,
            isPresenter: canBePresenter,
            message: canBePresenter === isPresenter ? 
                'Joining room' : 
                'Joining as participant (presenter limit reached)'
        });
    });

    socket.on('joinRoom', async ({username, roomId, isPresenter}, ackCb) => {
        let newRoom = false;
        client = new Client(username, socket);
        client.isPresenter = isPresenter;

        let requestedRoom = rooms.find(room => room.roomName === roomId);
        
        if (!requestedRoom) {
            newRoom = true;
            const workerToUse = await getWorker(workers);
            requestedRoom = new Room(roomId, workerToUse);
            await requestedRoom.createRouter(io);
            rooms.push(requestedRoom);
        }

        if (isPresenter) {
            requestedRoom.addPresenter(socket.id);
        }

        client.room = requestedRoom;
        client.room.addClient(client);
        socket.join(client.room.roomName);

        const audioPidsToCreate = client.room.activeSpeakerList.slice(0, 5);
        const videoPidsToCreate = audioPidsToCreate.map(aid => {
            const producingClient = client.room.clients.find(c => 
                c?.producer?.audio?.id === aid
            );
            return producingClient?.producer?.video?.id;
        });

        const associatedUserNames = audioPidsToCreate.map(aid => {
            const producingClient = client.room.clients.find(c => 
                c?.producer?.audio?.id === aid
            );
            return producingClient?.userName;
        });

        ackCb({
            routerRtpCapabilities: client.room.router.rtpCapabilities,
            newRoom,
            audioPidsToCreate,
            videoPidsToCreate,
            associatedUserNames,
            isPresenter: client.isPresenter
        });
    });

    socket.on('requestTransport', async ({type, audioPid}, ackCb) => {
        let clientTransportParams;
        if (type === 'producer') {
            clientTransportParams = await client.addTransport(type);
        } else if (type === 'consumer') {
            const producingClient = client.room.clients.find(c => 
                c?.producer?.audio?.id === audioPid
            );
            const videoPid = producingClient?.producer?.video?.id;
            clientTransportParams = await client.addTransport(type, audioPid, videoPid);
        }
        ackCb(clientTransportParams);
    });

    socket.on('connectTransport', async ({dtlsParameters, type, audioPid}, ackCb) => {
        if (type === 'producer') {
            try {
                await client.upstreamTransport.connect({dtlsParameters});
                ackCb('success');
            } catch (error) {
                console.log(error);
                ackCb('error');
            }
        } else if (type === 'consumer') {
            try {
                const downStreamTransports = client.downStreamTransports.find(t => 
                    t.associatedAudioPid === audioPid
                );
                await downStreamTransports.transport.connect({dtlsParameters});
                ackCb('success');
            } catch (error) {
                console.log(error);
                ackCb('error');
            }
        }
    });

    socket.on('startProducing', async ({kind, rtpParameters}, ackCb) => {
        try {
            const newProducer = await client.upstreamTransport.produce({
                kind,
                rtpParameters
            });
            
            client.addProducer(kind, newProducer);
            
            // Only add audio producers to active speaker list if client is a presenter
            if (kind === 'audio' && client.isPresenter) {
                client.room.activeSpeakerList.push(newProducer.id);
            }
            
            ackCb(newProducer.id);

            // Update active speakers for audio changes only
            if (kind === 'audio') {
                const newTransportsByPeer = updateActiveSpeakers(client.room, io);
                
                for (const [socketId, audioPidsToCreate] of Object.entries(newTransportsByPeer)) {
                    const videoPidsToCreate = audioPidsToCreate.map(aPid => {
                        const producerClient = client.room.clients.find(c => 
                            c?.producer?.audio?.id === aPid
                        );
                        return producerClient?.producer?.video?.id;
                    });

                    const associatedUserNames = audioPidsToCreate.map(aPid => {
                        const producerClient = client.room.clients.find(c => 
                            c?.producer?.audio?.id === aPid
                        );
                        return producerClient?.userName;
                    });

                    io.to(socketId).emit('newProducersToConsume', {
                        routerRtpCapabilities: client.room.router.rtpCapabilities,
                        audioPidsToCreate,
                        videoPidsToCreate,
                        associatedUserNames,
                        activeSpeakerList: client.room.activeSpeakerList.slice(0, 5)
                    });
                }
            }
        } catch (error) {
            console.log(error);
            ackCb('error');
        }
    });

    socket.on('audioChange', typeOfChange => {
        if (typeOfChange === 'mute') {
            client?.producer?.audio?.pause();
        } else {
            client?.producer?.audio?.resume();
        }
    });

    socket.on('consumeMedia', async ({rtpCapabilities, pid, kind}, ackCb) => {
        try {
            if (!client.room.router.canConsume({producerId: pid, rtpCapabilities})) {
                ackCb('cannotConsume');
            } else {
                const downStreamTransports = client.downStreamTransports.find(t => {
                    if (kind === 'audio') {
                        return t.associatedAudioPid === pid;
                    } else if (kind === 'video') {
                        return t.associatedVideoPid === pid;
                    }
                });

                const newConsumer = await downStreamTransports.transport.consume({
                    producerId: pid,
                    rtpCapabilities,
                    paused: true
                });

                client.addConsumer(kind, newConsumer, downStreamTransports);

                const clientParams = {
                    producerId: pid,
                    id: newConsumer.id,
                    kind: newConsumer.kind,
                    rtpParameters: newConsumer.rtpParameters
                };

                ackCb(clientParams);
            }
        } catch (err) {
            console.log(err);
            ackCb('consumeFailed');
        }
    });

    socket.on('unpauseConsumer', async ({pid, kind}, ackCb) => {
        const consumerToResume = client.downStreamTransports.find(t => 
            t?.[kind]?.producerId === pid
        );

        if (consumerToResume?.[kind]?.resume) {
            await consumerToResume[kind].resume();
        }

        if (typeof ackCb === 'function') {
            ackCb();
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        if (client?.room) {
            // Remove presenter status if they were a presenter
            client.room.removePresenter(socket.id);
            
            // Remove client from room
            const index = client.room.clients.findIndex(c => c.socket.id === socket.id);
            if (index > -1) {
                client.room.clients.splice(index, 1);
            }

            // Clean up room if empty
            if (client.room.clients.length === 0) {
                const roomIndex = rooms.findIndex(r => r.roomName === client.room.roomName);
                if (roomIndex > -1) {
                    rooms.splice(roomIndex, 1);
                }
            } else {
                // Update active speakers for remaining clients
                updateActiveSpeakers(client.room, io);
            }
        }
    });
});

httpServer.listen(config.port, () => {
    console.log(`Server is running on port ${config.port}`);
});