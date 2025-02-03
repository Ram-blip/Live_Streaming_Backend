const config = require('../config/config.js');

class Client {
    constructor(userName, socket) {
        this.userName = userName;
        this.socket = socket;
        this.isPresenter = false;

        this.upstreamTransport = null;
        this.producer = {};
        this.downStreamTransports = [];
        this.room = null;
    }

    addTransport(type, audioPid = null, videoPid = null) {
        return new Promise(async (resolve, reject) => {
            const { listenIps, initialAvailableOutgoingBitrate, maxincomingBitrate } = config.webRtcTransport;
            const transport = await this.room.router.createWebRtcTransport({
                enableUdp: true,
                enableTcp: true,
                preferUdp: true,
                listenInfos: listenIps,
                initialAvailableOutgoingBitrate,
            });

            if (maxincomingBitrate) {
                try {
                    await transport.setMaxIncomingBitrate(maxincomingBitrate);
                } catch(err) {
                    console.log("Error Setting bitrate");
                }
            }

            const clientTransportParams = {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            };

            if (type === 'producer') {
                this.upstreamTransport = transport;
            } else if (type === 'consumer') {
                this.downStreamTransports.push({
                    transport,
                    associatedVideoPid: videoPid,
                    associatedAudioPid: audioPid
                });
            }
            
            resolve(clientTransportParams);
        });
    }

    addProducer(kind, newProducer) {
        this.producer[kind] = newProducer;
        if (kind === "audio" && this.isPresenter) {
            this.room.activeSpeakerObserver.addProducer({
                producerId: newProducer.id,
            });
        }
    }

    addConsumer(kind, newConsumer, downStreamTransports) {
        downStreamTransports[kind] = newConsumer;
    }
}

module.exports = Client;