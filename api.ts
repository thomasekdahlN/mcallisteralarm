'use strict';

import type { GuardSettings, Mode } from './lib/types';
import { SUGGESTED_AUDIO_URLS, SUGGESTED_VIDEO_URLS } from './lib/types';

interface AppRef {
  getSettings(): GuardSettings;
  saveSettings(settings: Partial<GuardSettings>): GuardSettings;
  setMode(mode: Mode): Promise<void>;
  triggerPanic(): Promise<void>;
  testDeterrence(zoneId: string): Promise<void>;
  stopAlarm(): Promise<void>;
  homeyApi: any;
  stateMachine: { getMode(): Mode; getModeChangedAt(): number };
  deterrence: { getActiveZone(): string | null; getActiveMotionZone(): string | null };
  eventLog: { recent(limit?: number): unknown[] };
  escalation: { isInCrisis(): boolean; isPending(): boolean };
  simulation: { isRunning(): boolean };
}

interface Ctx { homey: { app: AppRef } }
interface BodyCtx<T> extends Ctx { body: T }

module.exports = {

  async getStatus({ homey }: Ctx) {
    const { app } = homey;
    return {
      mode: app.stateMachine.getMode(),
      modeChangedAt: app.stateMachine.getModeChangedAt(),
      activeDeterrenceZone: app.deterrence.getActiveZone(),
      activeMotionZone: app.deterrence.getActiveMotionZone(),
      simulationRunning: app.simulation.isRunning(),
      escalationPending: app.escalation.isPending(),
      inCrisis: app.escalation.isInCrisis(),
    };
  },

  async getEventLog({ homey }: Ctx) {
    return homey.app.eventLog.recent();
  },

  async getZones({ homey }: Ctx) {
    const [zones, devices] = await Promise.all([
      homey.app.homeyApi.zones.getZones(),
      homey.app.homeyApi.devices.getDevices(),
    ]);
    const caps: Record<string, { hasAudio: boolean; hasVideo: boolean; hasLights: boolean }> = {};
    for (const d of Object.values(devices) as any[]) {
      if (!d.zone || !Array.isArray(d.capabilities)) continue;
      const c = caps[d.zone] ?? (caps[d.zone] = { hasAudio: false, hasVideo: false, hasLights: false });
      if (d.capabilities.includes('speaker_playing') || d.capabilities.includes('volume_set')) c.hasAudio = true;
      if (d.capabilities.includes('cast_url')) c.hasVideo = true;
      if (d.capabilities.includes('onoff')
        && !d.capabilities.includes('alarm_motion')
        && !d.capabilities.includes('alarm_contact')) c.hasLights = true;
    }
    return Object.values(zones).map((z: any) => ({
      id: z.id,
      name: z.name,
      parent: z.parent ?? null,
      hasAudio: caps[z.id]?.hasAudio ?? false,
      hasVideo: caps[z.id]?.hasVideo ?? false,
      hasLights: caps[z.id]?.hasLights ?? false,
    }));
  },

  async getSettings({ homey }: Ctx) {
    return {
      ...homey.app.getSettings(),
      _suggested_audio_urls: SUGGESTED_AUDIO_URLS,
      _suggested_video_urls: SUGGESTED_VIDEO_URLS,
    };
  },

  async setSettings({ homey, body }: BodyCtx<Partial<GuardSettings>>) {
    return homey.app.saveSettings(body);
  },

  async setMode({ homey, body }: BodyCtx<{ mode: Mode }>) {
    await homey.app.setMode(body.mode);
    return { success: true };
  },

  async triggerPanic({ homey }: Ctx) {
    await homey.app.triggerPanic();
    return { success: true };
  },

  async testDeterrence({ homey, body }: BodyCtx<{ zoneId: string }>) {
    await homey.app.testDeterrence(body.zoneId);
    return { success: true };
  },

  async stopAlarm({ homey }: Ctx) {
    await homey.app.stopAlarm();
    return { success: true };
  },

};
