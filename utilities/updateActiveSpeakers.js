const updateActiveSpeakers = (room, io) => {
    if (!room || !room.clients) {
        return {};
    }

    const activeSpeakers = room.activeSpeakerList.slice(0, 5);
    const mutedSpeakers = room.activeSpeakerList.slice(5);
    const newTransportsByPeer = {};

    // Loop through all the connected clients in the room
    room.clients.forEach(client => {
        if (!client) return;

        // Loop through all clients to mute
        mutedSpeakers.forEach(pid => {
            if (!pid) return;

            // Handle producer muting
            if (client?.producer?.audio?.id === pid) {
                if (client.producer.audio && typeof client.producer.audio.pause === 'function') {
                    client.producer.audio.pause();
                }
                if (client.producer.video && typeof client.producer.video.pause === 'function') {
                    client.producer.video.pause();
                }
                return;
            }

            // Handle consumer muting
            const downStreamToStop = client.downStreamTransports?.find(t => t?.audio?.producerId === pid);
            if (downStreamToStop) {
                if (downStreamToStop.audio && typeof downStreamToStop.audio.pause === 'function') {
                    downStreamToStop.audio.pause();
                }
                if (downStreamToStop.video && typeof downStreamToStop.video.pause === 'function') {
                    downStreamToStop.video.pause();
                }
            }
        });

        // Store all the pid that the client is not yet consuming
        const newSpeakersToThisClient = [];
        activeSpeakers.forEach(pid => {
            if (!pid) return;

            // Handle producer resuming
            if (client?.producer?.audio?.id === pid) {
                if (client.producer.audio && typeof client.producer.audio.resume === 'function') {
                    client.producer.audio.resume();
                }
                if (client.producer.video && typeof client.producer.video.resume === 'function') {
                    client.producer.video.resume();
                }
                return;
            }

            // Handle consumer resuming
            const downStreamToStart = client.downStreamTransports?.find(t => t?.associatedAudioPid === pid);
            if (downStreamToStart) {
                if (downStreamToStart.audio && typeof downStreamToStart.audio.resume === 'function') {
                    downStreamToStart.audio.resume();
                }
                if (downStreamToStart.video && typeof downStreamToStart.video.resume === 'function') {
                    downStreamToStart.video.resume();
                }
            } else {
                // This client is not consuming... start the process
                newSpeakersToThisClient.push(pid);
            }
        });

        if (newSpeakersToThisClient.length && client.socket) {
            // This client has at least 1 new consumer/transport to make
            newTransportsByPeer[client.socket.id] = newSpeakersToThisClient;
        }
    });

    // Broadcast to this room only if room exists and has a roomName
    if (room && room.roomName) {
        io.to(room.roomName).emit('updateActiveSpeakers', activeSpeakers);
    }
    
    return newTransportsByPeer;
};

module.exports = updateActiveSpeakers;