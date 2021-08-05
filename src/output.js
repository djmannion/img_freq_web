"use strict";

const SCI = {
    scratch: require("ndarray-scratch"),
    ops: require("ndarray-ops"),
    fft: require("ndarray-fft"),
};

const TRIGGERS = require("./triggers");

const UTILS = require("./utils");


async function handleTrigger({data, trigger} = {}) {

    if (trigger <= TRIGGERS.filtSet && trigger !== TRIGGERS.filtChange) {
        calcOutput(data);
    }

}


function calcOutput(data) {

    const oRealND = SCI.scratch.clone(data.fRealND);
    const oImagND = SCI.scratch.clone(data.fImagND);

    SCI.ops.muleq(oRealND, data.filterND);
    SCI.ops.muleq(oImagND, data.filterND);

    SCI.fft(-1, oRealND, oImagND);

    SCI.ops.addseq(oRealND, data.lumMean);

    UTILS.setClipND(oRealND, 0, 1);

    const outputImage = UTILS.convertImageNDToImageData(
        oRealND,
        {normalise: false, toSRGB: true, toLightness: false},
    );

    data.el.context.output.putImageData(
        outputImage,
        0,
        0,
    );

}


module.exports = handleTrigger;
