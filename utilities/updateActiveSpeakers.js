
const updateActiveSpeakers = (room, io) =>{
    const activeSpeakers = room.activeSpeakerList.slice(0,5)
    const mutedSpeakers = room.activeSpeakerList.slice(5)
    const newTransportsByPeer = {}
    // loop through all the connected clients in the room
    room.clients.forEach(client=>{
        // loop through all clients to mute
        mutedSpeakers.forEach(pid=>{
            // pid is the producer id we want to mute
            if(client?.producer?.audio?.id === pid){
                // mute the producer
                client?.producer?.audio.pause()
                client?.producer?.video.pause()
                return
            }
            const downStreamToStop = client.downStreamTransports.find(t=> t?.audio?.producerId === pid)
            if(downStreamToStop){
                // pause the consumer
                downStreamToStop.audio.pause()
                downStreamToStop.video.pause()
            }// no else do nothing if there is no match
        })
        // store all the pid that the client is not yet consuming
        const newSpeakersToThisClient = []
        activeSpeakers.forEach(pid=>{
            // pid is the producer id we want to mute
            if(client?.producer?.audio?.id === pid){
                // this client is the producer, you gonna resume
                client?.producer?.audio.resume()
                client?.producer?.video.resume()
                return
            }
            const downStreamToStart = client.downStreamTransports.find(t=> t?.associatedAudioPid === pid)
            if(downStreamToStart){
                // we have a match. just resume the consumer
                downStreamToStart.audio.resume()
                downStreamToStart.video.resume()
            }else{
                // this client is not consuming...start the process
                newSpeakersToThisClient.push(pid)
            }
        })

        if(newSpeakersToThisClient.length){
            // this client has at least 1 new consumer/transport to make
            newTransportsByPeer[client.socket.id] = newSpeakersToThisClient
        }
    })

    // client loop is done. we have muted or unmuted all producers/consumer based on the new active speakerlist, and now send out the consumners that need to be made
    // broadcast to this room
    io.to(room.roomName).emit('updateActiveSpeakers', activeSpeakers)
    return newTransportsByPeer
}

module.exports = updateActiveSpeakers