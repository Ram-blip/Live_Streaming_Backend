const config = require('../config/config.js')
const newDominantSpeaker = require('../utilities/newDominantSpeaker')
// Room are not a mediasoup thing. MS cares about mediastreams, transports 
// things like it doesnt care or know about rooms
// Rooms can be inside of client,client inside of rooms
// transports can be inside of rooms, clients inside of transports

class Room{
     constructor(roomName, workerToUse){
        this.roomName = roomName
        this.worker = workerToUse
        this.router = null
        // all the client objects that are in this room
        this.clients = []
        // an array of id's with the most recent dominant speaker first
        this.activeSpeakerList = []
     }
     addClient(client){
        this.clients.push(client)
     }

     createRouter(io){
        return new Promise(async(resolve, reject)=>{
            this.router = await this.worker.createRouter({
                mediaCodecs: config.routerMediaCodecs
            })
            this.activeSpeakerObserver = await this.router.createActiveSpeakerObserver({
               interval: 300 // 300 is the default ms, 0.3 seconds
            })
            this.activeSpeakerObserver.on('dominantspeaker', ds=> newDominantSpeaker(ds,this,io))
            resolve()
        })
     }
}

module.exports = Room