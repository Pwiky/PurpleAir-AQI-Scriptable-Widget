"use strict";

/**
 * This widget is from <https://github.com/jasonsnell/PurpleAir-AQI-Scriptable-Widget>
 * By Jason Snell, Rob Silverii, Adam Lickel, Alexander Ogilvie, and Brian Donovan.
 * Based on code by Matt Silverlock.
 */

const API_URL = "https://www.purpleair.com";

/**
 * Find a nearby PurpleAir sensor ID via https://fire.airnow.gov/
 * Click a sensor near your location: the ID is the trailing integers
 * https://www.purpleair.com/json has all sensors by location & ID.
 * @type {number}
 */
const SENSOR_ID = args.widgetParameter;

/**
 * Widget attributes: AQI level threshold, text label, gradient start and end colors, text color
 *
 * @typedef {object} LevelAttribute
 * @property {number} threshold
 * @property {string} label
 * @property {string} startColor
 * @property {string} endColor
 * @property {string} textColor
 * @property {string} darkStartColor
 * @property {string} darkEndColor
 * @property {string} darkTextColor
 */

/**
 * @typedef {object} SensorData
 * @property {string} val
 * @property {string} adj1
 * @property {string} adj2
 * @property {number} ts
 * @property {string} hum
 * @property {string} loc
 * @property {string} lat
 * @property {string} lon
 */

/**
 * @typedef {object} LatLon
 * @property {number} latitude
 * @property {number} longitude
 */

/**
 * Get JSON from a local file
 *
 * @param {string} fileName
 * @returns {object}
 */
function getCachedData(fileName) {
  const fileManager = FileManager.local();
  const cacheDirectory = fileManager.joinPath(fileManager.libraryDirectory(), "jsnell-aqi");
  const cacheFile = fileManager.joinPath(cacheDirectory, fileName);

  if (!fileManager.fileExists(cacheFile)) {
    return undefined;
  }

  const contents = fileManager.readString(cacheFile);
  return JSON.parse(contents);
}

/**
 * Wite JSON to a local file
 *
 * @param {string} fileName
 * @param {object} data
 */
function cacheData(fileName, data) {
  const fileManager = FileManager.local();
  const cacheDirectory = fileManager.joinPath(fileManager.libraryDirectory(), "jsnell-aqi");
  const cacheFile = fileManager.joinPath(cacheDirectory, fileName);

  if (!fileManager.fileExists(cacheDirectory)) {
    fileManager.createDirectory(cacheDirectory);
  }

  const contents = JSON.stringify(data);
  fileManager.writeString(cacheFile, contents);
}

/**
 * Get the closest PurpleAir sensorId to the given location
 *
 * @returns {Promise<number>}
 */
async function getSensorId() {
  if (SENSOR_ID) return SENSOR_ID;

  let fallbackSensorId = undefined;

  try {
    const cachedSensor = getCachedData("sensor.json");
    if (cachedSensor) {
      console.log({ cachedSensor });

      const { id, updatedAt } = cachedSensor;
      fallbackSensorId = id;
      // If we've fetched the location within the last 15 minutes, just return it
      if (Date.now() - updatedAt < 15 * 60 * 1000) {
        return id;
      }
    }

    /** @type {LatLon} */
    const { latitude, longitude } = await Location.current();

    const BOUND_OFFSET = 0.05;

    const nwLat = latitude + BOUND_OFFSET;
    const seLat = latitude - BOUND_OFFSET;
    const nwLng = longitude - BOUND_OFFSET;
    const seLng = longitude + BOUND_OFFSET;

    const req = new Request(
      `${API_URL}/data.json?opt=1/mAQI/a10/cC5&fetch=true&nwlat=${nwLat}&selat=${seLat}&nwlng=${nwLng}&selng=${seLng}&fields=ID`
    );

    /** @type {{ code?: number; data?: Array<Array<number>>; fields?: Array<string>; }} */
    const res = await req.loadJSON();

    const { fields, data } = res;

    const sensorIdIndex = fields.indexOf("ID");
    const latIndex = fields.indexOf("Lat");
    const lonIndex = fields.indexOf("Lon");
    const typeIndex = fields.indexOf("Type");
    const OUTDOOR = 0;

    let closestSensor;
    let closestDistance = Infinity;

    for (const location of data.filter((datum) => datum[typeIndex] === OUTDOOR)) {
      const distanceFromLocation = haversine(
        { latitude, longitude },
        { latitude: location[latIndex], longitude: location[lonIndex] }
      );
      if (distanceFromLocation < closestDistance) {
        closestDistance = distanceFromLocation;
        closestSensor = location;
      }
    }

    const id = closestSensor[sensorIdIndex];
    cacheData("sensor.json", { id, updatedAt: Date.now() });

    return id;
  } catch (error) {
    console.log(`Could not fetch location: ${error}`);
    return fallbackSensorId;
  }
}

/**
 * Returns the haversine distance between start and end.
 *
 * @param {LatLon} start
 * @param {LatLon} end
 * @returns {number}
 */
function haversine(start, end) {
  const toRadians = (n) => (n * Math.PI) / 180;

  const deltaLat = toRadians(end.latitude - start.latitude);
  const deltaLon = toRadians(end.longitude - start.longitude);
  const startLat = toRadians(start.latitude);
  const endLat = toRadians(end.latitude);

  const angle =
    Math.sin(deltaLat / 2) ** 2 +
    Math.sin(deltaLon / 2) ** 2 * Math.cos(startLat) * Math.cos(endLat);

  return 2 * Math.atan2(Math.sqrt(angle), Math.sqrt(1 - angle));
}

/**
 * Fetch content from PurpleAir
 *
 * @param {number} sensorId
 * @returns {Promise<SensorData>}
 */
async function getSensorData(sensorId) {

  const req = new Request(`${API_URL}/json?show=${sensorId}`);

    const json = await req.loadJSON();

  try {

  return {
    val: json.results[0].Stats,
    adj1: json.results[0].pm2_5_cf_1,
    adj2: json.results[1].pm2_5_cf_1,
    ts: json.results[0].LastSeen,
    hum: json.results[0].humidity,
    loc: json.results[0].Label,
    lat: json.results[0].Lat,
    lon: json.results[0].Lon,
  };
   } catch (error) {
    console.log(`Could not parse JSON: ${error}`);

  return {
    val: 666,
  };

  }



}

/**
 * Fetch reverse geocode
 *
 * @param {string} lat
 * @param {string} lon
 * @returns {Promise<GeospatialData>}
 */
async function getGeoData(lat, lon) {
  const providerUrl = 'https://geocode.xyz/'
  const req = new Request(`${providerUrl}${lat},${lon}?geoit=json`);
  const json = await req.loadJSON();

  return {
    city: json.city,
    state: json.state,
    stateName: json.statename,
    zip: json.postal,
  };
}


/** @type {Array<LevelAttribute>} sorted by threshold desc. */
const LEVEL_ATTRIBUTES = [
  {
    threshold: 300,
    label: "Hazardous",
    startColor: "76205d",
    endColor: "521541",
    textColor: "f0f0f0",
    darkStartColor: "333333",
    darkEndColor: "000000",
    darkTextColor: "ce4ec5",
  },
  {
    threshold: 200,
    label: "Very Unhealthy",
    startColor: "9c2424",
    endColor: "661414",
    textColor: "f0f0f0",
    darkStartColor: "333333",
    darkEndColor: "000000",
    darkTextColor: "f33939",
  },
  {
    threshold: 150,
    label: "Unhealthy",
    startColor: "da5340",
    endColor: "bc2f26",
    textColor: "eaeaea",
    darkStartColor: "333333",
    darkEndColor: "000000",
    darkTextColor: "f16745",
  },
  {
    threshold: 100,
    label: "Unhealthy for Sensitive Groups",
    startColor: "f5ba2a",
    endColor: "d3781c",
    textColor: "1f1f1f",
    darkStartColor: "333333",
    darkEndColor: "000000",
    darkTextColor: "f7a021",
  },
  {
    threshold: 50,
    label: "Moderate",
    startColor: "f2e269",
    endColor: "dfb743",
    textColor: "1f1f1f",
    darkStartColor: "333333",
    darkEndColor: "000000",
    darkTextColor: "f2e269",
  },
  {
    threshold: -20,
    label: "Good",
    startColor: "8fec74",
    endColor: "77c853",
    textColor: "1f1f1f",
    darkStartColor: "333333",
    darkEndColor: "000000",
    darkTextColor: "6de46d",
  },
];


/**
 * Get the EPA adjusted PPM
 *
 * @param {SensorData} sensorData
 * @returns {number} EPA draft adjustment for wood smoke and PurpleAir from https://cfpub.epa.gov/si/si_public_record_report.cfm?dirEntryId=349513&Lab=CEMM&simplesearch=0&showcriteria=2&sortby=pubDate&timstype=&datebeginpublishedpresented=08/25/2018
 */
function computePM(sensorData) {
  const adj1 = Number.parseInt(sensorData.adj1, 10);
  const adj2 = Number.parseInt(sensorData.adj2, 10);
  const hum = Number.parseInt(sensorData.hum, 10);
  const dataAverage = (adj1 + adj2) / 2;

  return 0.52 * dataAverage - 0.085 * hum + 5.71;
}

/**
 * Get AQI number from PPM reading
 *
 * @param {number} pm
 * @returns {number|'-'}
 */
function aqiFromPM(pm) {
  if (pm > 350.5) return calculateAQI(pm, 500.0, 401.0, 500.0, 350.5);
  if (pm > 250.5) return calculateAQI(pm, 400.0, 301.0, 350.4, 250.5);
  if (pm > 150.5) return calculateAQI(pm, 300.0, 201.0, 250.4, 150.5);
  if (pm > 55.5) return calculateAQI(pm, 200.0, 151.0, 150.4, 55.5);
  if (pm > 35.5) return calculateAQI(pm, 150.0, 101.0, 55.4, 35.5);
  if (pm > 12.1) return calculateAQI(pm, 100.0, 51.0, 35.4, 12.1);
  if (pm >= 0.0) return calculateAQI(pm, 50.0, 0.0, 12.0, 0.0);
  return "-";
}

/**
 * Calculate the AQI number
 *
 * @param {number} Cp
 * @param {number} Ih
 * @param {number} Il
 * @param {number} BPh
 * @param {number} BPl
 * @returns {number}
 */
function calculateAQI(Cp, Ih, Il, BPh, BPl) {
  const a = Ih - Il;
  const b = BPh - BPl;
  const c = Cp - BPl;
  return Math.round((a / b) * c + Il);
}

/**
 * Calculates the AQI level
 * based on https://cfpub.epa.gov/airnow/index.cfm?action=aqibasics.aqi#unh
 *
 * @param {number|'-'} aqi
 * @returns {LevelAttribute & { level: number }}
 */
function calculateLevel(aqi) {
  const level = Number(aqi) || 0;

  const {
    label = "Weird",
    startColor = "white",
    endColor = "white",
    textColor = "black",
    darkStartColor = "009900",
    darkEndColor = "007700",
    darkTextColor = "000000",
    threshold,
  } = LEVEL_ATTRIBUTES.find(({ threshold }) => level > threshold);

  return {
    label,
    startColor,
    endColor,
    textColor,
    darkStartColor,
    darkEndColor,
    darkTextColor,
    threshold,
    level,
  };
}

/**
 * Text to title case
 * @returns {string}
 */

function toTitleCase(str) {
  return str.replace(
    /\w\S*/g,
    function(txt) {
      return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
    }
  );
}

/**
 * Get the AQI trend
 *
 * @param {{ v1: number; v3: number; }} stats
 * @returns {string}
 */
function getAQITrend({ v1: partLive, v3: partTime }) {
  const partDelta = partTime - partLive;
  if (partDelta > 5) return "arrow.down";
  if (partDelta < -5) return "arrow.up";
  return "arrow.left.and.right";
}

/**
 * Constructs an SFSymbol from the given symbolName
 *
 * @param {string} symbolName
 * @returns {object} SFSymbol
 */
function createSymbol(symbolName) {
  const symbol = SFSymbol.named(symbolName);
  symbol.applyFont(Font.systemFont(15));
  return symbol;
}

async function run() {
  const listWidget = new ListWidget();
  listWidget.setPadding(10, 15, 10, 10);

  try {
    const sensorId = await getSensorId();
    if (!sensorId) {
      throw "Please specify a location for this widget.";
    }
    console.log(`Using sensor ID: ${sensorId}`);

    const data = await getSensorData(sensorId);
    
    if (data.val == 666) {

      listWidget.background = new Color('999999');
      
    const header = listWidget.addText('Error'.toUpperCase());
    header.textColor = new Color('000000');
    header.font = Font.regularSystemFont(11);
    header.minimumScaleFactor = 0.50;

    listWidget.addSpacer(15);

    const wordLevel = listWidget.addText(`Couldn't connect to the server.`);
    wordLevel.textColor = new Color ('000000');
    wordLevel.font = Font.semiboldSystemFont(15);
    wordLevel.minimumScaleFactor = 0.3;
    
  } else {
      
    const stats = JSON.parse(data.val);
    console.log({ stats });

    const aqiTrend = getAQITrend(stats);
    console.log({ aqiTrend });

    const epaPM = computePM(data);
    console.log({ epaPM });

    const aqi = aqiFromPM(epaPM);
    const level = calculateLevel(aqi);
    const aqiText = aqi.toString();
    console.log({ aqi });

    const isDarkMode = Device.isUsingDarkAppearance();

    const startColor = new Color(
      isDarkMode ? level.darkStartColor : level.startColor
    );
    const endColor = new Color(
      isDarkMode ? level.darkEndColor : level.endColor
    );
    const textColor = new Color(
      isDarkMode ? level.darkTextColor : level.textColor
    );
    const gradient = new LinearGradient();

    console.log(`${isDarkMode ? "dark" : "light"} mode`);

    gradient.colors = [startColor, endColor];
    gradient.locations = [0.0, 1];
    console.log({ gradient });

    listWidget.backgroundGradient = gradient;

    const header = listWidget.addText('Air Quality'.toUpperCase());
    header.textColor = textColor;
    header.font = Font.regularSystemFont(11);
    header.minimumScaleFactor = 0.50;
    
    const wordLevel = listWidget.addText(level.label);
    wordLevel.textColor = textColor;
    wordLevel.font = Font.semiboldSystemFont(25);
    wordLevel.minimumScaleFactor = 0.3;
    
    listWidget.addSpacer(5);

    const scoreStack = listWidget.addStack();
    const content = scoreStack.addText(aqiText);
    content.textColor = textColor;
    content.font = Font.semiboldSystemFont(30);
    const trendSymbol = createSymbol(aqiTrend);
    const trendImg = scoreStack.addImage(trendSymbol.image);
    trendImg.resizable = false;
    trendImg.tintColor = textColor;
    trendImg.imageSize = new Size(28, 30);

    listWidget.addSpacer(10);
    
    const geoData = await getGeoData(data.lat, data.lon)
    const locationText = listWidget.addText(toTitleCase(geoData.city) );
    locationText.textColor = textColor;
    locationText.font = Font.regularSystemFont(14);
	 locationText.minimumScaleFactor = 0.5;

	listWidget.addSpacer(2);

    const updatedAt = new Date(data.ts * 1000).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    const widgetText = listWidget.addText(`Updated ${updatedAt}`);
    widgetText.textColor = textColor;
    widgetText.font = Font.regularSystemFont(9);
    widgetText.minimumScaleFactor = 0.6;

    const purpleMapUrl = `https://www.purpleair.com/map?opt=1/i/mAQI/a10/cC5&select=${sensorId}#14/${data.lat}/${data.lon}`;
    listWidget.url = purpleMapUrl;
 
}

   } catch (error) {
    console.log(`Could not render widget: ${error}`);

    const errorWidgetText = listWidget.addText(`${error}`);
    errorWidgetText.textColor = Color.red();
    errorWidgetText.textOpacity = 30;
    errorWidgetText.font = Font.regularSystemFont(10);
  }

  if (config.runsInApp) {
    listWidget.presentSmall();
  }

  Script.setWidget(listWidget);
  Script.complete();
}

await run();