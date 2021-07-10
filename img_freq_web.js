"use strict";

const SCI = {
    ndarray: require("ndarray"),
    zeros: require("zeros"),
    cwise: require("cwise"),
    ops: require("ndarray-ops"),
    scratch: require("ndarray-scratch"),
    fft: require("ndarray-fft"),
    cops: require("ndarray-complex"),
    translate: require("ndarray-translate-fft"),
};

async function main() {

    const imgSize = 512;

    //const offscreenCanvas = document.createElement("canvas");
    //offscreenCanvas.width = imgSize;
    //offscreenCanvas.height = imgSize;
    const offscreenCanvas = document.getElementById("imageCanvas");
    const offscreenContext = offscreenCanvas.getContext("2d");

    const freqCanvas = document.getElementById("fftCanvas");
    const freqContext = freqCanvas.getContext("2d");

    let demoImageBlob = await (await fetch("img/demo_img.jpg")).blob();

    let [lumArray, lumMean] = await processImage(demoImageBlob);

    let absFreq = processFFT(lumArray, lumMean);

    return absFreq;

    async function processFFT(lumArray, lumMean) {

        let realArray = SCI.scratch.clone(lumArray);
        let imagArray = SCI.zeros(lumArray.shape);

        SCI.fft(+1, realArray, imagArray);

        let absFreq = SCI.zeros(lumArray.shape);

        SCI.cops.abs(absFreq, realArray, imagArray);

        // take the logarithm
        SCI.ops.logeq(absFreq);

        // get the maximum for normalisation purposes
        let max = SCI.ops.sup(absFreq);

        SCI.translate.wrap(absFreq, [imgSize / 2, imgSize / 2]);

        let absFreqImage = new ImageData(imgSize, imgSize);

        let iFlat = 0;

        for (let iRow = 0; iRow < imgSize; iRow++) {
            for (let iCol = 0; iCol < imgSize; iCol++) {
                let imgVal = absFreq.get(iRow, iCol) / max * 255;
                for (let iRGB = 0; iRGB < 3; iRGB++) {
                    absFreqImage.data[iFlat] = imgVal;
                    iFlat++;
                }
                absFreqImage.data[iFlat] = 255;
                iFlat++;
            }
        }

        freqContext.putImageData(absFreqImage, 0, 0);

        return absFreq;

    }

    async function processImage(image) {

        // `image` is any source that can be parsed by `createImageBitmap`

        // we don't know the dimensions or anything yet, so we first create a temporary
        // image bitmap so that we can get that info
        const origImage = await createImageBitmap(image);

        // want to resize so that the smallest dimension is `imgSize`; the other
        // dimension can then be cropped
        const minDim = Math.min(origImage.width, origImage.height);

        const resizedWidth = origImage.width / minDim * imgSize;
        const resizedHeight = origImage.height / minDim * imgSize;

        // draw to the (invisible) canvas
        offscreenContext.drawImage(
            origImage,
            0,
            0,
            origImage.width,
            origImage.height,
            0,
            0,
            resizedWidth,
            resizedHeight,
        );

        // the `data` field will hold the RGBA array
        const resizedImage = offscreenContext.getImageData(0, 0, imgSize, imgSize);

        // now to convert it into an RGB ndarray
        let imgArray = (
            SCI.ndarray(
                new Float64Array(resizedImage.data),
                [imgSize, imgSize, 4]
            ).hi(null, null, 3)
        );

        // now to [0, 1] range
        SCI.ops.divseq(imgArray, 255);

        // now map to linear
        sRGBtoLinear(imgArray);

        // then convert to luminance
        let lumArray = linearRGBtoLuminance(imgArray);

        // now for presentation, we need to convert it back into sRGB
        imgArray = SCI.scratch.clone(lumArray);
        linearTosRGB(imgArray);

        // and into [0, 255] range
        SCI.ops.mulseq(imgArray, 255);

        // now alter our image to be ready for display on a canvas
        let iFlat = 0;

        for (let iRow = 0; iRow < imgSize; iRow++) {
            for (let iCol = 0; iCol < imgSize; iCol++) {
                let pixVal = imgArray.get(iRow, iCol);
                for (let iRGB = 0; iRGB < 3; iRGB++) {
                    resizedImage.data[iFlat] = pixVal;
                    iFlat++;
                }
                resizedImage.data[iFlat] = 255;
                iFlat++;
            }
        }

        offscreenContext.putImageData(resizedImage, 0, 0);

        let lumMean = calcMean(lumArray);

        // centre the luminance array
        SCI.ops.subseq(lumArray, lumMean);

        return [lumArray, lumMean];
    }

}


function calcMean(array) {
    return SCI.ops.sum(array) / array.size;
}


function linearRGBtoLuminance(img) {

    // output array to fill
    let outImage = SCI.zeros(img.shape.slice(0, 2));

    const _linearRGBtoLuminance = SCI.cwise(
        {
            args: ["array", "array", "array", "array"],
            body: function (o, r, g, b) {
                o = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            },
        },
    );

    _linearRGBtoLuminance(
        outImage,
        img.pick(null, null, 0),
        img.pick(null, null, 1),
        img.pick(null, null, 2),
    );

    return outImage;

}

function sRGBtoLinear(img) {

    const _sRGBtoLinear = SCI.cwise(
        {
            args: ["array"],
            body: function (v) {
                if (v <= 0.04045) {
                    v /= 12.92;
                }
                else {
                    v = Math.pow((v + 0.055) / 1.055, 2.4);
                }
            },
        },
    );

    return _sRGBtoLinear(img);
}


function linearTosRGB(img) {

    const _linearTosRGB = SCI.cwise(
        {
            args: ["array"],
            body: function (v) {
                if (v <= 0.0031308) {
                    v *= 12.92;
                }
                else {
                    v = 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
                }
            },
        },
    );

    return _linearTosRGB(img);
}

module.exports = [main, sRGBtoLinear, linearTosRGB];

window.addEventListener("load", main);
