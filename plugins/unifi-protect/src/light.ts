import { ScryptedDeviceBase, MotionSensor, TemperatureUnit, OnOff, Brightness } from "@scrypted/sdk";
import { UnifiProtect } from "./main";
import { ProtectLightConfig } from "@koush/unifi-protect";

export class UnifiLight extends ScryptedDeviceBase implements OnOff, Brightness, MotionSensor {
    constructor(public protect: UnifiProtect, nativeId: string, protectLight: Readonly<ProtectLightConfig>) {
        super(nativeId);
        this.temperatureUnit = TemperatureUnit.C;
    }
    async turnOff(): Promise<void> {
        await this.protect.api.updateLight(this.findLight(), { lightOnSettings: { isLedForceOn: true } });
    }
    async turnOn(): Promise<void> {
        await this.protect.api.updateLight(this.findLight(), { lightOnSettings: { isLedForceOn: false } });
    }
    async setBrightness(brightness: number): Promise<void> {
        const ledLevel = Math.round(((brightness as number) / 20) + 1);
        this.protect.api.updateLight(this.findLight(), { lightDeviceSettings: { ledLevel } });
    }

    findLight() {
        return this.protect.api.lights.find(light => light.id === this.nativeId);
    }

    updateState(light?: Readonly<ProtectLightConfig>) {
        light = light || this.findLight();
        if (!light)
            return;
        this.on = !!light.isLightOn;
        // The Protect ledLevel settings goes from 1 - 6. HomeKit expects percentages, so we convert it like so.
        this.brightness = (light.lightDeviceSettings.ledLevel - 1) * 20;
        this.setMotionDetected(!!light.isPirMotionDetected);
    }

    setMotionDetected(motionDetected: boolean) {
        this.motionDetected = motionDetected;
    }
}
