const config = require('../config/config.js');
const newDominantSpeaker = require('../utilities/newDominantSpeaker');

class Room {
    constructor(roomName, workerToUse) {
        this.roomName = roomName;
        this.worker = workerToUse;
        this.router = null;
        this.clients = [];
        this.activeSpeakerList = [];
        this.presenters = new Set(); // Track presenters
        this.MAX_PRESENTERS = 2; // Maximum allowed presenters
    }

    addClient(client) {
        this.clients.push(client);
    }

    // Check if a new presenter can be added
    canAddPresenter() {
        return this.presenters.size < this.MAX_PRESENTERS;
    }

    // Add a presenter
    addPresenter(clientId) {
        if (this.canAddPresenter()) {
            this.presenters.add(clientId);
            return true;
        }
        return false;
    }

    // Remove a presenter
    removePresenter(clientId) {
        this.presenters.delete(clientId);
    }

    // Get current presenter count
    getPresenterCount() {
        return this.presenters.size;
    }

    createRouter(io) {
        return new Promise(async (resolve, reject) => {
            this.router = await this.worker.createRouter({
                mediaCodecs: config.routerMediaCodecs
            });
            
            this.activeSpeakerObserver = await this.router.createActiveSpeakerObserver({
                interval: 300
            });
            
            this.activeSpeakerObserver.on('dominantspeaker', ds => 
                newDominantSpeaker(ds, this, io)
            );
            
            resolve();
        });
    }
}

module.exports = Room;