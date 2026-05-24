'use strict';

import type { GuardSettings, Mode } from './lib/types';

interface AppRef {
  getSettings(): GuardSettings;
  saveSettings(settings: Partial<GuardSettings>): GuardSettings;
  setMode(mode: Mode): Promise<void>;
  triggerPanic(): Promise<void>;
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
    const zones = await homey.app.homeyApi.zones.getZones();
    return Object.values(zones).map((z: any) => ({
      id: z.id,
      name: z.name,
      parent: z.parent ?? null,
    }));
  },

  async getSettings({ homey }: Ctx) {
    return homey.app.getSettings();
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

};
