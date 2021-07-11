"use strict";

const SCI = {
    ndarray: require("ndarray"),
    zeros: require("zeros"),
    cwise: require("cwise"),
    ops: require("ndarray-ops"),
    scratch: require("ndarray-scratch"),
    fft: require("ndarray-fft"),
    cops: require("ndarray-complex"),
};

async function main() {

    const imgSize = 512;

    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = imgSize;
    offscreenCanvas.height = imgSize;
    const offscreenContext = offscreenCanvas.getContext("2d");

    const imageCanvas = document.getElementById("imageCanvas");
    const imageContext = imageCanvas.getContext("2d");

    const freqCanvas = document.getElementById("fftCanvas");
    const freqContext = freqCanvas.getContext("2d");

    const filterCanvas = document.getElementById("filterCanvas");
    const filterContext = filterCanvas.getContext("2d");

    const outputCanvas = document.getElementById("outputCanvas");
    const outputContext = outputCanvas.getContext("2d");

    let imgPath = "img/joe.jpg";

    let demoImageBlob = await (await fetch(imgPath)).blob();

    let [lumArray, lumMean] = await processImage(demoImageBlob);

    let [realArray, imagArray] = processFFT(lumArray, lumMean);

    let filterArray = processFilter();

    let outputArray = processOutput(realArray, imagArray, filterArray);

    return [realArray, imagArray, filterArray];

    function processOutput(realArray, imagArray, filterArray) {

        SCI.ops.muleq(realArray, filterArray);
        SCI.ops.muleq(imagArray, filterArray);

        SCI.fft(-1, realArray, imagArray);

        normalise(realArray);

        let outputImage = new ImageData(imgSize, imgSize);

        let iFlat = 0;

        for (let iRow = 0; iRow < imgSize; iRow++) {
            for (let iCol = 0; iCol < imgSize; iCol++) {
                let imgVal = realArray.get(iRow, iCol) * 255;
                for (let iRGB = 0; iRGB < 3; iRGB++) {
                    outputImage.data[iFlat] = imgVal;
                    iFlat++;
                }
                outputImage.data[iFlat] = 255;
                iFlat++;
            }
        }

        outputContext.putImageData(outputImage, 0, 0);
        return realArray;

    }

    function processFilter() {

        let distArray = SCI.zeros([imgSize, imgSize]);

        for (let iRow = 0; iRow < imgSize; iRow++) {
            for (let iCol = 0; iCol < imgSize; iCol++) {
                let dist = Math.sqrt(
                    Math.pow(iRow - imgSize / 2, 2)
                    + Math.pow(iCol - imgSize / 2, 2)
                ) / (imgSize / 2);
                distArray.set(iRow, iCol, dist);
            }
        }

        const filtR = 0.1;

        let filtArray = SCI.zeros([imgSize, imgSize]);

        const prepFilter = SCI.cwise(
            {
                args: ["array", "array", "scalar"],
                body: function (filt, dist, thresh) {
                    if (dist < thresh) {
                        filt = 1;
                    }
                    else {
                        filt = 0;
                    }
                },
            },
        );

        prepFilter(filtArray, distArray, filtR);

        let filterImage = new ImageData(imgSize, imgSize);

        let iFlat = 0;

        for (let iRow = 0; iRow < imgSize; iRow++) {
            for (let iCol = 0; iCol < imgSize; iCol++) {
                let imgVal = filtArray.get(iRow, iCol) * 255;
                for (let iRGB = 0; iRGB < 3; iRGB++) {
                    filterImage.data[iFlat] = imgVal;
                    iFlat++;
                }
                filterImage.data[iFlat] = 255;
                iFlat++;
            }
        }

        filterContext.putImageData(filterImage, 0, 0);

        filtArray = fftshift(filtArray);

        return filtArray;

    }

    function processFFT(lumArray, lumMean) {

        let realArray = SCI.scratch.clone(lumArray);
        let imagArray = SCI.zeros(lumArray.shape);

        SCI.fft(+1, realArray, imagArray);

        let absFreq = SCI.zeros(lumArray.shape);

        SCI.cops.abs(absFreq, realArray, imagArray);

        absFreq = fftshift(absFreq);

        // normalise to [0, 1]
        normalise(absFreq);

        // convert to 'lightness'
        linearToLightness(absFreq);
        // convert to sRGB
        linearTosRGB(absFreq);

        let absFreqImage = new ImageData(imgSize, imgSize);

        let iFlat = 0;

        for (let iRow = 0; iRow < imgSize; iRow++) {
            for (let iCol = 0; iCol < imgSize; iCol++) {
                let imgVal = absFreq.get(iRow, iCol) * 255;
                for (let iRGB = 0; iRGB < 3; iRGB++) {
                    absFreqImage.data[iFlat] = imgVal;
                    iFlat++;
                }
                absFreqImage.data[iFlat] = 255;
                iFlat++;
            }
        }

        freqContext.putImageData(absFreqImage, 0, 0);

        return [realArray, imagArray];

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

        let winArray = makeWindow(imgSize);

        lumArray = blend(lumArray, winArray);

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

        imageContext.putImageData(resizedImage, 0, 0);

        let lumMean = calcMean(lumArray);

        // centre the luminance array
        SCI.ops.subseq(lumArray, lumMean);

        return [lumArray, lumMean];
    }

}


function calcMean(array) {
    return SCI.ops.sum(array) / array.size;
}


function makeDistanceArray(imgSize) {

    let distArray = SCI.zeros([imgSize, imgSize]);

    let halfSize = imgSize / 2;

    for (let iRow = 0; iRow < imgSize; iRow++) {
        for (let iCol = 0; iCol < imgSize; iCol++) {
            let dist = Math.sqrt(
                Math.pow(iRow - halfSize, 2)
                + Math.pow(iCol - halfSize, 2)
            ) / halfSize;
            distArray.set(iRow, iCol, dist);
        }
    }

    return distArray;

}


function makeWindow(imgSize, innerProp = 0, outerProp = 1, winProp = 0.1, distArray) {

    distArray = distArray ?? makeDistanceArray(imgSize);

    let winArray = SCI.zeros([imgSize, imgSize]);

    for (let iRow = 0; iRow < imgSize; iRow++) {
        for (let iCol = 0; iCol < imgSize; iCol++) {

            let dist = distArray.get(iRow, iCol);

            if (dist < outerProp) {
                winArray.set(iRow, iCol, 1);
            }

        }
    }

    return winArray;

}


function fftshift(array) {

    let outArray = SCI.zeros(array.shape);

    const imgSize = array.shape[0];

    const halfSize = imgSize / 2;

    for (let iSrcRow = 0; iSrcRow < imgSize; iSrcRow++) {
        for (let iSrcCol = 0; iSrcCol < imgSize; iSrcCol++) {

            let iDstRow, iDstCol;

            if (iSrcRow < halfSize) {
                iDstRow = halfSize + iSrcRow;
            }
            else {
                iDstRow = iSrcRow - halfSize;
            }

            if (iSrcCol < halfSize) {
                iDstCol = halfSize + iSrcCol;
            }
            else {
                iDstCol = iSrcCol - halfSize;
            }

            outArray.set(iDstRow, iDstCol, array.get(iSrcRow, iSrcCol));

        }
    }

    return outArray;
}


function blend(srcArray, winArray) {

    let outputArray = SCI.zeros(srcArray.shape);

    const _blend = SCI.cwise(
        {
            args: ["array", "array", "array"],
            body: function (output, src, win) {
                output = (src * win) + (0.5 * (1 - win));
            },
        },
    );

    _blend(outputArray, srcArray, winArray);

    return outputArray;

}


function normalise(array, oldMin, oldMax, newMin = 0, newMax = 1) {

    oldMin = oldMin ?? SCI.ops.inf(array);
    oldMax = oldMax ?? SCI.ops.sup(array);

    const _convert = SCI.cwise(
        {
            args: ["array", "scalar", "scalar", "scalar", "scalar"],
            body: function (o, oldMin, oldMax, newMin, newMax) {
                o = (
                    (
                        (o - oldMin) * (newMax - newMin)
                    ) / (oldMax - oldMin)
                ) + newMin;
            },
        },
    );

    _convert(array, oldMin, oldMax, newMin, newMax);

}


function clip(array, min, max) {

    const _clip = SCI.cwise(
        {
            args: ["array", "scalar", "scalar"],
            body: function (o, clipMin, clipMax) {
                if (o < clipMin) {
                    o = clipMin;
                }
                else if (o > clipMax) {
                    o = clipMax;
                }
            }
        },
    );

    _clip(array, min, max);

}


function linearToLightness(img) {
    // 'lightness' not really

    const _linearToLightness = SCI.cwise(
        {
            args: ["array"],
            body: function (o) {
                if (o <= 0.008856) {
                    o *= 903.3;
                }
                else {
                    o = Math.pow(o, 1 / 3) * 116 - 16;
                }
                o /= 100.0;
            },
        },
    );

    _linearToLightness(img);
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
