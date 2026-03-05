import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/entity/ha-statistic-picker";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-dialog";
import type { WindSourceTypeEnergyPreference } from "../../../../data/energy";
import {
  emptyWindEnergyPreference,
  energyStatisticHelpUrl,
} from "../../../../data/energy";
import { getSensorDeviceClassConvertibleUnits } from "../../../../data/sensor";
import type { HassDialog } from "../../../../dialogs/make-dialog-manager";
import { haStyle, haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant, ValueChangedEvent } from "../../../../types";
import type { EnergySettingsWindDialogParams } from "./show-dialogs-energy";

const energyUnitClasses = ["energy"];
const powerUnitClasses = ["power"];

@customElement("dialog-energy-wind-settings")
export class DialogEnergyWindSettings
  extends LitElement
  implements HassDialog<EnergySettingsWindDialogParams>
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: EnergySettingsWindDialogParams;

  @state() private _open = false;

  @state() private _source?: WindSourceTypeEnergyPreference;

  @state() private _energy_units?: string[];

  @state() private _power_units?: string[];

  @state() private _error?: string;

  private _excludeList?: string[];

  private _excludeListPower?: string[];

  public async showDialog(
    params: EnergySettingsWindDialogParams
  ): Promise<void> {
    this._params = params;
    this._source = params.source
      ? { ...params.source }
      : emptyWindEnergyPreference();
    this._energy_units = (
      await getSensorDeviceClassConvertibleUnits(this.hass, "energy")
    ).units;
    this._power_units = (
      await getSensorDeviceClassConvertibleUnits(this.hass, "power")
    ).units;
    this._excludeList = this._params.wind_sources
      .map((entry) => entry.stat_energy_from)
      .filter((id) => id !== this._source?.stat_energy_from);
    this._excludeListPower = this._params.wind_sources
      .map((entry) => entry.stat_rate)
      .filter((id) => id && id !== this._source?.stat_rate) as string[];

    this._open = true;
  }

  public closeDialog() {
    this._open = false;
    return true;
  }

  private _dialogClosed() {
    this._params = undefined;
    this._source = undefined;
    this._error = undefined;
    this._excludeList = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._params || !this._source) {
      return nothing;
    }

    return html`
      <ha-dialog
        .hass=${this.hass}
        .open=${this._open}
        header-title=${this.hass.localize(
          "ui.panel.config.energy.wind.dialog.header"
        )}
        prevent-scrim-close
        @closed=${this._dialogClosed}
      >
        ${this._error ? html`<p class="error">${this._error}</p>` : ""}

        <p>
          ${this.hass.localize(
            "ui.panel.config.energy.wind.dialog.intro"
          )}
        </p>

        <ha-statistic-picker
          .hass=${this.hass}
          .helpMissingEntityUrl=${energyStatisticHelpUrl}
          .includeUnitClass=${energyUnitClasses}
          .value=${this._source.stat_energy_from}
          .label=${this.hass.localize(
            "ui.panel.config.energy.wind.dialog.wind_production_energy"
          )}
          .excludeStatistics=${this._excludeList}
          @value-changed=${this._statisticChanged}
          .helper=${this.hass.localize(
            "ui.panel.config.energy.wind.dialog.entity_para",
            { unit: this._energy_units?.join(", ") || "" }
          )}
          autofocus
        ></ha-statistic-picker>

        <ha-statistic-picker
          .hass=${this.hass}
          .includeUnitClass=${powerUnitClasses}
          .value=${this._source.stat_rate}
          .label=${this.hass.localize(
            "ui.panel.config.energy.wind.dialog.wind_production_power"
          )}
          .excludeStatistics=${this._excludeListPower}
          @value-changed=${this._powerStatisticChanged}
          .helper=${this.hass.localize(
            "ui.panel.config.energy.wind.dialog.entity_para",
            { unit: this._power_units?.join(", ") || "" }
          )}
        ></ha-statistic-picker>

        <ha-dialog-footer slot="footer">
          <ha-button
            appearance="plain"
            @click=${this.closeDialog}
            slot="secondaryAction"
          >
            ${this.hass.localize("ui.common.cancel")}
          </ha-button>
          <ha-button
            @click=${this._save}
            .disabled=${!this._source.stat_energy_from}
            slot="primaryAction"
          >
            ${this.hass.localize("ui.common.save")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _statisticChanged(ev: ValueChangedEvent<string>) {
    this._source = { ...this._source!, stat_energy_from: ev.detail.value };
  }

  private _powerStatisticChanged(ev: ValueChangedEvent<string>) {
    this._source = {
      ...this._source!,
      stat_rate: ev.detail.value || undefined,
    };
  }

  private async _save() {
    try {
      await this._params!.saveCallback(this._source!);
      this.closeDialog();
    } catch (err: any) {
      this._error = err.message;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      haStyleDialog,
      css`
        ha-statistic-picker {
          display: block;
          width: 100%;
          margin-bottom: var(--ha-space-4);
        }
        p {
          margin-top: 0;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-energy-wind-settings": DialogEnergyWindSettings;
  }
}
