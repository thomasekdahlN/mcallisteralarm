'use strict';

import type Homey from 'homey/lib/Homey';
import type EventLog from './EventLog';
import { Mode, SETTINGS_KEYS } from './types';

export type ModeChangeListener = (mode: Mode, previous: Mode) => void;

export default class StateMachine {

  private mode: Mode;
  private modeChangedAt: number;
  private exitTimer: NodeJS.Timeout | null = null;
  private entryTimer: NodeJS.Timeout | null = null;
  private listeners: ModeChangeListener[] = [];

  constructor(
    private readonly homey: Homey,
    private readonly log: EventLog,
  ) {
    const stored = this.homey.settings.get(SETTINGS_KEYS.MODE) as Mode | null;
    this.mode = stored ?? 'disarmed';
    const storedTs = this.homey.settings.get(SETTINGS_KEYS.MODE_CHANGED_AT) as number | null;
    this.modeChangedAt = typeof storedTs === 'number' ? storedTs : Date.now();
  }

  getMode(): Mode {
    return this.mode;
  }

  getModeChangedAt(): number {
    return this.modeChangedAt;
  }

  onModeChange(listener: ModeChangeListener): void {
    this.listeners.push(listener);
  }

  async setMode(next: Mode, exitDelaySeconds?: number): Promise<void> {
    if (this.mode === next) return;

    this.clearTimers();

    if (next === 'armed_away' && exitDelaySeconds && exitDelaySeconds > 0) {
      this.log.add('info', `Aktiverer Borte-modus om ${exitDelaySeconds}s (Exit Delay).`);
      this.exitTimer = this.homey.setTimeout(() => {
        this.exitTimer = null;
        this.applyMode('armed_away');
      }, exitDelaySeconds * 1000);
      return;
    }

    this.applyMode(next);
  }

  startEntryDelay(entryDelaySeconds: number, onTimeout: () => void): void {
    if (this.entryTimer) return;
    this.log.add('warning', `Innpassering oppdaget. Nedtelling ${entryDelaySeconds}s.`);
    this.entryTimer = this.homey.setTimeout(() => {
      this.entryTimer = null;
      onTimeout();
    }, entryDelaySeconds * 1000);
  }

  cancelEntryDelay(): void {
    if (!this.entryTimer) return;
    this.homey.clearTimeout(this.entryTimer);
    this.entryTimer = null;
  }

  isEntryDelayActive(): boolean {
    return this.entryTimer !== null;
  }

  isExitDelayActive(): boolean {
    return this.exitTimer !== null;
  }

  private applyMode(next: Mode): void {
    const previous = this.mode;
    this.mode = next;
    this.modeChangedAt = Date.now();
    this.homey.settings.set(SETTINGS_KEYS.MODE, next);
    this.homey.settings.set(SETTINGS_KEYS.MODE_CHANGED_AT, this.modeChangedAt);
    this.log.add('info', `Modus endret: ${previous} → ${next}.`);
    for (const listener of this.listeners) {
      try {
        listener(next, previous);
      } catch (err) {
        this.log.add('warning', `Mode listener feilet: ${(err as Error).message}`);
      }
    }
  }

  private clearTimers(): void {
    if (this.exitTimer) {
      this.homey.clearTimeout(this.exitTimer);
      this.exitTimer = null;
    }
    if (this.entryTimer) {
      this.homey.clearTimeout(this.entryTimer);
      this.entryTimer = null;
    }
  }

}
