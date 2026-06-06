/**
 * battery-storage-card
 * v1.7.0 – + Batterie-Icon
 */

function _fmtDuration(mins) {
  if (mins < 60) return mins + ' Min.';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? h + ' Std. ' + m + ' Min.' : h + ' Std.';
}

function _dischargeSuffix(w, usableNow) {
  if (usableNow === null || usableNow <= 0) return '';
  const absKw = Math.abs(w) / 1000;
  if (absKw <= 0) return '';
  const mins = Math.round(usableNow / absKw * 60);
  return ' · ⏱ ' + _fmtDuration(mins);
}

function _chargeSuffix(w, usableCap, usableNow) {
  if (usableCap === null || usableNow === null) return '';
  const remaining = usableCap - usableNow;
  if (remaining <= 0) return '';
  const absKw = Math.abs(w) / 1000;
  if (absKw <= 0) return '';
  const mins = Math.round(remaining / absKw * 60);
  return ' · ⏱ ' + _fmtDuration(mins);
}

class BatteryStorageCard extends HTMLElement {

  static getStubConfig() {
    return {
      title:        'Batteriespeicher',
      soc_entity:   'sensor.battery_soc',
      capacity_kwh: 10,
      min_soc:      10,
      power_entity: '',
      power_invert:       false,
      soh_entity:         '',
      color_charging:       '#f06292',
      color_discharging:    '#4db6ac',
      energy_in_entity:        '',
      energy_out_entity:       '',
      energy_in_total_entity:  '',
      energy_out_total_entity: '',
      show_soh:          true,
      show_daily_energy: true,
    };
  }

  static getConfigForm() {
    return {
      schema: [
        { name: 'title',        selector: { text: {} } },
        { name: 'soc_entity',   required: true, selector: { entity: {} } },
        { name: 'capacity_kwh', selector: { number: { min: 0.1, max: 500, step: 0.1, unit_of_measurement: 'kWh', mode: 'box' } } },
        { name: 'min_soc',      selector: { number: { min: 0, max: 50, step: 1, unit_of_measurement: '%', mode: 'slider' } } },
        { name: 'soh_entity',   selector: { entity: {} } },
        { name: 'power_entity', selector: { entity: {} } },
        { name: 'power_invert',      selector: { boolean: {} } },
        { name: 'color_charging',    selector: { color_rgb: {} } },
        { name: 'color_discharging', selector: { color_rgb: {} } },
        { name: 'energy_in_entity',  selector: { entity: {} } },
        { name: 'energy_out_entity',       selector: { entity: {} } },
        { name: 'energy_in_total_entity',  selector: { entity: {} } },
        { name: 'energy_out_total_entity', selector: { entity: {} } },
        { name: 'show_soh',          selector: { boolean: {} } },
        { name: 'show_daily_energy', selector: { boolean: {} } },
      ],
      assertConfig: (config) => {
        if (!config.soc_entity) throw new Error('soc_entity is required');
      },
      computeLabel: (schema) => ({
        title:        '📝 Überschrift',
        soc_entity:   '🔋 SOC Entity (%)',
        capacity_kwh: '⚡ Gesamtkapazität (kWh)',
        min_soc:      '⬇️ Minimaler SOC / Entladetiefe (%)',
        soh_entity:   '🏥 SOH Entity (%)',
        power_entity: '⚡ Leistungssensor (W)',
        power_invert:      '🔁 Vorzeichen invertieren (positiv = Entladen)',
        color_charging:    '🎨 Farbe Laden',
        color_discharging: '🎨 Farbe Entladen',
        energy_in_entity:  '📥 Energie geladen heute (kWh)',
        energy_out_entity:       '📤 Energie entladen heute (kWh)',
        energy_in_total_entity:  '📥 Energie geladen gesamt (kWh)',
        energy_out_total_entity: '📤 Energie entladen gesamt (kWh)',
        show_soh:                '🏥 SOH anzeigen',
        show_daily_energy:       '📊 Tageswerte anzeigen',
      }[schema.name] ?? schema.name),
    };
  }

  setConfig(config) {
    if (!config.soc_entity) throw new Error('soc_entity is required');
    this._config = config;
    this._build();
    this._update();
  }

  set hass(hass) {
    this._hass = hass;
    this._update();
  }

  getCardSize() { return 3; }

  _build() {
    if (this.shadowRoot) return;
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host { --soc-color: #00c853; display: block; }
        ha-card {
          padding: 20px 24px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
          opacity: 0.5;
        }
        /* main row: icon left, content right */
        .main-row {
          display: flex;
          align-items: center;
          gap: 18px;
        }
        /* ── Battery icon ── */
        .battery-icon {
          flex-shrink: 0;
          width: 44px;
          position: relative;
        }
        .battery-icon svg {
          display: block;
          width: 44px;
          height: auto;
          overflow: visible;
        }
        /* ── Right content ── */
        .content { flex: 1; display: flex; flex-direction: column; gap: 6px; }
        .soc-row {
          display: flex;
          align-items: baseline;
          gap: 10px;
        }
        .soc-value {
          font-size: 52px;
          font-weight: 700;
          line-height: 1;
          color: var(--soc-color);
          transition: color 0.5s ease;
        }
        .soc-kwh {
          font-size: 16px;
          font-weight: 500;
          opacity: 0.6;
          display: flex;
          align-items: baseline;
          gap: 6px;
          flex-wrap: wrap;
        }
        .kwh-usable { font-size: 13px; opacity: 0.7; }
        /* Leistungsanzeige */
        .power-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          min-height: 22px;
        }
        .power-row.charging    { color: var(--color-charging, #f06292); }
        .power-row.discharging { color: var(--color-discharging, #4db6ac); }
        .power-row.idle        { opacity: 0.35; }
        .power-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: currentColor;
          flex-shrink: 0;
        }
        .charging    .power-dot { animation: blink 1s step-end infinite; }
        .discharging .power-dot { animation: blink 1.4s step-end infinite; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.15} }
        /* Balken */
        .bar-wrap { position: relative; }
        .bar-bg {
          height: 6px;
          border-radius: 6px;
          background: rgba(128,128,128,0.2);
          overflow: visible;
          position: relative;
        }
        .bar-fill {
          height: 100%;
          border-radius: 6px;
          background: var(--soc-color);
          transition: width 0.8s ease, background 0.5s ease;
        }
        .min-marker {
          position: absolute;
          top: -4px;
          width: 2px;
          height: 16px;
          background: rgba(255,255,255,0.4);
          border-radius: 2px;
          transform: translateX(-50%);
        }
        .min-label {
          font-size: 10px;
          opacity: 0.4;
          text-align: left;
          margin-top: 2px;
        }
        /* Status badge */
        .status-badge {
          position: absolute;
          top: 16px;
          right: 16px;
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.3px;
          transition: all 0.4s ease;
        }
        .status-badge.charging {
          background: rgba(var(--color-charging-rgb, 240,98,146), 0.15);
          color: var(--color-charging, #f06292);
          border: 1px solid rgba(var(--color-charging-rgb, 240,98,146), 0.4);
        }
        .status-badge.discharging {
          background: rgba(var(--color-discharging-rgb, 77,182,172), 0.15);
          color: var(--color-discharging, #4db6ac);
          border: 1px solid rgba(var(--color-discharging-rgb, 77,182,172), 0.4);
        }
        .status-badge.idle {
          background: rgba(128,128,128,0.1);
          color: rgba(128,128,128,0.6);
          border: 1px solid rgba(128,128,128,0.2);
        }
        .status-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: currentColor;
          flex-shrink: 0;
        }
        .status-badge.charging    .status-dot { animation: blink 1s step-end infinite; }
        .status-badge.discharging .status-dot { animation: blink 1.4s step-end infinite; }

        /* Energy row */
        .energy-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
          gap: 8px;
        }
        .energy-tile {
          background: rgba(128,128,128,0.08);
          border-radius: 10px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .energy-label {
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.7px;
          opacity: 0.45;
        }
        .energy-val {
          font-size: 16px;
          font-weight: 700;
        }
        .energy-tile.charging    .energy-val { color: var(--color-charging,    #f06292); }
        .energy-tile.discharging .energy-val { color: var(--color-discharging, #4db6ac); }

        /* SOC bar row */
        .soc-bar-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .soc-bar-row .bar-wrap {
          flex: 1;
        }
        /* SOH bar */
        .soh-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .soh-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          opacity: 0.45;
          min-width: 28px;
        }
        .soh-bar-bg {
          flex: 1;
          height: 6px;
          border-radius: 6px;
          background: rgba(128,128,128,0.2);
          overflow: hidden;
        }
        .soh-bar-fill {
          height: 100%;
          border-radius: 6px;
          transition: width 1s ease, background 0.5s ease;
        }
        .soh-value {
          font-size: 12px;
          font-weight: 700;
          min-width: 36px;
          text-align: right;
        }
      </style>
      <ha-card style="position:relative">
        <div class="status-badge idle" id="status-badge">
          <div class="status-dot"></div>
          <span id="status-text">Bereit</span>
        </div>
        <div class="label" id="card-title">Ladestand</div>
        <div class="main-row">

          <!-- Battery SVG icon -->
          <div class="battery-icon">
            <svg viewBox="0 0 44 90" xmlns="http://www.w3.org/2000/svg">
              <!-- cap -->
              <rect x="13" y="0" width="18" height="6" rx="3" id="icon-cap" fill="#555"/>
              <!-- body outline -->
              <rect x="2" y="6" width="40" height="82" rx="6" fill="none" stroke-width="3" id="icon-border" stroke="#555"/>
              <!-- fill (clipPath keeps it inside body) -->
              <clipPath id="batt-clip">
                <rect x="3.5" y="7.5" width="37" height="79" rx="5"/>
              </clipPath>
              <rect x="3.5" id="icon-fill"
                    y="7.5" width="37" height="0"
                    clip-path="url(#batt-clip)"
                    fill="#555"
                    style="transition: height 1s ease, y 1s ease, fill 0.5s ease"/>
            </svg>
          </div>

          <!-- Right content -->
          <div class="content">
            <div class="soc-row">
              <div class="soc-value" id="val">—</div>
              <div class="soc-kwh">
                <span id="kwh-stored"></span>
                <span id="kwh-usable" class="kwh-usable"></span>
              </div>
            </div>
            <div class="power-row idle" id="power-row">
              <div class="power-dot"></div>
              <span id="power-text">—</span>
            </div>
          </div>
        </div>

        <!-- SOH bar -->
        <div class="soh-row" id="soh-row" style="display:none">
          <span class="soh-label">SOH</span>
          <div class="soh-bar-bg">
            <div class="soh-bar-fill" id="soh-fill"></div>
          </div>
          <span class="soh-value" id="soh-val"></span>
        </div>

        <div class="soc-bar-row">
          <span class="soh-label">SOC</span>
          <div class="bar-wrap">
            <div class="bar-bg">
              <div class="bar-fill" id="bar" style="width:0%"></div>
            </div>
            <div class="min-marker" id="marker" style="display:none"></div>
          </div>
        </div>
        <div class="min-label" id="min-label"></div>

        <!-- Energy in/out -->
        <div class="energy-row" id="energy-row" style="display:none">
          <div class="energy-tile charging" id="energy-in-tile">
            <span class="energy-label">📥 Geladen</span>
            <span class="energy-val" id="energy-in">—</span>
          </div>
          <div class="energy-tile discharging" id="energy-out-tile">
            <span class="energy-label">📤 Entladen</span>
            <span class="energy-val" id="energy-out">—</span>
          </div>
          <div class="energy-tile" id="energy-net-tile">
            <span class="energy-label">⚖️ Bilanz</span>
            <span class="energy-val" id="energy-net">—</span>
          </div>
          <div class="energy-tile" id="energy-rt-tile" style="display:none">
            <span class="energy-label">🔄 Roundtrip</span>
            <span class="energy-val" id="energy-rt">—</span>
          </div>
        </div>
      </ha-card>
    `;
  }

  _update() {
    if (!this._hass || !this._config || !this.shadowRoot) return;

    const stateObj = this._hass.states[this._config.soc_entity];
    const soc = stateObj ? parseFloat(stateObj.state) : null;
    const pct = (soc !== null && !isNaN(soc)) ? Math.max(0, Math.min(100, soc)) : null;

    const cap    = this._config.capacity_kwh != null ? parseFloat(this._config.capacity_kwh) : null;
    const minSoc = this._config.min_soc      != null ? parseFloat(this._config.min_soc)      : null;

    const usableCap = (cap !== null && minSoc !== null)
      ? cap * (1 - minSoc / 100) : cap;

    const color = pct === null ? '#555'
      : (minSoc !== null && pct <= minSoc) ? '#d50000'
      : pct >= 60 ? '#00c853'
      : pct >= 30 ? '#ffd600'
      : '#d50000';

    // color_rgb selector returns [r,g,b] array or hex string
    const _toHex = (v, def) => {
      if (!v) return def;
      if (Array.isArray(v)) return '#' + v.map(c => Math.round(c).toString(16).padStart(2,'0')).join('');
      return v;
    };
    const colorCharging    = _toHex(this._config.color_charging,    '#f06292');
    const colorDischarging = _toHex(this._config.color_discharging, '#4db6ac');
    this.shadowRoot.host.style.setProperty('--soc-color', color);
    this.shadowRoot.host.style.setProperty('--color-charging',    colorCharging);
    this.shadowRoot.host.style.setProperty('--color-discharging', colorDischarging);

    // ── Status badge ──
    const badge      = this.shadowRoot.getElementById('status-badge');
    const statusText = this.shadowRoot.getElementById('status-text');
    if (this._config.power_entity) {
      const pBadge = this._hass.states[this._config.power_entity];
      let wBadge = pBadge ? parseFloat(pBadge.state) : null;
      if (wBadge !== null && !isNaN(wBadge)) {
        if (this._config.power_invert) wBadge = -wBadge;
        if (wBadge > 10) {
          badge.className      = 'status-badge charging';
          statusText.textContent = '⚡ Lädt';
        } else if (wBadge < -10) {
          badge.className      = 'status-badge discharging';
          statusText.textContent = '↓ Entlädt';
        } else {
          badge.className      = 'status-badge idle';
          statusText.textContent = '● Bereit';
        }
      } else {
        badge.className      = 'status-badge idle';
        statusText.textContent = '● Bereit';
      }
    } else {
      badge.style.display = 'none';
    }
    this.shadowRoot.getElementById('card-title').textContent = this._config.title || 'Ladestand';
    this.shadowRoot.getElementById('val').textContent = pct !== null ? Math.round(pct) + '%' : '—';
    this.shadowRoot.getElementById('bar').style.width = (pct ?? 0) + '%';

    // ── Battery icon ──
    const fillH    = 79 * (pct ?? 0) / 100;   // max inner height = 79px
    const fillY    = 7.5 + 79 - fillH;          // fill grows from bottom
    const iconFill = this.shadowRoot.getElementById('icon-fill');
    const iconBorder = this.shadowRoot.getElementById('icon-border');
    const iconCap    = this.shadowRoot.getElementById('icon-cap');
    iconFill.setAttribute('height', fillH.toFixed(1));
    iconFill.setAttribute('y',      fillY.toFixed(1));
    iconFill.setAttribute('fill',   color);
    iconBorder.setAttribute('stroke', color);
    iconCap.setAttribute('fill',      color);

    // kWh gespeichert
    const storedKwh = (cap !== null && pct !== null) ? cap * pct / 100 : null;
    this.shadowRoot.getElementById('kwh-stored').textContent = storedKwh !== null
      ? storedKwh.toFixed(1) + ' kWh' : '';

    // kWh nutzbar
    const usableNow = (cap !== null && pct !== null && minSoc !== null)
      ? Math.max(0, (pct - minSoc) / 100 * cap) : null;
    this.shadowRoot.getElementById('kwh-usable').textContent = usableNow !== null
      ? '· ' + usableNow.toFixed(1) + ' kWh nutzbar' : '';

    // ── Leistung ──
    const powerRow  = this.shadowRoot.getElementById('power-row');
    const powerText = this.shadowRoot.getElementById('power-text');

    if (this._config.power_entity) {
      const pObj = this._hass.states[this._config.power_entity];
      let w = pObj ? parseFloat(pObj.state) : null;
      if (w !== null && !isNaN(w)) {
        if (this._config.power_invert) w = -w;
        const absW   = Math.abs(w);
        const valStr = absW >= 1000
          ? (absW / 1000).toFixed(2) + ' kW'
          : Math.round(absW) + ' W';
        if (w > 10) {
          powerRow.className    = 'power-row charging';
          powerText.textContent = '⚡ Lädt · ' + valStr + _chargeSuffix(w, usableCap, usableNow);
        } else if (w < -10) {
          powerRow.className    = 'power-row discharging';
          powerText.textContent = '↓ Entlädt · ' + valStr + _dischargeSuffix(w, usableNow);
        } else {
          powerRow.className    = 'power-row idle';
          powerText.textContent = '● Bereit';
        }
      } else {
        powerRow.className    = 'power-row idle';
        powerText.textContent = '—';
      }
    } else {
      powerRow.className    = 'power-row idle';
      powerText.textContent = '';
    }

    // ── SOH ──
    const sohRow = this.shadowRoot.getElementById('soh-row');
    if (this._config.show_soh === false) { sohRow.style.display = 'none'; } else {
    const sohFill = this.shadowRoot.getElementById('soh-fill');
    const sohVal  = this.shadowRoot.getElementById('soh-val');
    if (this._config.soh_entity) {
      const sohObj = this._hass.states[this._config.soh_entity];
      const soh = sohObj ? parseFloat(sohObj.state) : null;
      if (soh !== null && !isNaN(soh)) {
        const sohColor = soh >= 90 ? '#00e676' : soh >= 75 ? '#69f0ae' : soh >= 50 ? '#ffd740' : '#ff5252';
        sohRow.style.display = '';
        sohFill.style.width      = Math.max(0, Math.min(100, soh)) + '%';
        sohFill.style.background = sohColor;
        sohVal.textContent       = Math.round(soh) + '%';
        sohVal.style.color       = sohColor;
      } else {
        sohRow.style.display = 'none';
      }
    } else {
      sohRow.style.display = 'none';
    }
    } // end show_soh

    // ── Energie ──
    const energyRow = this.shadowRoot.getElementById('energy-row');
    if (this._config.show_daily_energy === false) { energyRow.style.display = 'none'; this.shadowRoot.getElementById('energy-rt-tile').style.display = 'none'; } else {
    const inEl  = this.shadowRoot.getElementById('energy-in');
    const outEl = this.shadowRoot.getElementById('energy-out');
    const netEl = this.shadowRoot.getElementById('energy-net');
    const netTile = this.shadowRoot.getElementById('energy-net-tile');

    const inObj  = this._config.energy_in_entity  ? this._hass.states[this._config.energy_in_entity]  : null;
    const outObj = this._config.energy_out_entity ? this._hass.states[this._config.energy_out_entity] : null;
    const inVal  = inObj  ? parseFloat(inObj.state)  : null;
    const outVal = outObj ? parseFloat(outObj.state) : null;

    if (inObj || outObj) {
      energyRow.style.display = '';
      inEl.textContent  = (inVal  !== null && !isNaN(inVal))  ? inVal.toFixed(1)  + ' kWh' : '—';
      outEl.textContent = (outVal !== null && !isNaN(outVal)) ? outVal.toFixed(1) + ' kWh' : '—';

      if (inVal !== null && outVal !== null && !isNaN(inVal) && !isNaN(outVal)) {
        const net = inVal - outVal;
        netEl.textContent  = (net >= 0 ? '+' : '') + net.toFixed(1) + ' kWh';
        netEl.style.color  = net >= 0
          ? 'var(--color-charging, #f06292)'
          : 'var(--color-discharging, #4db6ac)';
        netTile.style.display = '';
      } else {
        netTile.style.display = 'none';
      }

    } else {
      energyRow.style.display = 'none';
    }
      // Roundtrip (Langzeit)
      const rtTile   = this.shadowRoot.getElementById('energy-rt-tile');
      const rtEl     = this.shadowRoot.getElementById('energy-rt');
      const inTotObj  = this._config.energy_in_total_entity  ? this._hass.states[this._config.energy_in_total_entity]  : null;
      const outTotObj = this._config.energy_out_total_entity ? this._hass.states[this._config.energy_out_total_entity] : null;
      const inTot  = inTotObj  ? parseFloat(inTotObj.state)  : null;
      const outTot = outTotObj ? parseFloat(outTotObj.state) : null;
      if (inTot !== null && outTot !== null && !isNaN(inTot) && !isNaN(outTot) && inTot > 0) {
        const rt = (outTot / inTot * 100).toFixed(1);
        rtTile.style.display = '';
        rtEl.textContent     = rt + ' %';
        rtEl.style.color     = rt >= 90 ? '#00e676' : rt >= 75 ? '#ffd740' : '#ff5252';
      } else {
        rtTile.style.display = 'none';
      }
    } // end show_daily_energy

    // ── min_soc Markierung ──
    const marker   = this.shadowRoot.getElementById('marker');
    const minLabel = this.shadowRoot.getElementById('min-label');
    if (minSoc !== null && minSoc > 0) {
      marker.style.display = 'block';
      marker.style.left    = minSoc + '%';
      const minKwh    = cap !== null ? (cap * minSoc / 100) : null;
      const minKwhStr = minKwh !== null ? ` (${minKwh.toFixed(1)} kWh)` : '';
      const usableStr = (usableCap !== null && cap !== null)
        ? ` · Nutzbar: ${usableCap.toFixed(1)} kWh von ${cap.toFixed(1)} kWh` : '';
      minLabel.textContent = `Min. ${minSoc}%${minKwhStr}${usableStr}`;
    } else {
      marker.style.display = 'none';
      minLabel.textContent = '';
    }
  }
}

customElements.define('battery-storage-card', BatteryStorageCard);

window.customCards ??= [];
window.customCards.push({
  type:        'battery-storage-card',
  name:        'Battery Storage Card',
  description: 'Heimspeicher – SOC Anzeige',
  preview:     true,
});
