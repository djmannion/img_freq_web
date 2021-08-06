"use strict";

const SCI = {
    zeros: require("zeros"),
    ndarray: require("ndarray"),
    ops: require("ndarray-ops"),
    scratch: require("ndarray-scratch"),
};

const TRIGGERS = require("./triggers");

const UTILS = require("./utils");


async function handleTrigger({data, trigger} = {}) {

    if (trigger <= TRIGGERS.imgSource) {
        await setImageSource(data);
    }

    if (trigger <= TRIGGERS.imgWindow) {
        setImageWindow(data);
        setImageOutput(data);
        zeroCentreImage(data);
    }

}


async function setImageSource(data) {

    const imageSource = data.el.imgSource.value;

    let origImage;
    let width;
    let height;

    if (imageSource === "Custom") {
        origImage = data.customImg;
        width = origImage.width;
        height = origImage.height;
    }
    else if (imageSource === "Webcam") {
        origImage = data.webcamImg;
        width = origImage.videoWidth;
        height = origImage.videoHeight;
    }
    else {

        const sourceFilenames = {
            Dog: "dog.jpg",
            Landscape: "landscape.jpg",
            Beach: "ocean.jpg",
            "Sinusoidal grating (0°, low SF)": "grating_h_lf.png",
            "Sinusoidal grating (90°, low SF)": "grating_v_lf.png",
            "Sinusoidal grating (45°, low SF)": "grating_o_lf.png",
            "Sinusoidal grating (0°, mid SF)": "grating_h_mf.png",
            "Sinusoidal grating (0°, high SF)": "grating_h_hf.png",
            Plaid: "plaid.png",
        };

        const imagePath = `img/${sourceFilenames[imageSource]}`;

        const imageBlob = await (await fetch(imagePath)).blob();

        origImage = await new Promise(
            function(resolve) {
                const imgElement = new Image();
                imgElement.onload = () => resolve(imgElement);
                imgElement.src = URL.createObjectURL(imageBlob);
            }
        );

        width = origImage.width;
        height = origImage.height;
    }

    // want to resize so that the smallest dimension is `imgSize`; the other
    // dimension can then be cropped

    const minDim = Math.min(width, height);

    const resizedWidth = width / minDim * data.imgSize;
    const resizedHeight = height / minDim * data.imgSize;

    // draw to the (invisible) canvas
    data.el.context.offscreen.drawImage(
        origImage,
        0,
        0,
        width,
        height,
        0,
        0,
        resizedWidth,
        resizedHeight,
    );

    // the `data` field will hold the RGBA array
    const resizedImage = data.el.context.offscreen.getImageData(
        0, 0, data.imgSize, data.imgSize
    );

    // now to convert it into an RGB ndarray
    const imgArray = (
        SCI.ndarray(
            new Float64Array(resizedImage.data),
            [data.imgSize, data.imgSize, 4]
        ).hi(null, null, 3)
    );

    // now to [0, 1] range
    SCI.ops.divseq(imgArray, 255);
    // then to linear RGB
    UTILS.setSRGBToLinearRGB(imgArray);
    // then convert to luminance
    UTILS.setLinearRGBToLuminance(
        data.lumND,
        imgArray.pick(null, null, 0),
        imgArray.pick(null, null, 1),
        imgArray.pick(null, null, 2),
    );

}


function setImageOutput(data) {

    const presImage = UTILS.convertImageNDToImageData(
        SCI.scratch.clone(data.lumWindowedND),
        {normalise: false, toSRGB: true, toLightness: false},
    );

    data.el.context.image.putImageData(presImage, 0, 0);

}

function setImageWindow(data) {

    const applyWindow = data.el.applyWindow.checked;

    if (applyWindow) {

        const bgND = SCI.zeros(data.lumND.shape);

        SCI.ops.addseq(bgND, 0.5);

        UTILS.setBlendND(
            data.lumWindowedND, // output
            data.lumND, // src
            bgND, // dst
            data.apertureND, // alpha
        );

    }
    else {
        data.lumWindowedND = SCI.scratch.clone(data.lumND);
    }

}


function zeroCentreImage(data) {

    data.lumMean = UTILS.calcMean(data.lumWindowedND);

    // centre the luminance array
    SCI.ops.subseq(data.lumWindowedND, data.lumMean);

}


module.exports = handleTrigger;
