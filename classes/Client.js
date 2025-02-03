const config = require('../config/config.js')   

class Client{
    constructor(userName, socket){
        this.userName = userName
        this.socket = socket

        // instead of calling this producer transport, call it upstream, this client transport is for sending data
        this.upstreamTransport = null
        this.producer = {}
        // instead of calling this consumer transport, call it downStream, this client transport is for pulling data
        this.downStreamTransports = []
        // it contains transport, associated audio and video pids, audio and video producers


        // An array of consumers, each with 2 parts
        // this.consumers = []
        // Connects this client to Mediasoup's WebRTC router.
        // this.rooms = []
        this.room = null // this will be a Room Object
    }

    addTransport(type, audioPid= null, videoPid = null){
        return new Promise(async (resolve, reject) => {
            const { listenIps, initialAvailableOutgoingBitrate, maxincomingBitrate } = config.webRtcTransport
            const transport = await this.room.router.createWebRtcTransport({
                enableUdp : true,
                enableTcp : true,
                preferUdp : true,
                listenInfos: listenIps,
                initialAvailableOutgoingBitrate,
                })

                if(maxincomingBitrate){
                    // maxincomingbitrate limit the incoming bandwidth from this transport
                    try{
                        await transport.setMaxIncomingBitrate(maxincomingBitrate)
                    }catch(err){
                        console.log("Error Setting bitrate")
                    }
                    
                }
                // console.log(transport)
                const clientTransportParams = {
                    id: transport.id,
                    iceParameters : transport.iceParameters,
                    iceCandidates : transport.iceCandidates,
                    dtlsParameters: transport.dtlsParameters,
                }
                if(type === 'producer'){
                    // set the new transport to client's upstream transport
                    this.upstreamTransport = transport
                    // setInterval(async()=>{
                    //     const stats = await this.upstreamTransport.getStats()
                    //     for(const report of stats.values()){
                    //         console.log(report.type)
                    //         if(report.type === 'webrtc-transport'){
                    //             console.log(report.bytesReceived,'-',report.rtpBytesReceived)
                    //             // console.log(report)
                    //         }
                    //     }
                    // },1000)
                } else if(type === 'consumer'){
                    // add the new transport and the 2 pids, to the client's array of downstream transports
                    this.downStreamTransports.push({transport, associatedVideoPid : videoPid, associatedAudioPid : audioPid})
                }
                resolve(clientTransportParams)
            })
    }


    addProducer(kind, newProducer){
        this.producer[kind] = newProducer
        if(kind === "audio"){
            // add this to our active speaker list
            this.room.activeSpeakerObserver.addProducer({
                producerId: newProducer.id,
            })
        }
    }
    addConsumer(kind, newConsumer, downStreamTransports) {
        downStreamTransports[kind] = newConsumer
    }
} 

module.exports = Client