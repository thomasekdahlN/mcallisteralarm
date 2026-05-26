'use strict';

import type Homey from 'homey/lib/Homey';
import type EventLog from './EventLog';
import type LightAuthGuard from './LightAuthGuard';
import { isLight } from './Capabilities';
import { DEFAULT_BLINK_SECONDS, GuardSettings } from './types';

const BLUE_HUE = 0.66;
const RED_HUE = 0.0;

interface ZoneTask {
  stop: () => Promise<void>;
}

export default class MediaCaster {

  private active = new Map<string, ZoneTask>();

  constructor(
    private readonly homey: Homey,
    private readonly homeyApi: any,
    private readonly log: EventLog,
    private readonly lightAuth: LightAuthGuard,
    private readonly getSettings: () => GuardSettings,
  ) { }

  async startBlink(zoneId: string): Promise<void> {
    await this.stopZone(zoneId);
    const devices = await this.zoneDevices(zoneId);
    await this.startLightStrobe(zoneId, devices, [BLUE_HUE, RED_HUE]);
  }

  async stopZone(zoneId: string): Promise<void> {
    const task = this.active.get(zoneId);
    if (task) {
      try {
        await task.stop();
      } catch (err) {
        this.log.add('warning', `Stop zone feilet: ${(err as Error).message}`, zoneId);
      }
      this.active.delete(zoneId);
    }
    const devices = await this.zoneDevices(zoneId);
    for (const device of devices) {
      if (!isLight(device)) continue;
      try {
        this.lightAuth.registerOwnCommand(device.id, false);
        await device.setCapabilityValue({ capabilityId: 'onoff', value: false });
      } catch { /* best-effort */ }
    }
  }

  private async startLightStrobe(zoneId: string, devices: any[], hues: number[]): Promise<void> {
    const lights = devices.filter((d: any) => isLight(d));
    if (lights.length === 0) {
      this.log.add('warning', `Ingen lys å blinke i sone ${zoneId}.`, zoneId);
      return;
    }
    const settings = this.getSettings();
    const onSec = Math.max(1, settings.blink_on?.[zoneId] ?? DEFAULT_BLINK_SECONDS);
    const offSec = Math.max(1, settings.blink_off?.[zoneId] ?? DEFAULT_BLINK_SECONDS);
    const onMs = onSec * 1000;
    const offMs = offSec * 1000;

    let idx = 0;
    let stopped = false;
    let timer: NodeJS.Timeout | null = null;

    const turnOn = async (): Promise<void> => {
      const hue = hues[idx % hues.length] ?? BLUE_HUE;
      idx += 1;
      for (const light of lights) {
        try {
          this.lightAuth.registerOwnCommand(light.id, true);
          await light.setCapabilityValue({ capabilityId: 'onoff', value: true });
          if (light.capabilities.includes('light_hue')) {
            await light.setCapabilityValue({ capabilityId: 'light_hue', value: hue });
          }
          if (light.capabilities.includes('light_saturation')) {
            await light.setCapabilityValue({ capabilityId: 'light_saturation', value: 1 });
          }
          if (light.capabilities.includes('dim')) {
            await light.setCapabilityValue({ capabilityId: 'dim', value: 1 });
          }
        } catch { /* best-effort */ }
      }
    };

    const turnOff = async (): Promise<void> => {
      for (const light of lights) {
        try {
          this.lightAuth.registerOwnCommand(light.id, false);
          await light.setCapabilityValue({ capabilityId: 'onoff', value: false });
        } catch { /* best-effort */ }
      }
    };

    const cycle = async (): Promise<void> => {
      if (stopped) return;
      await turnOn();
      timer = this.homey.setTimeout(async () => {
        if (stopped) return;
        await turnOff();
        timer = this.homey.setTimeout(cycle, offMs);
      }, onMs);
    };

    cycle().catch(() => { /* best-effort */ });

    this.active.set(zoneId, {
      stop: async () => {
        stopped = true;
        if (timer) this.homey.clearTimeout(timer);
      },
    });
    this.log.add('info', `Starter blinkende lys i sone ${zoneId} (${onSec}s på / ${offSec}s av).`, zoneId);
  }

  private async zoneDevices(zoneId: string): Promise<any[]> {
    const devices = await this.homeyApi.devices.getDevices();
    return Object.values(devices).filter((d: any) => d.zone === zoneId);
  }

}
