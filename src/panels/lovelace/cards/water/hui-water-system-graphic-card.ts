import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing, svg } from "lit";
import type { PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../../../components/ha-card";
import type { EnergyData } from "../../../../data/energy";
import {
  formatFlowRateShort,
  getEnergyDataCollection,
  getFlowRateFromState,
} from "../../../../data/energy";
import { SubscribeMixin } from "../../../../mixins/subscribe-mixin";
import type { HomeAssistant } from "../../../../types";
import type { LovelaceCard, LovelaceGridOptions } from "../../types";
import type { WaterSystemGraphicCardConfig } from "../types";

const DEFAULT_CONFIG: Partial<WaterSystemGraphicCardConfig> = {
  title: "Water system",
};

const TANK_PERCENT_PATTERNS = [/tank/i, /water/i, /(level|pct|percent|percentage)/i];
const TANK_VOLUME_PATTERNS = [/tank/i, /water/i, /(liter|litre|volume|remaining)/i];
const PUMP_PATTERNS = [/pump/i, /water|well|pressure/i];
const WATER_MAKER_PATTERNS = [/(water.?maker|desal|desalinator|reverse.?osmosis|maker)/i];

@customElement("hui-water-system-graphic-card")
export class HuiWaterSystemGraphicCard
  extends SubscribeMixin(LitElement)
  implements LovelaceCard
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public layout?: string;

  @state() private _config?: WaterSystemGraphicCardConfig;

  @state() private _data?: EnergyData;

  @state() private _discovered = {
    tankLevel: undefined as string | undefined,
    tankVolume: undefined as string | undefined,
    pumpState: undefined as string | undefined,
    pumpFlowRate: undefined as string | undefined,
    pumpPower: undefined as string | undefined,
    waterMakerState: undefined as string | undefined,
    waterMakerFlowRate: undefined as string | undefined,
  };

  protected hassSubscribeRequiredHostProps = ["_config"];

  public setConfig(config: WaterSystemGraphicCardConfig): void {
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  public hassSubscribe(): UnsubscribeFunc[] {
    return [
      getEnergyDataCollection(this.hass, {
        key: this._config?.collection_key,
      }).subscribe((data) => {
        this._data = data;
      }),
    ];
  }

  public getCardSize(): Promise<number> | number {
    return 3;
  }

  getGridOptions(): LovelaceGridOptions {
    return {
      columns: 12,
      min_columns: 6,
      rows: 4,
      min_rows: 3,
    };
  }

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    return (
      changedProps.has("_config") ||
      changedProps.has("_data") ||
      changedProps.has("hass")
    );
  }

  protected willUpdate(changedProps: PropertyValues): void {
    if (changedProps.has("hass") || changedProps.has("_config")) {
      this._discoverEntities();
    }
  }

  protected render() {
    if (!this._config || !this._data) {
      return nothing;
    }

    const tankLevelEntity =
      this._config.entity_tank_level || this._discovered.tankLevel;
    const tankVolumeEntity =
      this._config.entity_tank_volume || this._discovered.tankVolume;
    const tankCapacityEntity = this._config.entity_tank_capacity;
    const pumpStateEntity =
      this._config.entity_pump_state || this._discovered.pumpState;
    const pumpFlowRateEntity =
      this._config.entity_pump_flow_rate || this._discovered.pumpFlowRate;
    const pumpPowerEntity =
      this._config.entity_pump_power || this._discovered.pumpPower;
    const waterMakerStateEntity =
      this._config.entity_water_maker_state || this._discovered.waterMakerState;
    const waterMakerFlowRateEntity =
      this._config.entity_water_maker_flow_rate || this._discovered.waterMakerFlowRate;

    const tankLevel = this._readPercent(
      tankLevelEntity,
      tankVolumeEntity,
      tankCapacityEntity
    );
    const tankVolume = this._readLiters(
      tankVolumeEntity,
      tankCapacityEntity,
      tankLevel
    );

    const flowRateLMin = pumpFlowRateEntity
      ? getFlowRateFromState(this.hass.states[pumpFlowRateEntity])
      : undefined;

    const pumpPowerW = this._readPowerW(pumpPowerEntity);

    const pumpOn = this._isPumpOn(pumpStateEntity, flowRateLMin, pumpPowerW);

    const waterMakerFlowRateLMin = waterMakerFlowRateEntity
      ? getFlowRateFromState(this.hass.states[waterMakerFlowRateEntity])
      : undefined;
    const waterMakerOn = this._isPumpOn(
      waterMakerStateEntity,
      waterMakerFlowRateLMin,
      undefined
    );

    const monitorRows = this._buildMonitorRows(
      pumpFlowRateEntity,
      flowRateLMin,
      pumpPowerW,
      pumpOn,
      waterMakerFlowRateEntity,
      waterMakerFlowRateLMin,
      waterMakerOn
    );

    const fillHeight = Math.round((Math.max(0, Math.min(100, tankLevel || 0)) / 100) * 112);
    const fillY = 128 - fillHeight;

    return html`
      <ha-card .header=${this._config.title}>
        <div class="card-content">
          <div class="system-graphic">
            <svg viewBox="0 0 520 190" xmlns="http://www.w3.org/2000/svg" role="img">
              <rect x="18" y="16" width="88" height="126" rx="10" class="tank-shell" />
              ${tankLevel !== undefined
                ? svg`<rect x="24" y="${fillY}" width="76" height="${fillHeight}" rx="6" class="tank-fill" />`
                : nothing}

              <text x="62" y="78" text-anchor="middle" class="tank-value">
                ${tankLevel !== undefined ? `${Math.round(tankLevel)}%` : "--"}
              </text>
              <text x="62" y="96" text-anchor="middle" class="tank-subvalue">
                ${tankVolume !== undefined ? `${Math.round(tankVolume)} L` : "--"}
              </text>

              <path d="M108 78 H292" class="pipe" />

              ${pumpOn
                ? svg`
                    <circle r="3" class="pulse-dot">
                      <animateMotion dur="1.5s" repeatCount="indefinite">
                        <mpath href="#pipe-path" />
                      </animateMotion>
                    </circle>
                  `
                : nothing}

              <path id="pipe-path" d="M108 78 H292" fill="none" />

              <circle cx="332" cy="78" r="34" class="pump-shell ${pumpOn
                ? "is-on"
                : "is-off"}" />
              <text x="332" y="83" text-anchor="middle" class="pump-label">PUMP</text>

              <path d="M366 78 H490" class="pipe out" />

              <text x="18" y="164" class="meta-label">Flow</text>
              <text x="64" y="164" class="meta-value">
                ${flowRateLMin !== undefined
                  ? formatFlowRateShort(
                      this.hass.locale,
                      this.hass.config.unit_system.length,
                      flowRateLMin
                    )
                  : "--"}
              </text>

              <text x="220" y="164" class="meta-label">Pump</text>
              <text x="266" y="164" class="meta-value">
                ${pumpOn ? "On" : "Off"}
                ${pumpPowerW !== undefined ? ` · ${Math.round(pumpPowerW)} W` : ""}
              </text>
            </svg>
          </div>

          ${monitorRows.length
            ? html`<div class="monitor-list">
                ${monitorRows.map(
                  (row) => html`<div class="monitor-row">
                    <span class="name">${row.name}</span>
                    <span class="state ${row.on ? "on" : "off"}">
                      ${row.on ? "Running" : "Idle"}
                    </span>
                    <span class="metric">
                      ${row.flow !== undefined
                        ? formatFlowRateShort(
                            this.hass.locale,
                            this.hass.config.unit_system.length,
                            row.flow
                          )
                        : "--"}
                      ${row.powerW !== undefined
                        ? html` · ${Math.round(row.powerW)} W`
                        : nothing}
                    </span>
                  </div>`
                )}
              </div>`
            : nothing}
        </div>
      </ha-card>
    `;
  }

  private _buildMonitorRows(
    pumpFlowRateEntity: string | undefined,
    pumpFlowRateLMin: number | undefined,
    pumpPowerW: number | undefined,
    pumpOn: boolean,
    waterMakerFlowRateEntity: string | undefined,
    waterMakerFlowRateLMin: number | undefined,
    waterMakerOn: boolean
  ): Array<{ name: string; on: boolean; flow?: number; powerW?: number }> {
    const rows: Array<{ name: string; on: boolean; flow?: number; powerW?: number }> = [];

    rows.push({
      name: "Main pump",
      on: pumpOn,
      flow: pumpFlowRateLMin,
      powerW: pumpPowerW,
    });

    if (waterMakerFlowRateEntity || this._config?.entity_water_maker_state) {
      rows.push({
        name: "Water maker",
        on: waterMakerOn,
        flow: waterMakerFlowRateLMin,
      });
    }

    const excluded = new Set(
      [pumpFlowRateEntity, waterMakerFlowRateEntity].filter(Boolean) as string[]
    );

    for (const device of this._data?.prefs.device_consumption_water || []) {
      if (!device.stat_rate || excluded.has(device.stat_rate)) {
        continue;
      }
      const idCheck = `${device.name || ""} ${device.stat_rate}`;
      if (!PUMP_PATTERNS.some((p) => p.test(idCheck))) {
        continue;
      }

      const flow = getFlowRateFromState(this.hass.states[device.stat_rate]);
      rows.push({
        name: device.name || this.hass.states[device.stat_rate]?.attributes.friendly_name || device.stat_rate,
        on: (flow || 0) > 0.05,
        flow,
      });
    }

    if (this._config?.monitor_entities) {
      for (const entityId of this._config.monitor_entities) {
        const state = this.hass.states[entityId];
        if (!state) continue;
        const flow = getFlowRateFromState(state);
        const powerW = this._readPowerW(entityId);
        const on = this._isPumpOn(entityId, flow, powerW);

        rows.push({
          name: state.attributes.friendly_name || entityId,
          on,
          flow,
          powerW,
        });
      }
    }

    return rows;
  }

  private _discoverEntities() {
    const states = Object.values(this.hass.states);

    const pick = (
      domain: string,
      matcher: (entity: (typeof states)[number]) => boolean
    ) => states.find((s) => s.entity_id.startsWith(`${domain}.`) && matcher(s))?.entity_id;

    if (!this._config?.entity_tank_level) {
      this._discovered.tankLevel = pick(
        "sensor",
        (s) =>
          s.attributes.unit_of_measurement === "%" &&
          TANK_PERCENT_PATTERNS.every((r) => r.test(s.entity_id))
      );
    }

    if (!this._config?.entity_tank_volume) {
      this._discovered.tankVolume = pick("sensor", (s) => {
        const unit = s.attributes.unit_of_measurement;
        const isVolumeUnit = unit === "L" || unit === "l" || unit === "m³" || unit === "gal";
        return isVolumeUnit && TANK_VOLUME_PATTERNS.some((r) => r.test(s.entity_id));
      });
    }

    if (!this._config?.entity_pump_state) {
      this._discovered.pumpState =
        pick("binary_sensor", (s) => PUMP_PATTERNS.some((r) => r.test(s.entity_id))) ||
        pick("switch", (s) => PUMP_PATTERNS.some((r) => r.test(s.entity_id)));
    }

    if (!this._config?.entity_pump_flow_rate) {
      this._discovered.pumpFlowRate = pick("sensor", (s) => {
        const dc = s.attributes.device_class;
        return dc === "volume_flow_rate" && PUMP_PATTERNS.some((r) => r.test(s.entity_id));
      });
    }

    if (!this._config?.entity_pump_power) {
      this._discovered.pumpPower = pick("sensor", (s) => {
        const dc = s.attributes.device_class;
        return dc === "power" && PUMP_PATTERNS.some((r) => r.test(s.entity_id));
      });
    }

    if (!this._config?.entity_water_maker_state) {
      this._discovered.waterMakerState =
        pick("binary_sensor", (s) =>
          WATER_MAKER_PATTERNS.some((r) => r.test(s.entity_id))
        ) ||
        pick("switch", (s) => WATER_MAKER_PATTERNS.some((r) => r.test(s.entity_id)));
    }

    if (!this._config?.entity_water_maker_flow_rate) {
      this._discovered.waterMakerFlowRate = pick("sensor", (s) => {
        const dc = s.attributes.device_class;
        return (
          dc === "volume_flow_rate" &&
          WATER_MAKER_PATTERNS.some((r) => r.test(s.entity_id))
        );
      });
    }
  }

  private _readPercent(
    levelEntity?: string,
    volumeEntity?: string,
    capacityEntity?: string
  ): number | undefined {
    if (levelEntity) {
      const state = this.hass.states[levelEntity];
      const val = state ? Number.parseFloat(state.state) : NaN;
      if (!Number.isNaN(val)) {
        return Math.max(0, Math.min(100, val));
      }
    }

    const volume = this._readLiters(volumeEntity);
    const capacity = this._readLiters(capacityEntity);
    if (volume !== undefined && capacity && capacity > 0) {
      return Math.max(0, Math.min(100, (volume / capacity) * 100));
    }

    return undefined;
  }

  private _readLiters(
    volumeEntity?: string,
    capacityEntity?: string,
    levelPercent?: number
  ): number | undefined {
    if (volumeEntity) {
      const s = this.hass.states[volumeEntity];
      if (s) {
        const raw = Number.parseFloat(s.state);
        if (!Number.isNaN(raw)) {
          const unit = s.attributes.unit_of_measurement;
          if (unit === "m³") return raw * 1000;
          if (unit === "gal") return raw * 3.785411784;
          return raw;
        }
      }
    }

    if (capacityEntity && levelPercent !== undefined) {
      const cap = this._readLiters(capacityEntity);
      if (cap !== undefined) {
        return (cap * levelPercent) / 100;
      }
    }

    return undefined;
  }

  private _readPowerW(entityId?: string): number | undefined {
    if (!entityId) return undefined;
    const state = this.hass.states[entityId];
    if (!state) return undefined;
    const value = Number.parseFloat(state.state);
    if (Number.isNaN(value)) return undefined;

    const unit = state.attributes.unit_of_measurement;
    if (unit === "kW") return value * 1000;
    if (unit === "MW") return value * 1000000;
    return value;
  }

  private _isPumpOn(
    stateEntityId: string | undefined,
    flowRateLMin: number | undefined,
    pumpPowerW: number | undefined
  ): boolean {
    if (stateEntityId) {
      const state = this.hass.states[stateEntityId]?.state;
      if (state && state !== "unknown" && state !== "unavailable") {
        return state === "on" || state === "true";
      }
    }

    if (flowRateLMin !== undefined && flowRateLMin > 0.05) {
      return true;
    }

    return pumpPowerW !== undefined && pumpPowerW > 2;
  }

  static styles = css`
    ha-card {
      height: 100%;
    }

    .card-content {
      padding-top: 8px;
    }

    .system-graphic {
      width: 100%;
    }

    svg {
      width: 100%;
      height: 180px;
      display: block;
    }

    .tank-shell {
      fill: none;
      stroke: var(--divider-color);
      stroke-width: 2;
    }

    .tank-fill {
      fill: color-mix(in srgb, var(--energy-water-color) 78%, transparent);
      transition: y 0.4s ease, height 0.4s ease;
    }

    .tank-value {
      font-size: 16px;
      font-weight: 600;
      fill: var(--primary-text-color);
    }

    .tank-subvalue {
      font-size: 12px;
      fill: var(--secondary-text-color);
    }

    .pipe {
      stroke: var(--energy-water-color);
      stroke-width: 4;
      fill: none;
      opacity: 0.8;
    }

    .pipe.out {
      opacity: 0.5;
    }

    .pump-shell {
      fill: color-mix(in srgb, var(--card-background-color) 90%, transparent);
      stroke: var(--divider-color);
      stroke-width: 2;
      transition: stroke 0.2s ease;
    }

    .pump-shell.is-on {
      stroke: var(--energy-water-color);
      filter: drop-shadow(0 0 6px color-mix(in srgb, var(--energy-water-color) 45%, transparent));
    }

    .pump-label {
      font-size: 11px;
      fill: var(--primary-text-color);
      font-weight: 600;
      letter-spacing: 0.6px;
    }

    .pulse-dot {
      fill: var(--energy-water-color);
    }

    .meta-label {
      fill: var(--secondary-text-color);
      font-size: 12px;
    }

    .meta-value {
      fill: var(--primary-text-color);
      font-size: 12px;
      font-weight: 500;
    }

    .monitor-list {
      margin-top: 4px;
      border-top: 1px solid var(--divider-color);
      padding-top: 6px;
      display: grid;
      gap: 4px;
      font-size: 12px;
    }

    .monitor-row {
      display: grid;
      grid-template-columns: minmax(120px, 1fr) auto auto;
      gap: 8px;
      align-items: center;
    }

    .monitor-row .name {
      color: var(--primary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .monitor-row .state {
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }

    .monitor-row .state.on {
      color: var(--energy-water-color);
    }

    .monitor-row .state.off {
      color: var(--secondary-text-color);
    }

    .monitor-row .metric {
      color: var(--secondary-text-color);
      font-variant-numeric: tabular-nums;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-water-system-graphic-card": HuiWaterSystemGraphicCard;
  }
}
