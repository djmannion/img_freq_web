"use strict";

const SCI = {
    ndarray: require("ndarray"),
    scratch: require("ndarray-scratch"),
    zeros: require("zeros"),
    fft: require("ndarray-fft"),
    cops: require("ndarray-complex"),
    toPolar: require("ndarray-log-polar"),
};

const TRIGGERS = require("./triggers");

const UTILS = require("./utils");


function handleTrigger({data, trigger} = {}) {

    if (trigger <= TRIGGERS.imgWindow) {
        calcFFT(data);
        setFFTOutput(data);
    }

    if (trigger === TRIGGERS.axesChange || trigger === TRIGGERS.sfPlot) {
        setFFTOutput(data);
    }

}


function calcFFT(data) {

    data.fRealND = SCI.scratch.clone(data.lumWindowedND);
    data.fImagND = SCI.zeros(data.imgDim);

    SCI.fft(+1, data.fRealND, data.fImagND);

    SCI.cops.abs(data.fAbsND, data.fRealND, data.fImagND);

    data.fAbsShiftedND = UTILS.calcFFTShift(data.fAbsND);

    SCI.toPolar(data.fAbsPolarND, data.fAbsShiftedND);

    data.fAbsPolarND = data.fAbsPolarND.transpose(1, 0);

    data.fSFAmpArray = UTILS.calcColumnMean(data.fAbsPolarND);

}

function setFFTOutput(data) {

    let displayImage;

    if (data.el.specAxes.value === "Cartesian") {

        const zoomFactor = Number(data.el.zoom.value[0]);

        displayImage = UTILS.convertImageNDToImageData(
            SCI.scratch.clone(data.fAbsShiftedND),
            {normalise: true, toSRGB: true, toLightness: true, zoomFactor: zoomFactor},
        );

    }
    else {

        displayImage = UTILS.convertImageNDToImageData(
            SCI.scratch.clone(data.fAbsPolarND),
            {normalise: true, toSRGB: true, toLightness: true},
        );

    }

    data.el.context.amp.putImageData(
        displayImage,
        0,
        0,
    );

    if (data.el.specAxes.value === "Log-polar" && data.el.sfPlotActive.checked) {

        const logND = SCI.ndarray(data.fSFAmpArray.map(Math.log));
        UTILS.setNormaliseND(logND, {newMax: data.ampMeanMax});

        data.el.context.amp.beginPath();

        data.el.context.amp.moveTo(0, data.imgSize - logND.get(0) * data.imgSize);

        for (let iCol = 1; iCol < data.imgSize; iCol++) {
            data.el.context.amp.lineTo(
                iCol,
                data.imgSize - logND.get(iCol) * data.imgSize,
            );
        }

        data.el.context.amp.stroke();
        data.el.context.amp.closePath();

    }

}


module.exports = handleTrigger;
