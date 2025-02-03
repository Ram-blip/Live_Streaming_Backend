const updateActiveSpeakers = require("./updateActiveSpeakers")

const newDominantSpeaker = (ds,room,io) => {
    console.log("======New Dominant Speaker======",ds.producer.id)
    // look throught the active speaker list and see if the id is already there
    // we know that it is an audio pid
    const i = room.activeSpeakerList.findIndex(pid=> pid === ds.producer.id)
    if(i>-1){
        // this person is in the list, move them to the front
        const [pid] = room.activeSpeakerList.splice(i,1)
        room.activeSpeakerList.unshift(pid)
    }else {
        // this is a new producer, just add to the front
        room.activeSpeakerList.unshift(ds.producer.id)
    }
    console.log(room.activeSpeakerList)
    // placeholder 1 the acitvespeakerlist has changed
    // updateactive speakers, mute unmute and get new transports

    const newTransportsByPeer = updateActiveSpeakers(room,io)
    for(const [socketId, audioPidsToCreate] of Object.entries(newTransportsByPeer)){
        // we have the audioPidsToCreate for this socket id
        // map the video pids and the username
        const videoPidsToCreate = audioPidsToCreate.map(aPid =>{
            const producerClient = room.clients.find(c=>c?.producer?.audio?.id === aPid)
            return producerClient?.producer?.video?.id
        })

        const associatedUserNames = audioPidsToCreate.map(aPid =>{
            const producerClient = room.clients.find(c=>c?.producer?.audio?.id === aPid)
            return producerClient?.userName
        })
        io.to(socketId).emit('newProducersToConsume',{
            routerRtpCapabilities : room.router.rtpCapabilities,
            audioPidsToCreate,
            videoPidsToCreate,
            associatedUserNames,
            activeSpeakerList : room.activeSpeakerList.slice(0,5)
        })
    }
}

module.exports = newDominantSpeaker 