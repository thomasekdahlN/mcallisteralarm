'use strict';

import type Homey from 'homey/lib/Homey';
import type EventLog from './EventLog';
import {
  CAMERA_ALARM_DEFAULT_COUNT, CAMERA_MOTION_DEFAULT_COUNT,
  GuardSettings, MAX_PUSH_PER_EVENT, SNAPSHOT_BURST_INTERVAL_MS,
} from './types';
import { isCamera } from './Capabilities';

/** Called when a camera successfully captures a snapshot. */
export type SnapshotListener = (zoneId: string, cameraId: string, cameraName: string, image: any) => void;

export default class CameraManager {

  private listeners: SnapshotListener[] = [];

  constructor(
    private readonly homey: Homey,
    private readonly homeyApi: any,
    private readonly log: EventLog,
    private readonly getSettings: () => GuardSettings,
  ) { }

  /** Register a listener that fires each time a snapshot is successfully captured. */
  onSnapshot(listener: SnapshotListener): void {
    this.listeners.push(listener);
  }

  /**
   * Capture a burst of snapshots when motion is detected.
   * @param zoneId  The zone where motion was detected.
   * @param isAlarm true when an alarm is currently active (uses camera_alarm_count, default 10).
   *                false otherwise (uses camera_motion_count, default 1; 0 = disabled).
   */
  async captureMotionBurst(zoneId: string, isAlarm: boolean): Promise<void> {
    const settings = this.getSettings();
    // Respect the global master switch for motion snapshots when no alarm is active.
    if (!isAlarm && settings.camera_motion_enabled === false) return;
    const cameras = await this.zoneCameras(zoneId);
    if (cameras.length === 0) return;

    for (const camera of cameras) {
      const count = isAlarm
        ? (settings.camera_alarm_count?.[camera.id] ?? CAMERA_ALARM_DEFAULT_COUNT)
        : (settings.camera_motion_count?.[camera.id] ?? CAMERA_MOTION_DEFAULT_COUNT);

      if (count <= 0) continue;

      this.log.add(
        'info',
        `Snapshot-burst: ${camera.name || camera.id} i sone ${zoneId} (${count} bilde${count > 1 ? 'r' : ''}, ${isAlarm ? 'alarm' : 'bevegelse'}).`,
        zoneId,
      );

      for (let i = 0; i < count; i += 1) {
        await this.captureOne(zoneId, camera);
        if (i < count - 1) {
          await new Promise<void>((resolve) => { this.homey.setTimeout(resolve, SNAPSHOT_BURST_INTERVAL_MS); });
        }
      }
    }
  }

  private async captureOne(zoneId: string, camera: any): Promise<void> {
    try {
      const camImage = camera.images && camera.images[0];
      if (!camImage) return;

      // Create a native Homey Image so the flow token can be routed to Telegram / FTP / Dropbox.
      const flowImage = await (this.homey.images as any).createImage();
      flowImage.setStream(async (stream: NodeJS.WritableStream) => {
        try {
          const readable = await camImage.getStream();
          readable.pipe(stream);
        } catch {
          (stream as NodeJS.WritableStream & { end: () => void }).end();
        }
      });

      for (const listener of this.listeners) {
        try { listener(zoneId, camera.id, camera.name || zoneId, flowImage); } catch { /* best-effort */ }
      }

      // Unregister after 60 s — long enough for any flow action to fetch it.
      this.homey.setTimeout(() => {
        (this.homey.images as any).unregisterImage(flowImage).catch(() => { /* best-effort */ });
      }, 60_000);
    } catch (err) {
      this.log.add('warning', `Snapshot-kall feilet for ${camera.name || camera.id}: ${(err as Error).message}`, zoneId);
    }
  }

  private async zoneCameras(zoneId: string): Promise<any[]> {
    const devices = await this.homeyApi.devices.getDevices();
    return Object.values(devices).filter((d: any) => d.zone === zoneId && isCamera(d));
  }

}
