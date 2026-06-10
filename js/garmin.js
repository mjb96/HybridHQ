import { Buffer } from 'https://esm.sh/buffer'; 
import FitParser from 'https://esm.sh/fit-file-parser';
import { showToast } from './state.js';
import { downsampleStream, derivePaceSeries } from './engine.js';

window.Buffer = Buffer; 

export function initGarminRunImport(onDataExtracted) {
  setupUploader('fitUpload', true, onDataExtracted);
}

export function initGarminGymImport(onDataExtracted) {
  setupUploader('fitGymUpload', false, onDataExtracted);
}

function setupUploader(inputId, isRun, onDataExtracted) {
  const uploadInput = document.getElementById(inputId);
  if (!uploadInput) return;

  uploadInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    event.target.value = ''; 

    showToast('Parsing Garmin file...');

    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target.result;
        const nodeBuffer = Buffer.from(arrayBuffer);

        const fitParser = new FitParser({
          force: true,
          speedUnit: 'km/h',
          lengthUnit: 'km',
          elapsedRecordField: true,
          mode: 'list', 
        });

        fitParser.parse(nodeBuffer, (error, data) => {
          if (error) {
            showToast('Parse error: ' + error.toString().slice(0, 60), true);
            return;
          }
          extractData(data, isRun, onDataExtracted);
        });

      } catch (fatalError) {
        showToast('FIT import failed: ' + fatalError.toString().slice(0, 60), true);
      }
    };

    reader.readAsArrayBuffer(file);
  });
}

function extractData(garminData, isRun, onDataExtracted) {
  let foundSession = null;

  if (garminData.sessions && garminData.sessions.length > 0) {
    foundSession = garminData.sessions[0];
  } else if (garminData.session && (Array.isArray(garminData.session) ? garminData.session.length > 0 : true)) {
    foundSession = Array.isArray(garminData.session) ? garminData.session[0] : garminData.session;
  } else {
    function searchForSession(data) {
      if (Array.isArray(data)) {
        for (let i = 0; i < data.length; i++) {
          searchForSession(data[i]);
          if (foundSession) return;
        }
      } else if (data !== null && typeof data === 'object') {
        const hasTime = (data.total_timer_time !== undefined || data.total_elapsed_time !== undefined);
        const hasDist = data.total_distance !== undefined;
        const hasCals = data.total_calories !== undefined;

        if (isRun && hasDist && hasTime) {
          foundSession = data;
          return;
        } else if (!isRun && hasTime && hasCals) {
          foundSession = data;
          return;
        }

        for (let key in data) {
          searchForSession(data[key]);
          if (foundSession) return;
        }
      }
    }
    searchForSession(garminData);
  }

  if (!foundSession) {
    showToast(`Could not find ${isRun ? 'run' : 'gym'} data in this file.`, true);
    return;
  }

  const totalDistanceKm = foundSession.total_distance || 0; 
  const durationSeconds = foundSession.total_timer_time || foundSession.total_elapsed_time || 0;
  
  const mins = Math.floor(durationSeconds / 60);
  const secs = Math.floor(durationSeconds % 60);
  const timeFormatted = `${mins}:${secs.toString().padStart(2, '0')}`;

  function getStat(searchTerms, excludeTerms = []) {
    const keys = Object.keys(foundSession);
    for (let i = 0; i < keys.length; i++) {
      const lowerKey = keys[i].toLowerCase();
      if (excludeTerms.some(ex => lowerKey.includes(ex))) continue;
      for (let j = 0; j < searchTerms.length; j++) {
        if (lowerKey.includes(searchTerms[j])) {
          return foundSession[keys[i]];
        }
      }
    }
    return 0;
  }

  // Extended parameter extraction.
  // FIT semantics: `total_training_effect` is AEROBIC TE;
  // `total_anaerobic_training_effect` is ANAEROBIC TE. The aerobic search
  // excludes any 'anaerobic' key so it can never grab the anaerobic value
  // regardless of field order in the parsed session.
  const extraStats = {
    avgHR: getStat(['avg_heart', 'average_heart', 'avg_hr']),
    maxHR: getStat(['max_heart', 'maximum_heart', 'max_hr']),
    elevation: getStat(['ascent', 'elevation', 'gain', 'total_ascent']),
    calories: getStat(['cal']),
    descent: getStat(['descent', 'total_descent']),
    avgCadence: getStat(['avg_cadence', 'avg_running_cadence', 'average_cadence']),
    trainingEffect: getStat(['total_training_effect', 'training_effect'], ['anaerobic']),
    anaerobicTE: getStat(['total_anaerobic_training_effect', 'anaerobic_training_effect', 'anaerobic']),
    hrZones: getStat(['time_in_hr_zone']) || null
  };

  // Lap Data Processing
  const splits = [];
  const gymSets = [];
  let laps = garminData.laps || (garminData.activity && garminData.activity.laps) || [];
  
  laps.forEach((lap, index) => {
    if (isRun) {
      splits.push({
        lap: index + 1,
        time: lap.total_timer_time || lap.total_elapsed_time || 0,
        dist: lap.total_distance || 0,
        avgHR: lap.avg_heart_rate || 0
      });
    } else {
      if (lap.total_reps) {
        gymSets.push({
          set: index + 1,
          reps: lap.total_reps,
          weight: lap.weight || 0,
          category: lap.category || 'Lifting'
        });
      }
    }
  });

  extraStats.splits = splits.length > 0 ? splits : null;
  extraStats.gymSets = gymSets.length > 0 ? gymSets : null;

  const coordinates = [];
  let manualHRCnt = 0;
  let manualHRSum = 0;
  let manualMaxHR = 0;

  let records = garminData.records || []; 
  if (records.length === 0 && garminData.activity && garminData.activity.records) {
    records = garminData.activity.records;
  }

  // Raw per-record stream arrays (run only) — the richest graphing material,
  // previously discarded. Captured at full resolution then downsampled before
  // storage. Stays out of the synced state blob (saved to IndexedDB by caller).
  const sT = [], sDist = [], sHr = [], sAlt = [], sCad = [], sPow = [], sTemp = [];
  let firstTs = null;
  let hasDist = false, hasHr = false, hasAlt = false, hasCad = false, hasPow = false, hasTemp = false;

  records.forEach(record => {
    if (isRun && record.position_lat && record.position_long) {
      let lat = record.position_lat;
      let lng = record.position_long;
      
      if (Math.abs(lat) > 180) lat = lat * (180.0 / 2147483648.0);
      if (Math.abs(lng) > 180) lng = lng * (180.0 / 2147483648.0);
      
      coordinates.push([lat, lng]);
    }
    
    if (record.heart_rate) {
      manualHRSum += record.heart_rate;
      manualHRCnt++;
      if (record.heart_rate > manualMaxHR) {
        manualMaxHR = record.heart_rate;
      }
    }

    if (isRun) {
      // Elapsed seconds: prefer the parser's elapsed_time, else derive from
      // the timestamp delta from the first record.
      let sec = 0;
      if (record.elapsed_time != null) {
        sec = record.elapsed_time;
      } else if (record.timestamp != null) {
        const ts = record.timestamp instanceof Date ? record.timestamp.getTime() : new Date(record.timestamp).getTime();
        if (firstTs == null) firstTs = ts;
        sec = (ts - firstTs) / 1000;
      }
      sT.push(sec);

      const d  = record.distance != null ? record.distance : 0;
      const h  = record.heart_rate != null ? record.heart_rate : 0;
      const a  = record.altitude != null ? record.altitude
               : (record.enhanced_altitude != null ? record.enhanced_altitude : 0);
      const c  = record.cadence != null ? record.cadence : 0;
      const p  = record.power != null ? record.power : 0;
      const tp = record.temperature != null ? record.temperature : 0;

      sDist.push(d);  if (d)  hasDist = true;
      sHr.push(h);    if (h)  hasHr = true;
      sAlt.push(a);   if (a)  hasAlt = true;
      sCad.push(c);   if (c)  hasCad = true;
      sPow.push(p);   if (p)  hasPow = true;
      sTemp.push(tp); if (tp) hasTemp = true;
    }
  });

  // Assemble the stream, dropping metrics with no data, then downsample.
  let stream = null;
  if (isRun && sT.length > 0) {
    stream = {
      version: 1,
      type: 'run',
      lengthUnit: 'km', // distance/altitude are as parsed under this unit
      t: sT,
    };
    if (hasDist) { stream.distKm = sDist; stream.paceSecPerKm = derivePaceSeries(sDist, sT); }
    if (hasHr)   stream.hr = sHr;
    if (hasAlt)  stream.altitude = sAlt;
    if (hasCad)  stream.cadence = sCad;
    if (hasPow)  stream.power = sPow;
    if (hasTemp) stream.temp = sTemp;
    stream = downsampleStream(stream, 500);
  }

  if (extraStats.avgHR === 0 && manualHRCnt > 0) {
    extraStats.avgHR = manualHRSum / manualHRCnt;
  }
  if (extraStats.maxHR === 0 && manualMaxHR > 0) {
    extraStats.maxHR = manualMaxHR;
  }

  showToast('Garmin Imported! ✓');
  if (isRun) {
    onDataExtracted(totalDistanceKm.toFixed(2), timeFormatted, coordinates, extraStats, stream);
  } else {
    onDataExtracted(timeFormatted, extraStats);
  }
}