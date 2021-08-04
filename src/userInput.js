"use strict";

async function handleWebcam(data) {

    const alreadyWebcam = data.webcamImg !== null;

    let webcam;

    try {
        webcam = await navigator.mediaDevices.getUserMedia(
            {video: true, audio: false}
        );
    }
    catch (err) {
        return;
    }

    await new Promise(
        (resolve) => {
            data.el.video.addEventListener("loadeddata", resolve, {once: true});
            data.el.video.srcObject = webcam;
        }
    );

    await new Promise(
        (resolve) => {
            data.el.video.addEventListener("play", resolve, {once: true});
            data.el.video.play();
        }
    );

    data.el.video.pause();

    for (const track of webcam.getTracks()) {
        track.stop();
    }

    if (!alreadyWebcam) {
        const webcamOption = document.createElement("option");
        webcamOption.value = "Webcam";
        webcamOption.innerText = "Webcam";

        data.el.imgSource.appendChild(webcamOption);
    }

    for (const option of data.el.imgSource.options) {
        if (option.text === "Webcam") {
            option.selected = true;
            break;
        }
    }

    data.webcamImg = data.el.video;

    const imgSourceChange = new CustomEvent("change");

    data.el.imgSource.dispatchEvent(imgSourceChange);
}


async function handleUpload(data) {

    const alreadyCustom = data.customImg !== null;

    const filePath = data.el.filePicker.files[0];

    const imgSrc = await new Promise(
        function(resolve, reject) {

            const reader = new FileReader();

            reader.onload = () => resolve(reader.result);

            reader.readAsDataURL(filePath);
        }
    );

    const img = await new Promise(
        function(resolve) {
            const imgElement = new Image();
            imgElement.onload = () => resolve(imgElement);
            imgElement.src = imgSrc;
        }
    );

    data.customImg = img;

    if (!alreadyCustom) {
        const customOption = document.createElement("option");
        customOption.value = "Custom";
        customOption.innerText = "Custom";

        data.el.imgSource.appendChild(customOption);
    }

    for (const option of data.el.imgSource.options) {
        if (option.text === "Custom") {
            option.selected = true;
            break;
        }
    }

    const imgSourceChange = new CustomEvent("change");

    data.el.imgSource.dispatchEvent(imgSourceChange);

}


module.exports = {
    handleUpload: handleUpload,
    handleWebcam: handleWebcam,
};
