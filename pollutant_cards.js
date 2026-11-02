var backgroundColorValue = "#EAEAEA";
var textColorValue = '#333';

// ====================================================================
// 1. GET AQI VALUES (default 0 if null)
// ====================================================================
var ozone_aqi  = IIf(IsEmpty($datapoint.recent_ozone_aqi),  0, $datapoint.recent_ozone_aqi);
var pm25_aqi   = IIf(IsEmpty($datapoint.recent_pm25_aqi),   0, $datapoint.recent_pm25_aqi);

// ====================================================================
// 2. DETERMINE DOMINANT POLLUTANT & OVERALL AQI
// ====================================================================
var dominantPollutant;
var aqiValue;

if (ozone_aqi > pm25_aqi) {
    dominantPollutant = 'Ozone';
    aqiValue = ozone_aqi;
} else {
    dominantPollutant = 'PM2.5';
    aqiValue = pm25_aqi;
}

// ====================================================================
// 3. AQI CATEGORY LOGIC.
// used for cardColorValue, emoticon & recommendations
// ====================================================================
var cardColorValue;
var emoticon;
var emoticon_stroke;
var emoticon_fill;
var health_text;   // kept internally – not displayed anymore

if (aqiValue < 50) {
    cardColorValue = '#9cd84e';
    emoticon = 'smileface';
    emoticon_stroke = '#489936';
    emoticon_fill = '#54b33e';
    health_text = "Good";    
} else if (aqiValue >= 50 && aqiValue < 100) {
    cardColorValue = '#faeb37ff';
    emoticon = 'midface';
    emoticon_stroke = '#fae60a';
    emoticon_fill = '#bfb008'; 
    health_text = "Moderate"; 
} else if (aqiValue >= 100 && aqiValue < 150) {
    cardColorValue = '#f99049';
    emoticon = 'midface';
    emoticon_stroke = '#489936';
    emoticon_fill = '#54b33e';
    health_text = "Unhealthy for Sensitive Groups"; 
} else if (aqiValue >= 150) {
    cardColorValue = '#f65e5f';
    emoticon = 'frownface';
    emoticon_stroke = '#489936';
    emoticon_fill = '#54b33e';
    health_text = "Unhealthy"; 
} else if (aqiValue >= 150) {  // unreachable – consider fixing breakpoints later
    cardColorValue = '#a070b6';
    emoticon = 'frownface';
    emoticon_stroke = '#489936';
    emoticon_fill = '#54b33e';
    health_text = "Very Unhealthy";  
} else if (aqiValue >= 150) {
    cardColorValue = '#a06a7b';
    emoticon = 'frownface';
    emoticon_stroke = '#489936';
    emoticon_fill = '#54b33e';
    health_text = "Hazardous";  
}

// ====================================================================
// 4. SVG EMOTICONS
// ====================================================================
if (emoticon == 'smileface') {
  emoticon = `
<svg width="48" height="48" viewBox="0 0 48 48" style="margin:8px" xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="24" r="22" fill="none" stroke="#333" stroke-width="3"/>
    <ellipse cx="16" cy="20" rx="3" ry="4" fill="#333"/>
    <ellipse cx="32" cy="20" rx="3" ry="4" fill="#333"/>
    <path d="M16 30 Q24 38 32 30" stroke="#333" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;
} else if (emoticon == 'midface') {
  emoticon = `
<svg width="48" height="48" viewBox="0 0 48 48" style="margin:8px" xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="24" r="22" fill="none" stroke="#333" stroke-width="3"/>
    <ellipse cx="16" cy="20" rx="3" ry="4" fill="#333"/>
    <ellipse cx="32" cy="20" rx="3" ry="4" fill="#333"/>
    <rect x="16" y="30" width="16" height="3" rx="1.5" stroke="#333" fill="#333"/>
</svg>`;
} else if (emoticon == 'frownface') {
  emoticon = `
<svg width="48" height="48" viewBox="0 0 48 48" style="margin:8px" xmlns="http://www.w3.org/2000/svg">
    <circle cx="24" cy="24" r="22" fill="${emoticon_fill}" stroke="${emoticon_stroke}" stroke-width="3"/>
    <ellipse cx="16" cy="20" rx="3" ry="4" fill="${emoticon_stroke}"/>
    <ellipse cx="32" cy="20" rx="3" ry="4" fill="${emoticon_stroke}"/>
    <path d="M16 36 Q24 28 32 36" stroke="${emoticon_stroke}" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;
}

// ====================================================================
// 5. ACTIVITY RECOMMENDATIONS
// ====================================================================
var activity_recommendation;
if (health_text == "Good") {
    activity_recommendation = "It’s a great day to be active outside!";
} else if (health_text == "Moderate") {
    activity_recommendation = `<div>Unusually sensitive people: Consider making outdoor activities shorter and less intense. Watch for symptoms such as coughing or shortness of breath.</div>`;
} else if (health_text == "Unhealthy for Sensitive Groups") {
    activity_recommendation = `<div><strong>Sensitive groups:</strong> Make <u>outdoor activities shorter and less intense</u>. It\'s OK to be active outdoors, but <u>take more breaks.</u> Watch for symptoms such as coughing or shortness of breath.</div>`;
} else if (health_text == "Unhealthy") {
    activity_recommendation = `<div><ul><li><strong>Sensitive groups: <u>Avoid long or intense outdoor activities</u>.</strong> Consider rescheduling or moving activities indoors.</li><li><strong>Everyone else: <u>Reduce long or intense activities</u></strong>. Take more breaks during outdoor activities.</li></ul></div>`;
} else if (health_text == "Very Unhealthy") {
    activity_recommendation = `<div><ul><li><strong>Sensitive groups: <u>Avoid all physical activity outdoors</u>.</strong> Reschedule or move indoors.</li><li><strong>Everyone else: <u>Avoid long or intense activities</u></strong>. Consider rescheduling or moving indoors.</li></ul></div>`;
} else if (health_text == "Hazardous") {
    activity_recommendation = `<div><ul><li><strong>Everyone: <u>Avoid all physical activity outdoors.</u></strong> Consider rescheduling or moving indoors.</li><li><strong>Sensitive groups: <u>Remain indoors</u> and keep activity levels low.</strong></li></ul></div>`;
}

// ====================================================================
// 6. POLLUTANTS MEASURED LINE (with AQI values)
// ====================================================================
var pollutants_line = '<span style="font-family: \'Trebuchet MS\', Arial, sans-serif; font-weight: bold;">Pollutants measured: ';

// ====================================================================
// 7. POLLUTANT DETAIL CARDS
// ====================================================================
var ozone_card = "";
var pm25_card = "";
var time_unit = "minutes";

/**
prettyDiffData
@param {number} minutes - age of data
@return {text} age of data formatted from minutes to hours/days/weeks, with 1 decimal place of precision
@example
// prettyDiffData(1440) returns 1 day
**/
function prettyDateDiff (minutes) {
    var converted_time = minutes;
    if(minutes > 10080) {
        time_unit = "weeks"
        converted_time = minutes/10080
    }
    else if(minutes > 1440) {
        time_unit = "days"
        converted_time = minutes/1440
    }
    else if(minutes > 59) {
        time_unit = "hours"
        converted_time = minutes/60
    }
    if(minutes == 1440) {
        time_unit = "day"
    }
    if(minutes == 60) {
        time_unit = "hour"
    }
    return Text(converted_time, "#.#");
}

function getBgColor (val) {
    return When(
        val < 50, "#f0fdf4",
        val < 100, "#fefce8", 
        val < 150, "#fef2f2", 
        val < 200, "#fecaca", 
        "#f8fafc",
        );
}

function getHeaderColor (val) {
    return When(
        val < 50, "#86efac",
        val < 100, "#fde047", 
        val < 150, "##fca5a5", 
        val < 200, "#fecaca", 
        "#f8fafc",
        );
}

if ($datapoint.capabilities == "Ozone" || $datapoint.capabilities == 'Both') {
    var last_seen_ozone = Abs(Floor(DateDiff($datapoint.last_seen_ozone, Now(), "minutes")));
    ozone_card = `
    <div stlye="display: flex; flex-direction: column;">
            <div style="background-color: ${getHeaderColor($datapoint.recent_ozone_aqi)}; padding: 4px 0px 4px 0px; border-radius: 4px 4px 0px 0px; text-align:center"><strong>Ozone</strong></div>

    <div style="background-color:  ${getBgColor($datapoint.recent_ozone_aqi)}; padding: 8px 4px; border-radius: 0px 0px 4px 4px; font-size: 12px; color: {expression/textColor}; text-align: left">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 4px;">
            <div><strong>AQI:</strong></div><div style="text-align:right;">${$datapoint.recent_ozone_aqi}</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 4px;">
            <div style="font-size: 0.7rem;"><strong>Concentration</strong></div><div style="text-align:right;">${$datapoint.recent_pm25} ppm</div>
        </div>
        <div style="font-size: 0.6rem; grid-column: span 2; margin-top: 6px;">
            Last Observation: ${prettyDateDiff(last_seen_ozone)} ${time_unit} ago
        </div>
    </div>
    </div>`;
}

if ($datapoint.capabilities == "PM2.5" || $datapoint.capabilities == "Both") {
    var last_seen_pm25 = Abs(Floor(DateDiff($datapoint.last_seen_pm25, Now(), "minutes")));
    pm25_card =  `
    <div stlye="display: flex; flex-direction: column;">
            <div style="background-color: ${getHeaderColor($datapoint.recent_pm25_aqi)}; padding: 4px 0px 4px 0px; border-radius: 4px 4px 0px 0px; text-align:center"><strong>PM2.5</strong></div>

    <div style="background-color: ${getBgColor($datapoint.recent_pm25_aqi)}; padding: 8px 4px; border-radius: 0px 0px 4px 4px; font-size: 12px; color: {expression/textColor}; text-align: left">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 4px;">
            <div><strong>AQI:</strong></div><div style="text-align:right;">${$datapoint.recent_pm25_aqi}</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-top: 4px;">
            <div style="font-size: 0.7rem;"><strong>Concentration</strong></div><div style="text-align:right;">${$datapoint.recent_pm25} ppm</div>
        </div>
        <div style="font-size: 0.6rem; grid-column: span 2; margin-top: 6px;">
            Last Observation: ${prettyDateDiff(last_seen_pm25)} ${time_unit} ago
        </div>
    </div>
    </div>`;
}


// ====================================================================
// 8. WRAPPER FOR DETAIL CARDS
// ====================================================================
var pollutant_cards = "";

if (ozone_card != "" && pm25_card != "") {
    pollutant_cards = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px;">
            ${ozone_card}
            ${pm25_card}
        </div>`;
} else if (ozone_card != "") {
    pollutant_cards = `<div style="margin-top: 12px;">${ozone_card}</div>`;
} else if (pm25_card != "") {
    pollutant_cards = `<div style="margin-top: 12px;">${pm25_card}</div>`;
}

// ====================================================================
// 9. RETURN OBJECT
// ====================================================================
return {
    textColor: textColorValue,
    backgroundColor: backgroundColorValue,
    attributes: {
        cardColorValue: cardColorValue,
        emoticon: emoticon,
        aqi: aqiValue,
        pollutants_line: pollutants_line,
        pollutant_cards: pollutant_cards,
        activity_recommendation: activity_recommendation,
        mainPollutant: dominantPollutant
    }
}
