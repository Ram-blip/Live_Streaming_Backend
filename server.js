const fs = require('fs') //we need this to read our keys. Part of node
const https = require('https') //we need this for a secure express server. part of node
const http = require('http')

//express sets up the http server and serves our front end
const express = require('express')
const app = express()
//seve everything in public statically
app.use(express.static('public'))

//get the keys we made with mkcert
const key = fs.readFileSync('./config/create-cert-key.pem')
const cert = fs.readFileSync('./config/create-cert.pem')
const options = {key,cert}
//use those keys with the https module to have https
// const httpsServer = https.createServer(options, app)
const httpServer = http.createServer(app)


const socketio = require('socket.io')
const mediasoup = require('mediasoup')

const config = require('./config/config')
const createWorkers = require('./utilities/createWorkers')
const getWorker = require('./utilities/getWorker')
const updateActiveSpeakers = require('./utilities/updateActiveSpeakers')
const Client = require('./classes/Client')
const Room = require('./classes/Room')


//set up the socketio server, listening by way of our express https sever
const io = socketio(httpServer,{
    cors: [`https://localhost:5173`],
    cors: [`http://localhost:5173`],
    cors: [`http://10.13.15.238:5173/`],
})

//our globals
//init workers, it's where our mediasoup workers will live
let workers = null
// master rooms array that contains all our rooms 
const rooms = []



//initMediaSoup gets mediasoup ready to do its thing
const initMediaSoup = async()=>{
    workers = await createWorkers()
}

initMediaSoup() //build our mediasoup server/sfu

// socketIo listeners
io.on('connect', socket=>{
    // this is where this client/user/socket lives! 
    let client; // this client object is available to all the socket listeners below
    const handshake = socket.handshake // this is where auth and query lives
    // you could now check handshake for Password, auth, etc
    socket.on('joinRoom',async ({userName, roomName}, ackCb)=>{
        let newRoom = false
        client = new Client(userName, socket)
        let requestedRoom = rooms.find(room=> room.roomName === roomName)
        if(!requestedRoom){
            newRoom = true
            // make the new room, add a worker and add a new router to it
            const workerToUse = await getWorker(workers)
            requestedRoom = new Room(roomName, workerToUse)
            await requestedRoom.createRouter(io)
            rooms.push(requestedRoom)
        }
        // add the room to the client 
        client.room = requestedRoom
        // add the client to the Room clients
        client.room.addClient(client)
        // add this socket to the socket room
        socket.join(client.room.roomName)

        const audioPidsToCreate = client.room.activeSpeakerList.slice(0,5) // fetch the first 0-5 pids in the activespeaker list
        const videoPidsToCreate = audioPidsToCreate.map(aid=>{
            const producingClient = client.room.clients.find(c=> c?.producer?.audio?.id === aid)
            return producingClient?.producer?.video?.id
        })

        const associatedUserNames = audioPidsToCreate.map(aid=>{
            const producingClient = client.room.clients.find(c=> c?.producer?.audio?.id === aid)
            return producingClient?.userName
        })
        
        ackCb({
            routerRtpCapabilities: client.room.router.rtpCapabilities,
            newRoom,
            audioPidsToCreate,
            videoPidsToCreate,
            associatedUserNames
        })
    })

    socket.on('requestTransport', async ({type,audioPid},ackCb)=>{
        // whether producer or consumer, client needs the parameters    
        let clientTransportParams 
        if(type === 'producer'){
            clientTransportParams = await client.addTransport(type)
        } else if(type === 'consumer'){
            // we have 1 transport per client we are streaming from 
            // Each transport will have an audio and video producer/ consumer
            // we know the audio pid, because it came from the dominant speaker
            const producingClient = client.room.clients.find(c=> c?.producer?.audio?.id === audioPid)
            const videoPid = producingClient?.producer?.video?.id
            clientTransportParams = await client.addTransport(type,audioPid,videoPid)
        } 
        ackCb(clientTransportParams)

    })

    socket.on('connectTransport', async ({dtlsParameters, type, audioPid}, ackCb)=>{
        if(type === 'producer'){
            try{
                await client.upstreamTransport.connect({dtlsParameters})
                ackCb('success')
            }catch(error){
                console.log(error)
                ackCb('error')
            }
        } else if(type === 'consumer'){
            // find the right transport, for this consumer
            try{
                const downStreamTransports = client.downStreamTransports.find(t=> { return t.associatedAudioPid === audioPid})
                await downStreamTransports.transport.connect({dtlsParameters})
                ackCb('success')
            }
            catch(error){
                console.log(error)
                ackCb('error')
            }
        }
    })
    socket.on('startProducing', async ({kind, rtpParameters}, ackCb)=>{  
        // create a producer with the rtpParameters which we sent
        
        try{
            const newProducer = await client.upstreamTransport.produce({kind, rtpParameters})
            // add the producer to this client object
            client.addProducer(kind, newProducer)
            // the front end is waiting for the ack here
            if(kind === 'audio'){
                client.room.activeSpeakerList.push(newProducer.id)
            }
            ackCb(newProducer.id)
        }catch(error){ 
            console.log(error)
            ackCb('error')
        }
        
        // placeholder 1 if this is an audio producer, add it to the speaker
        // placeholder 2 if this room is populated, then let the connectd peers know 
        // run updateActiveSpeakers
        const newTransportsByPeer = updateActiveSpeakers(client.room,io)
        // newTransportsByPeer is an object with the socket id as the key and an array of pids to consume as the value
        for(const [socketId, audioPidsToCreate] of Object.entries(newTransportsByPeer)){
            // we have the audioPidsToCreate for this socket id
            // map the video pids and the username
            const videoPidsToCreate = audioPidsToCreate.map(aPid =>{
                const producerClient = client.room.clients.find(c=>c?.producer?.audio?.id === aPid)
                return producerClient?.producer?.video?.id
            })

            const associatedUserNames = audioPidsToCreate.map(aPid =>{
                const producerClient = client.room.clients.find(c=>c?.producer?.audio?.id === aPid)
                return producerClient?.userName
            })
            io.to(socketId).emit('newProducersToConsume',{
                routerRtpCapabilities: client.room.router.rtpCapabilities,
                audioPidsToCreate,
                videoPidsToCreate,
                associatedUserNames,
                activeSpeakerList : client.room.activeSpeakerList.slice(0,5)
            })
        }
    })

    socket.on('audioChange', typeOfChange => {
        if(typeOfChange === 'mute'){
            client?.producer?.audio?.pause()
        }else{
            client?.producer?.audio?.resume()
        }
    })

    socket.on('consumeMedia', async({rtpCapabilities, pid, kind}, ackCb)=>{
        // will run twice for every peer to consume, once for video and once for audio
        console.log("kind:", kind, "pid:", pid) 
        try{
            if(!client.room.router.canConsume({producerId: pid, rtpCapabilities})){
                ackCb("cannotConsume")
            }else {
                // we can consume!
                const downStreamTransports = client.downStreamTransports.find(t=>{
                    if(kind=== 'audio'){
                        return t.associatedAudioPid === pid
                    } else if(kind === 'video'){
                        return t.associatedVideoPid === pid
                    }
                }) 
                // create the consumer with the transport
                const newConsumer = await downStreamTransports.transport.consume({
                    producerId: pid,
                    rtpCapabilities,
                    paused: true // good to pause it initially, let the client decide when to play
                })
                client.addConsumer(kind, newConsumer, downStreamTransports)
                const clientParams = {
                    producerId: pid,
                    id: newConsumer.id,
                    kind: newConsumer.kind,
                    rtpParameters: newConsumer.rtpParameters
                }
                ackCb(clientParams)
            }
        }catch(err){
            console.log(err)
            ackCb('consumeFailed')
        }
    })

    socket.on('unpauseConsumer', async (data, ackCb) => {
        const { pid, kind } = data;  // Extract values properly
    
        const consumerToResume = client.downStreamTransports.find(t => {
            return t?.[kind]?.producerId === pid;
        });
    
        await consumerToResume[kind].resume();
    
        if (typeof ackCb === "function") {
            ackCb();  // Send acknowledgment back to the client
        }
    });
    

})

httpServer.listen(config.port)