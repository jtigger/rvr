var newColorSensorController = function (getColor) {
    function isMatching(spec) {
        var c = getColor();
        return c.r >= spec.r.value - spec.r.tolerance &&
            c.r <= spec.r.value + spec.r.tolerance &&
            c.g >= spec.g.value - spec.g.tolerance &&
            c.g <= spec.g.value + spec.g.tolerance &&
            c.b >= spec.b.value - spec.b.tolerance &&
            c.b <= spec.b.value + spec.b.tolerance;
    }

    var scan = {
        r: {min: 255, max: 0},
        g: {min: 255, max: 0},
        b: {min: 255, max: 0},
        enabled: false,
        count: 0
    };
    function takeScan(scanDelay) {
        if (scan.enabled) {
            c = getColor();
            if (!(c.r === 0 && c.g === 0 && c.b === 0)) {
                scan.r.min = Math.min(scan.r.min, c.r);
                scan.g.min = Math.min(scan.g.min, c.g);
                scan.b.min = Math.min(scan.b.min, c.b);
                scan.r.max = Math.max(scan.r.max, c.r);
                scan.g.max = Math.max(scan.g.max, c.g);
                scan.b.max = Math.max(scan.b.max, c.b);
                scan.count++;
            }
            setTimeout(takeScan, scanDelay, scanDelay);
        }
    }
    function startScanning(scanDelay) {
        if (scanDelay === undefined) {
            scanDelay = 100;
        }
        scan.enabled = true;
        scan.count = 0;
        takeScan(scanDelay);
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

    return {
        isMatching: isMatching,
        startScanning: startScanning,
        stopScanning: stopScanning,
        yieldColorSpec: yieldColorSpec
    }
};

var colorSensorCtrl = newColorSensorController(getColor);

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
