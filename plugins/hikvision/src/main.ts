import sdk, { MediaObject, Camera, ScryptedInterface } from "@scrypted/sdk";
import { EventEmitter, Stream } from "stream";
import { HikVisionCameraAPI } from "./hikvision-camera-api";
import { Destroyable, RtspProvider, RtspSmartCamera } from "../../rtsp/src/rtsp";
import { HikVisionCameraEvent } from "./hikvision-camera-api";
import { removeListener } from "process";
const { mediaManager } = sdk;

class HikVisionCamera extends RtspSmartCamera implements Camera {
    listenEvents() {
        let motionTimeout: NodeJS.Timeout;
        const ret = new EventEmitter() as (EventEmitter & Destroyable);
        ret.destroy = () => {
        };
        (async () => {
            const api = this.createClient();
            try {
                const events = await api.listenEvents(this.isAnalogueCamera(), this.getRtspChannel());
                ret.destroy = () => {
                    events.removeAllListeners();
                    events.destroy();
                };

                events.on('close', () => ret.emit('error', new Error('close')));
                events.on('error', e => ret.emit('error', e));
                events.on('event', (event: HikVisionCameraEvent) => {
                    if (event === HikVisionCameraEvent.MotionDetected) {
                        this.motionDetected = true;
                        clearTimeout(motionTimeout);
                        motionTimeout = setTimeout(() => this.motionDetected = false, 30000);
                    }
                })
            }
            catch (e) {
                ret.emit('error', e);
            }
        })();
        return ret;
    }

    createClient() {
        const client = new HikVisionCameraAPI(this.getHttpAddress(), this.getUsername(), this.getPassword());

        (async () => {
            const streamSetup = await client.checkStreamSetup();
            if (streamSetup.videoCodecType !== 'H.264') {
                this.log.a(`This camera is configured for ${streamSetup.videoCodecType} on the main channel. Configuring it it for H.264 is recommended for optimal performance.`);
            }
            if (!this.isAudioDisabled() && streamSetup.audioCodecType && streamSetup.audioCodecType !== 'AAC') {
                this.log.a(`This camera is configured for ${streamSetup.audioCodecType} on the main channel. Configuring it it for AAC is recommended for optimal performance.`);
            }
        })();
        return client;
    }

    async takePicture(): Promise<MediaObject> {
        const api = this.createClient();
        return mediaManager.createMediaObject(api.jpegSnapshot(this.getRtspChannel()), 'image/jpeg');
    }

    async getSettings() {
        return [
            ...await this.getUrlSettings(),
            {
                key: 'isAnalogueCamera',
                title: 'Is this an analogue camera?',
                description: 'Turn this on if you are using ip cameras. This will use the URL override, channel, and URL parameters to construct the RTSP stream URL.',
                type: 'boolean',
                value: this.storage.getItem('isAnalogueCamera'),
            },
            {
                key: 'rtspChannel',
                title: 'Channel number',
                description: "What channel does this camera use?",
                placeholder: '1/2/3/etc.',
                value: this.storage.getItem('rtspChannel'),
            },
            {
                key: 'rtspUrlParams',
                title: 'RTSP URL Params Override',
                description: "Override the RTSP URL parameters - ?transportmode=unicast&...",
                placeholder: '?transportmode=unicast&...',
                value: this.storage.getItem('rtspUrlParams'),
            },
        ]
    }

    isAnalogueCamera() {
        return this.storage.getItem('isAnalogueCamera') === 'true';
    }

    getRtspChannel() {
        return this.storage.getItem('rtspChannel') || ''
    }

    getRtspUrl() {
        return this.storage.getItem('rtspUrlOverride')
    }

    getRtspUrlParams() {
        return this.storage.getItem('rtspUrlParams') || '?transportmode=unicast'
    }

    getAnalogueCameraUrl() {
        const channel = this.getRtspChannel()
        const url = this.getRtspUrl()
        const params = this.getRtspUrlParams()

        return `${url}/${channel}01/${params}`
    }

    getRtspUrlOverride() {
        if (this.isAnalogueCamera() && !!this.getRtspChannel()) {
            return this.getAnalogueCameraUrl()
        }

        return this.getRtspUrl()
    }

    async getConstructedStreamUrl() {
        return `rtsp://${this.getRtspAddress()}/Streaming/Channels/101/?transportmode=unicast`;
    }
}

class HikVisionProvider extends RtspProvider {
    getAdditionalInterfaces() {
        return [
            ScryptedInterface.Camera,
            ScryptedInterface.MotionSensor,
        ];
    }

    createCamera(nativeId: string) {
        return new HikVisionCamera(nativeId);
    }
}

export default new HikVisionProvider();
