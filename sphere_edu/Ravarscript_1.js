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
    var stableColor = {r: 0, g: 0, b: 0};

    function getStableColor() {
        if (config.sampleFrequency === 0) {
            collectSample();
        }
        return stableColor;
    }

    function collectSamples(freq) {
        if (freq !== 0) {
            collectSample();
            setTimeout(collectSamples, 1000/freq, freq);
        }
    }

    function collectSample() {
        var color = stableColor;

        rawColorLog.push(getColor());
        var currAvgColor = average(rawColorLog);
        avgColorLog.push(currAvgColor);

        if (avgColorLog.length === config.stability) {
            var stdev = standardDeviation(avgColorLog);

            color.r = (stdev.r < 2.9) ? Math.round(currAvgColor.r) : stableColor.r;
            color.g = (stdev.g < 2.9) ? Math.round(currAvgColor.g) : stableColor.g;
            color.b = (stdev.b < 2.9) ? Math.round(currAvgColor.b) : stableColor.b;
            stableColor = color;

            rawColorLog.shift();
            avgColorLog.shift();
        }

        stableColor = color;
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

    collectSamples(config.sampleFrequency);
    return {
        isMatching: isMatching,
        startScanning: startScanning,
        stopScanning: stopScanning,
        yieldColorSpec: yieldColorSpec,
        getColor: getStableColor
    }
};


var kitchenTileSpec = {
    r: {value: 236, tolerance: 20},
    g: {value: 220, tolerance: 20},
    b: {value: 202, tolerance: 20}
}

var woodFloorSpec = {
    r: {value: 86, tolerance: 35},
    g: {value: 68, tolerance: 30},
    b: {value: 22, tolerance: 20}
};

var carpetSpec = {
    r: {value: 98, tolerance: 14},
    g: {value: 91, tolerance: 13},
    b: {value: 65, tolerance: 15}
};

var orangePaperSpec = {
    r: {value: 255, tolerance: 5},
    g: {value: 100, tolerance: 5},
    b: {value: 40, tolerance: 5}
};

var greenPaperSpec = {
    r: {value: 64, tolerance: 5},
    g: {value: 194, tolerance: 5},
    b: {value: 92, tolerance: 5}
}

var yellowSwatchSpec = {
    r: {value: 255, tolerance: 5},
    g: {value: 240, tolerance: 5},
    b: {value: 26, tolerance: 5}
}


async function startProgram() {
    resetAim();
    var colorSensorCtrl = newColorSensorController(getColor, {stability: 5, sampleFrequency: 250});
    openEyes();
    await delay(5);
    lookForGold(colorSensorCtrl);
    wanderOnWood(colorSensorCtrl);
    // scanForColor(colorSensorCtrl);
}

var eyeState = {
    lids: "closed",
    mode: "looking",
    targetBlinks: 0,
    blinks: 0
}

function openEyes() {
    setFrontLed({r: 255, g: 255, b: 255});
    eyeState.lids = "opened";
    setTimeout(closeEyes, (eyeState.mode === "looking") ? (3 + Math.random()*3) * 1000 : 190);
}

function closeEyes() {
    setFrontLed({r: 0, g: 0, b: 0});
    eyeState.lids = "closed";

    if(eyeState.mode === "looking") {
        eyeState.mode = "blinking";
        eyeState.blinks = 0;
        eyeState.targetBlinks = Math.round(Math.random()*2);
    } else {
        eyeState.blinks++;
        if(eyeState.blinks >= eyeState.targetBlinks) {
            eyeState.mode = "looking";
        }
    }

    setTimeout(openEyes, 210);
}


function setBodyLed(color) {
    setBackLed(color);
    setLeftLed(color);
    setRightLed(color);
}

var state = "standing";
var running = true;

async function lookForGold(colorSensorCtrl) {
    if(colorSensorCtrl.isMatching(yellowSwatchSpec)) {
        running = false;
        setBodyLed({r: 255, g:240, b: 25});
        await roll(getHeading(), -30, 1);
        await speak("Gold!  I found gold!");
        return;
    }
    setTimeout(lookForGold, 10, colorSensorCtrl);
}

async function wanderOnWood(colorSensorCtrl) {
    if (!running) { return; }
    if(colorSensorCtrl.isMatching(woodFloorSpec)) {
        if (state !== "wandering") {
            setBodyLed({r:0, g: 0, b: 255});
            setSpeed(30);
            state = "wandering";
        }
    } else {
        if (state === "wandering") {
            backOff(colorSensorCtrl);
        }
    }
    setTimeout(wanderOnWood, 10, colorSensorCtrl);
}

async function backOff(colorSensorCtrl) {
    if (!running) { return; }
    if (!colorSensorCtrl.isMatching(woodFloorSpec)) {
        if (state !== "backing off") {
            setBodyLed({r: 255, g: 0, b: 0});
            setSpeed(-1 * getSpeed());
            state = "backing off";
        }
    } else {
        if (state === "backing off") {
            setBodyLed({r: 255, g: 240, b: 25});
            setHeading((getHeading()+180) +
                (-45 + (Math.random() * 90)) %
                360);
            setSpeed(-1 * getSpeed());
            state = "about face";
            wanderOnWood(colorSensorCtrl);
        }
    }

    setTimeout(backOff, 10, colorSensorCtrl);
}


function showColor(colorSensorCtrl) {
    setMainLed(colorSensorCtrl.getColor());
    setTimeout(showColor, 10, colorSensorCtrl);
}


async function speakSpaces(colorSensorCtrl) {

    while(true) {
        if (colorSensorCtrl.isMatching(carpetSpec)) {
            await speak("carpet");
        }
        if (colorSensorCtrl.isMatching(woodFloorSpec)) {
            await speak("wood");
        }
        if (colorSensorCtrl.isMatching(kitchenTileSpec)) {
            await speak("tile");
        }
        await delay(0.1);
    }
}

async function scanForColor(colorSensorCtrl) {
    colorSensorCtrl.startScanning(10);

    await wiggleOverSwatch();

    var count = colorSensorCtrl.stopScanning();
    var spec = colorSensorCtrl.yieldColorSpec();
    while(true) {
        setMainLed({r: 255, g:255, b:255});
        await speak("From " + count + " samples.");

        setMainLed({r: spec.r.value, g:0, b:0});
        await speak("red: " + spec.r.value + "; delta " + spec.r.tolerance + "..");

        setMainLed({r: 0, g:spec.g.value, b:0});
        await speak("green: " + spec.g.value + "; delta " + spec.g.tolerance + "..");

        setMainLed({r: 0, g:0, b:spec.b.value});
        await speak("blue: " + spec.b.value + "; delta " + spec.b.tolerance + "..");

        setMainLed({r: 0, g:0, b:0});
        await delay(5);
    }
}

async function walkTheLine() {
    resetAim();
    await roll(0, 40, 3);
    await delay(2);
    await roll(1, -40, 3);
}

async function wiggleOverSwatch() {
    resetAim();
    for(var idx = 0; idx < 5; idx++) {
        await roll(0, 10, 2);
        await roll(0, -10, 2);
    }
}

async function rollInARectangle() {
    resetAim();
    await roll(0, 40, 8);
    await roll(90, 40, 4);
    await roll(180, 40, 8);
    await roll(270, 40, 4);
    setHeading(0);
}