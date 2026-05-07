/**
 * iLands Sensor Configuration
 * ============================
 * Single source of truth for all station metadata and alert thresholds.
 * Edit this file when:
 *   - Adding a new GNSS station
 *   - Changing risk thresholds for a site
 *   - Updating coordinates after re-survey
 *   - Adding AWS / tilt / soil sensors to a site
 */

export interface StationConfig {
  id          : string          // Must match CSV filename prefix and sensor ID
  name        : string          // Display name (plain language, §8 terminology)
  location    : string          // Sub-location description
  lat         : number          // WGS84 latitude
  lon         : number          // WGS84 longitude
  elevation   : number          // Antenna elevation (m above MSL)
  established : string          // ISO date when station was commissioned

  thresholds: {
    // Horizontal velocity thresholds (mm/day) — drives MEDIUM / HIGH risk
    medium      : number        // Default: 2 mm/day
    high        : number        // Default: 5 mm/day

    // Vertical displacement thresholds (mm total)
    vertMedium  : number        // Default: 10 mm
    vertHigh    : number        // Default: 25 mm

    // Anomaly — z-score threshold
    zScore      : number        // Default: 2.5
  }

  sensors: {
    gnss        : boolean       // Always true for GNSS stations
    aws         : boolean       // Automatic Weather Station (rainfall)
    tilt        : boolean       // Tiltmeter
    soilMoisture: boolean       // Soil moisture sensor
    crackmeter  : boolean       // Crackmeter / extensometer
  }

  // Sensor hardware info (fill when known)
  hardware?: {
    receiver    : string        // e.g. 'Trimble NetR9', 'u-blox ZED-F9P'
    antenna     : string        // e.g. 'TRM59800.00 SCIS'
    firmware    : string        // Receiver firmware version
  }

  // Connection info (fill when going live)
  connection?: {
    protocol    : 'ntrip' | 'http' | 'mqtt' | 'serial' | 'ftp'
    host?       : string        // IP or hostname of sensor server
    port?       : number
    mountpoint? : string        // For NTRIP
    topic?      : string        // For MQTT
    endpoint?   : string        // For HTTP
    pollInterval: number        // Seconds between polls (0 = push/stream)
  }
}

// ─── Station Definitions ─────────────────────────────────────────────────────
// Cameron Highlands GNSS Network — 5 monitoring stations
// Coordinates and names — update with actual survey values when available
export const STATIONS: StationConfig[] = [
  {
    id          : 'BAKO',
    name        : 'Batu Caves Slope',
    location    : 'Ringlet, Cameron Highlands',
    lat         : 4.4656,
    lon         : 101.3584,
    elevation   : 1200,
    established : '2023-01-15',
    thresholds  : { medium: 2, high: 5, vertMedium: 10, vertHigh: 25, zScore: 2.5 },
    sensors     : { gnss: true, aws: true, tilt: false, soilMoisture: false, crackmeter: false },
    hardware    : { receiver: 'TBD', antenna: 'TBD', firmware: 'TBD' },
    connection  : { protocol: 'http', pollInterval: 300 },   // 5 min
  },
  {
    id          : 'CUSV',
    name        : 'Cameron Highlands Upper',
    location    : 'Tanah Rata, Cameron Highlands',
    lat         : 4.4716,
    lon         : 101.3780,
    elevation   : 1450,
    established : '2023-01-15',
    thresholds  : { medium: 2, high: 5, vertMedium: 10, vertHigh: 25, zScore: 2.5 },
    sensors     : { gnss: true, aws: true, tilt: false, soilMoisture: true, crackmeter: false },
    hardware    : { receiver: 'TBD', antenna: 'TBD', firmware: 'TBD' },
    connection  : { protocol: 'http', pollInterval: 300 },
  },
  {
    id          : 'MYVA',
    name        : 'Lavender Park',
    location    : 'Brinchang, Cameron Highlands',
    lat         : 4.5200,
    lon         : 101.3900,
    elevation   : 1600,
    established : '2023-02-01',
    thresholds  : { medium: 2, high: 5, vertMedium: 10, vertHigh: 25, zScore: 2.5 },
    sensors     : { gnss: true, aws: false, tilt: true, soilMoisture: false, crackmeter: false },
    hardware    : { receiver: 'TBD', antenna: 'TBD', firmware: 'TBD' },
    connection  : { protocol: 'http', pollInterval: 300 },
  },
  {
    id          : 'NTUS',
    name        : 'Mossy Forest Ridge',
    location    : 'Gunung Brinchang, Cameron Highlands',
    lat         : 4.5010,
    lon         : 101.3820,
    elevation   : 2031,
    established : '2023-02-01',
    thresholds  : { medium: 1.5, high: 4, vertMedium: 8, vertHigh: 20, zScore: 2.5 },
    sensors     : { gnss: true, aws: true, tilt: true, soilMoisture: true, crackmeter: false },
    hardware    : { receiver: 'TBD', antenna: 'TBD', firmware: 'TBD' },
    connection  : { protocol: 'http', pollInterval: 300 },
  },
  {
    id          : 'SAMP',
    name        : 'RockShed Station',
    location    : 'Simpang Pulai, Cameron Highlands',
    lat         : 4.4380,
    lon         : 101.3650,
    elevation   : 950,
    established : '2023-03-01',
    thresholds  : { medium: 3, high: 6, vertMedium: 15, vertHigh: 30, zScore: 3.0 },
    sensors     : { gnss: true, aws: false, tilt: false, soilMoisture: false, crackmeter: true },
    hardware    : { receiver: 'TBD', antenna: 'TBD', firmware: 'TBD' },
    connection  : { protocol: 'http', pollInterval: 300 },
  },
]

// Quick lookup by ID
export const STATION_MAP = Object.fromEntries(STATIONS.map(s => [s.id, s]))

// All station IDs
export const STATION_IDS = STATIONS.map(s => s.id)
