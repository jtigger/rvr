// newColorSensorController returns a wrapper around the RVR color sensor
//   getColor = the global `getColor()` RVR function
//   config = {
//      stability (int; 20) = how consistently the color sensor is reporting a given value until it gets reported
//         by `getColor()`.  Smaller values make the controller more sensitive; larger values makes it more stable.
//      sampleFrequency (number; 10) = approximately how frequently color samples should be asynchronously taken in a
//         second (i.e. in Hz).  If 0, disables automatic sampling -- samples will only be collected during calls to
//         `getColor()`.
//   }
var newColorSensorController = function (getColor, config) {
    config = config || {};
    config.stability = (config.stability === undefined) ? 20 : config.stability;
    config.sampleFrequency = (config.sampleFrequency === undefined) ? 10 : config.sampleFrequency;

    function average(colors) {
        var avg = {r: 0, g: 0, b: 0};
        for (var idx = 0; idx < colors.length; idx++) {
            avg.r += colors[idx].r;
            avg.g += colors[idx].g;
            avg.b += colors[idx].b;
        }
        avg.r /= colors.length;
        avg.g /= colors.length;
        avg.b /= colors.length;

        return avg;
    }

    function standardDeviation(colors) {
        var avg = average(colors);

        var stdev = {r: 0, g: 0, b: 0};
        for (var idx = 0; idx < colors.length; idx++) {
            stdev.r += (avg.r - colors[idx].r) * (avg.r - colors[idx].r);
            stdev.g += (avg.g - colors[idx].g) * (avg.g - colors[idx].g);
            stdev.b += (avg.b - colors[idx].b) * (avg.b - colors[idx].b);
        }
        stdev.r = Math.sqrt(stdev.r / colors.length);
        stdev.g = Math.sqrt(stdev.g / colors.length);
        stdev.b = Math.sqrt(stdev.b / colors.length);

        return stdev;
    }

    function isMatching(spec) {
        var c = getStableColor();
        return c.r >= spec.r.value - spec.r.tolerance &&
            c.r <= spec.r.value + spec.r.tolerance &&
            c.g >= spec.g.value - spec.g.tolerance &&
            c.g <= spec.g.value + spec.g.tolerance &&
            c.b >= spec.b.value - spec.b.tolerance &&
            c.b <= spec.b.value + spec.b.tolerance;
    }

    var rawColorLog = [];
    var avgColorLog = [];
    var lastColor = {r: 0, g: 0, b: 0};

    function collectSample(freq) {
        if (freq !== 0) {
            getStableColor();
            setTimeout(collectSample, 1000/freq, freq);
        }
    }

    function getStableColor() {
        var stableColor = lastColor;

        rawColorLog.push(getColor());
        var currAvgColor = average(rawColorLog);
        avgColorLog.push(currAvgColor);

        if (avgColorLog.length === config.stability) {
            var stdev = standardDeviation(avgColorLog);

            stableColor.r = (stdev.r < 2.9) ? Math.round(currAvgColor.r) : lastColor.r;
            stableColor.g = (stdev.g < 2.9) ? Math.round(currAvgColor.g) : lastColor.g;
            stableColor.b = (stdev.b < 2.9) ? Math.round(currAvgColor.b) : lastColor.b;
            lastColor = stableColor;

            rawColorLog.shift();
            avgColorLog.shift();
        }

        lastColor = stableColor;
        return stableColor;
    }

    var scan = {
        r: {min: 255, max: 0},
        g: {min: 255, max: 0},
        b: {min: 255, max: 0},
        enabled: false,
        count: 0
    };

    function takeScan(scanFrequency) {
        if (scan.enabled) {
            c = getStableColor();
            if (!(c.r === 0 && c.g === 0 && c.b === 0)) {
                scan.r.min = Math.min(scan.r.min, c.r);
                scan.g.min = Math.min(scan.g.min, c.g);
                scan.b.min = Math.min(scan.b.min, c.b);
                scan.r.max = Math.max(scan.r.max, c.r);
                scan.g.max = Math.max(scan.g.max, c.g);
                scan.b.max = Math.max(scan.b.max, c.b);
                scan.count++;
            }
            setTimeout(takeScan, 1000/scanFrequency, scanFrequency);
        }
    }

    function startScanning(scanFrequency) {
        if (scanFrequency === undefined) {
            scanFrequency = 10;
        }
        scan.enabled = true;
        scan.count = 0;
        takeScan(scanFrequency);
    }

    function stopScanning() {
        scan.enabled = false;
    }

    function yieldColorSpec() {
        var spec = {
            r: {value: Math.round((scan.r.max + scan.r.min) / 2), tolerance: 0},
            g: {value: Math.round((scan.g.max + scan.g.min) / 2), tolerance: 0},
            b: {value: Math.round((scan.b.max + scan.b.min) / 2), tolerance: 0},
            count: scan.count
        };
        spec.r.tolerance = Math.max(scan.r.max - spec.r.value, spec.r.value - scan.r.min);
        spec.g.tolerance = Math.max(scan.g.max - spec.g.value, spec.g.value - scan.g.min);
        spec.b.tolerance = Math.max(scan.b.max - spec.b.value, spec.b.value - scan.b.min);
        return spec;
    }

    collectSample(config.sampleFrequency);
    return {
        isMatching: isMatching,
        startScanning: startScanning,
        stopScanning: stopScanning,
        yieldColorSpec: yieldColorSpec,
        getColor: getStableColor
    }
};

var colorSensorCtrl = newColorSensorController(getColor, {stability: 1, sampleFrequency: 5});


var kitchenTileSpec = {};
var woodFloorSpec = {};
var carpetSpec = {};

async function startProgram() {
    colorSensorCtrl.startScanning();
    await delay(10);

    var spec = colorSensorCtrl.yieldColorSpec();
    for(idx = 0; idx < 2; idx++) {
        await speak("From " + spec.count + " samples.");
        await speak("red: " + spec.r.value + "; delta " + spec.r.tolerance + "..");
        await speak("green: " + spec.g.value + "; delta " + spec.g.tolerance + "..");
        await speak("blue: " + spec.b.value + "; delta " + spec.b.tolerance + "..");
        await delay(5);
    }
}
